import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clients,
  users,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import type { GhlConfig } from "~/server/ghl/env";
import {
  syncAllClients,
  SyncAlreadyRunningError,
} from "~/server/sync/sync-all-clients";
import { WindsorClient } from "~/server/windsor/client";

const userId = "sync-orchestrator-test-user";
const configuredSlugs = ["tint-lab", "diamond-auto-restoration"];
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
  vi
    .fn<typeof fetch>()
    .mockImplementation(() =>
      Promise.resolve(Response.json({ opportunities: [], meta: {} })),
    ),
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

  afterAll(async () => {
    await db
      .delete(allClientSyncRuns)
      .where(eq(allClientSyncRuns.requestedByUserId, userId));
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
        ghlClient: emptyGhl,
      }),
    ).rejects.toBeInstanceOf(SyncAlreadyRunningError);
    if (running) {
      await db
        .delete(allClientSyncRuns)
        .where(eq(allClientSyncRuns.id, running.id));
    }
  });

  it("recovers stale targets and never provisions configured clients", async () => {
    await db.delete(clients).where(inArray(clients.slug, configuredSlugs));
    const staleAt = new Date(Date.now() - 20 * 60 * 1000);
    const [staleRun] = await db
      .insert(allClientSyncRuns)
      .values({
        requestedByUserId: userId,
        startedAt: staleAt,
        heartbeatAt: staleAt,
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
      ghlClient: emptyGhl,
    });
    expect(result.status).toBe("failed");
    expect(result.targets).toHaveLength(2);
    expect(result.targets.every((target) => target.status === "failed")).toBe(
      true,
    );

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
    expect(recoveredRun?.status).toBe("failed");
    expect(recoveredTarget?.status).toBe("failed");
    const configuredClients = await db
      .select({ id: clients.id })
      .from(clients)
      .where(inArray(clients.slug, configuredSlugs));
    expect(configuredClients).toEqual([]);
  });
});
