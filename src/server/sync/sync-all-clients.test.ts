import { and, eq, inArray } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clients,
  syncRuns,
  users,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import type { GhlConfig } from "~/server/ghl/env";
import {
  syncAllClients,
  SyncAlreadyRunningError,
} from "~/server/sync/sync-all-clients";
import { processPendingSyncTargets } from "~/server/sync/sync-worker";
import { WindsorClient } from "~/server/windsor/client";

const userId = "sync-orchestrator-test-user";
const configuredSlugs = [
  "tint-lab",
  "diamond-auto-restoration",
  "resumable-sync-client",
];
const ghlConfig: GhlConfig = {
  baseUrl: new URL("https://ghl.example"),
  mappings: [
    {
      clientSlug: "tint-lab",
      clientName: "Tint Lab",
      locationId: "tint-location",
      token: "tint-token",
    },
    {
      clientSlug: "diamond-auto-restoration",
      clientName: "Diamond Auto Restoration",
      locationId: "diamond-location",
      token: "diamond-token",
    },
  ],
};
const emptyWindsor = new WindsorClient(
  {
    WINDSOR_API_KEY: "test-key",
    WINDSOR_DATA_BASE_URL: "https://windsor-data.example",
    WINDSOR_ONBOARD_BASE_URL: "https://windsor-onboard.example",
  },
  vi.fn<typeof fetch>().mockResolvedValue(Response.json([])),
);
const emptyGhl = new GhlClient(
  ghlConfig.baseUrl,
  vi.fn<typeof fetch>().mockImplementation((request) => {
    const url = new URL(
      request instanceof URL
        ? request.href
        : typeof request === "string"
          ? request
          : request.url,
    );
    const locationId = url.pathname.split("/").at(-1);
    return Promise.resolve(
      url.pathname.startsWith("/locations/")
        ? Response.json({
            location: { id: locationId, timezone: "America/New_York" },
          })
        : Response.json({ opportunities: [], meta: {} }),
    );
  }),
);

describe("syncAllClients", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      name: "Sync Orchestrator Test",
      email: "sync-orchestrator-test@example.com",
      role: "owner",
      status: "active",
    });
  });

  afterEach(async () => {
    const providerRuns = await db
      .select({ id: allClientSyncRuns.windsorSyncRunId })
      .from(allClientSyncRuns)
      .where(eq(allClientSyncRuns.requestedByUserId, userId));
    await db
      .delete(allClientSyncRuns)
      .where(eq(allClientSyncRuns.requestedByUserId, userId));
    const providerRunIds = providerRuns.flatMap(({ id }) => (id ? [id] : []));
    if (providerRunIds.length > 0) {
      await db.delete(syncRuns).where(inArray(syncRuns.id, providerRunIds));
    }
    await db.delete(clients).where(inArray(clients.slug, configuredSlugs));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it("rejects a concurrent running parent", async () => {
    const [running] = await db
      .insert(allClientSyncRuns)
      .values({ requestedByUserId: userId })
      .returning({ id: allClientSyncRuns.id });
    await expect(
      syncAllClients(userId, {
        windsorClient: emptyWindsor,
        ghlConfig,
      }),
    ).rejects.toBeInstanceOf(SyncAlreadyRunningError);
    if (running) {
      await db
        .delete(allClientSyncRuns)
        .where(eq(allClientSyncRuns.id, running.id));
    }
  });

  it("enqueues provider work without waiting for GHL requests", async () => {
    const [client] = await db
      .insert(clients)
      .values({
        slug: "resumable-sync-client",
        name: "Resumable Sync Client",
        status: "active",
      })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create resumable sync test client");
    const queuedGhlConfig: GhlConfig = {
      baseUrl: new URL("https://ghl.example"),
      mappings: [
        {
          clientSlug: "resumable-sync-client",
          clientName: "Resumable Sync Client",
          locationId: "resumable-location",
          token: "resumable-token",
        },
      ],
    };

    const result = await syncAllClients(userId, {
      windsorClient: emptyWindsor,
      ghlConfig: queuedGhlConfig,
    });

    expect(result.status).toBe("running");
    expect(
      result.targets.find((target) => target.provider === "ghl")?.status,
    ).toBe("pending");
  });

  it("recovers stale targets and never provisions configured clients", async () => {
    await db.delete(clients).where(inArray(clients.slug, configuredSlugs));
    const staleAt = new Date(Date.now() - 20 * 60 * 1000);
    const [staleProviderRun] = await db
      .insert(syncRuns)
      .values({ dataProvider: "windsor", startedAt: staleAt })
      .returning({ id: syncRuns.id });
    if (!staleProviderRun) {
      throw new Error("Could not create stale provider test run");
    }
    const [staleRun] = await db
      .insert(allClientSyncRuns)
      .values({
        requestedByUserId: userId,
        startedAt: staleAt,
        heartbeatAt: staleAt,
        windsorSyncRunId: staleProviderRun.id,
      })
      .returning({ id: allClientSyncRuns.id });
    if (!staleRun) throw new Error("Could not create stale test run");
    const [staleTarget] = await db
      .insert(allClientSyncTargets)
      .values({
        runId: staleRun.id,
        clientSlug: "stale-client",
        clientName: "Stale Client",
        provider: "windsor",
      })
      .returning({ id: allClientSyncTargets.id });
    if (!staleTarget) throw new Error("Could not create stale test target");

    const result = await syncAllClients(userId, {
      windsorClient: emptyWindsor,
      ghlConfig,
    });
    expect(result.status).toBe("running");
    expect(result.targets).toHaveLength(2);
    expect(result.targets.every((target) => target.status === "failed")).toBe(
      true,
    );
    await processPendingSyncTargets(
      { runId: result.id, maxChunks: 1 },
      {
        windsorClient: emptyWindsor,
        ghlConfig,
        ghlClient: emptyGhl,
      },
    );

    const [completedRun] = await db
      .select({ status: allClientSyncRuns.status })
      .from(allClientSyncRuns)
      .where(eq(allClientSyncRuns.id, result.id));
    const [recoveredRun] = await db
      .select({ status: allClientSyncRuns.status })
      .from(allClientSyncRuns)
      .where(eq(allClientSyncRuns.id, staleRun.id));
    const [recoveredTarget] = await db
      .select({ status: allClientSyncTargets.status })
      .from(allClientSyncTargets)
      .where(
        and(
          eq(allClientSyncTargets.id, staleTarget.id),
          eq(allClientSyncTargets.runId, staleRun.id),
        ),
      );
    expect(completedRun?.status).toBe("failed");
    expect(recoveredRun?.status).toBe("failed");
    expect(recoveredTarget?.status).toBe("failed");
    const [recoveredProviderRun] = await db
      .select({ status: syncRuns.status })
      .from(syncRuns)
      .where(eq(syncRuns.id, staleProviderRun.id));
    expect(recoveredProviderRun?.status).toBe("failed");
    const configuredClients = await db
      .select({ id: clients.id })
      .from(clients)
      .where(inArray(clients.slug, configuredSlugs));
    expect(configuredClients).toEqual([]);
    await db.delete(syncRuns).where(eq(syncRuns.id, staleProviderRun.id));
  });
});
