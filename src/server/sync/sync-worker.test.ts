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
  integrationMappings,
  syncRuns,
  users,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import type { GhlConfig } from "~/server/ghl/env";
import { syncAllClients } from "~/server/sync/sync-all-clients";
import { processPendingSyncTargets } from "~/server/sync/sync-worker";
import { WindsorClient } from "~/server/windsor/client";

const userId = "resumable-worker-test-user";
const clientSlug = "resumable-worker-client";
let clientId = "";

const ghlConfig: GhlConfig = {
  baseUrl: new URL("https://ghl.example"),
  mappings: [
    {
      clientSlug,
      clientName: "Resumable Worker Client",
      locationId: "worker-location",
      token: "worker-token",
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

function createGhlClient() {
  let calendarRequestCount = 0;
  let opportunityRequestCount = 0;
  const fetcher = vi.fn<typeof fetch>().mockImplementation((request) => {
    const url = new URL(
      request instanceof URL
        ? request.href
        : typeof request === "string"
          ? request
          : request.url,
    );
    if (url.pathname === "/locations/worker-location") {
      return Promise.resolve(
        Response.json({
          location: {
            id: "worker-location",
            timezone: "America/New_York",
          },
        }),
      );
    }
    if (url.pathname === "/opportunities/search") {
      opportunityRequestCount += 1;
      return Promise.resolve(
        Response.json({
          opportunities: [
            {
              id: `worker-opportunity-${opportunityRequestCount}`,
              locationId: "worker-location",
              contactId: "worker-contact",
              status: "won",
              name: "Worker opportunity",
              pipelineId: "pipeline-1",
              pipelineStageId: "stage-1",
              monetaryValue: 500,
              currency: "USD",
              source: "Facebook",
              createdAt: "2026-07-15T10:00:00.000Z",
              lastStatusChangeAt: "2026-07-15T10:00:00.000Z",
              updatedAt: "2026-07-15T10:00:00.000Z",
              contact: {
                id: "worker-contact",
                name: "Worker Contact",
                email: "worker@example.com",
                phone: null,
              },
            },
          ],
          meta:
            opportunityRequestCount === 1
              ? {
                  nextPageUrl:
                    "https://ghl.example/opportunities/search?page=2",
                }
              : {},
        }),
      );
    }
    if (url.pathname === "/calendars/") {
      return Promise.resolve(
        Response.json({
          calendars: [
            {
              id: "worker-calendar",
              locationId: "worker-location",
              name: "Worker calendar",
              isActive: true,
            },
          ],
        }),
      );
    }
    if (url.pathname === "/calendars/events") {
      const events =
        calendarRequestCount === 0
          ? [
              {
                id: "worker-appointment",
                locationId: "worker-location",
                calendarId: "worker-calendar",
                contactId: "worker-contact",
                appointmentStatus: "confirmed",
                startTime: "2026-07-16T14:00:00.000Z",
                endTime: "2026-07-16T15:00:00.000Z",
                dateAdded: "2026-07-15T12:00:00.000Z",
                dateUpdated: "2026-07-15T12:00:00.000Z",
                title: "Worker appointment",
                deleted: false,
              },
            ]
          : [];
      calendarRequestCount += 1;
      return Promise.resolve(Response.json({ events }));
    }
    if (url.pathname === "/contacts/worker-contact") {
      return Promise.resolve(
        Response.json({
          contact: {
            id: "worker-contact",
            name: "Worker Contact",
            email: "worker@example.com",
            phone: null,
            tags: [],
            source: "Facebook",
            attributionSource: null,
            lastAttributionSource: null,
            dateAdded: "2026-07-15T12:00:00.000Z",
            dateUpdated: "2026-07-15T12:00:00.000Z",
          },
        }),
      );
    }
    throw new Error(`Unexpected GHL worker request: ${url.pathname}`);
  });
  return {
    client: new GhlClient(ghlConfig.baseUrl, fetcher),
    fetcher,
  };
}

describe("processPendingSyncTargets", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      name: "Resumable Worker Test",
      email: "resumable-worker@example.com",
      role: "owner",
      status: "active",
    });
    const [client] = await db
      .insert(clients)
      .values({
        slug: clientSlug,
        name: "Resumable Worker Client",
        status: "active",
      })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create worker test client");
    clientId = client.id;
  });

  afterEach(async () => {
    const runs = await db
      .select({ windsorRunId: allClientSyncRuns.windsorSyncRunId })
      .from(allClientSyncRuns)
      .where(eq(allClientSyncRuns.requestedByUserId, userId));
    await db
      .delete(allClientSyncRuns)
      .where(eq(allClientSyncRuns.requestedByUserId, userId));
    const providerRunIds = runs.flatMap(({ windsorRunId }) =>
      windsorRunId ? [windsorRunId] : [],
    );
    if (providerRunIds.length > 0) {
      await db.delete(syncRuns).where(inArray(syncRuns.id, providerRunIds));
    }
  });

  afterAll(async () => {
    await db.delete(clients).where(eq(clients.id, clientId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("checkpoints a target and resumes it in later worker calls", async () => {
    const run = await syncAllClients(userId, {
      windsorClient: emptyWindsor,
      ghlConfig,
    });
    const ghl = createGhlClient();

    await expect(
      processPendingSyncTargets(
        { runId: run.id, maxChunks: 1 },
        {
          ghlClient: ghl.client,
          ghlConfig,
          windsorClient: emptyWindsor,
        },
      ),
    ).resolves.toEqual({ processedChunkCount: 1 });

    const [checkpointed] = await db
      .select({
        id: allClientSyncTargets.id,
        status: allClientSyncTargets.status,
        checkpoint: allClientSyncTargets.checkpoint,
      })
      .from(allClientSyncTargets)
      .where(
        and(
          eq(allClientSyncTargets.runId, run.id),
          eq(allClientSyncTargets.provider, "ghl"),
        ),
      );
    expect(checkpointed?.status).toBe("pending");
    expect(checkpointed?.checkpoint).toMatchObject({
      version: 1,
      phase: "opportunities",
    });
    expect(ghl.fetcher).toHaveBeenCalledTimes(1);
    if (!checkpointed) throw new Error("Checkpointed target disappeared");
    await db
      .update(allClientSyncTargets)
      .set({ status: "running", leaseExpiresAt: new Date(0) })
      .where(eq(allClientSyncTargets.id, checkpointed.id));

    await processPendingSyncTargets(
      { runId: run.id, maxChunks: 1 },
      {
        ghlClient: ghl.client,
        ghlConfig,
        windsorClient: emptyWindsor,
      },
    );
    const [reclaimed] = await db
      .select({
        status: allClientSyncTargets.status,
        checkpoint: allClientSyncTargets.checkpoint,
      })
      .from(allClientSyncTargets)
      .where(eq(allClientSyncTargets.id, checkpointed.id));
    expect(reclaimed?.status).toBe("pending");
    expect(reclaimed?.checkpoint).toMatchObject({
      phase: "opportunities",
      pageUrl: "https://ghl.example/opportunities/search?page=2",
    });

    await processPendingSyncTargets(
      { runId: run.id, maxChunks: 100 },
      {
        ghlClient: ghl.client,
        ghlConfig,
        windsorClient: emptyWindsor,
      },
    );

    const [completedRun] = await db
      .select({ status: allClientSyncRuns.status })
      .from(allClientSyncRuns)
      .where(eq(allClientSyncRuns.id, run.id));
    const [completedTarget] = await db
      .select({
        status: allClientSyncTargets.status,
        contactRowCount: allClientSyncTargets.contactRowCount,
        opportunityRowCount: allClientSyncTargets.opportunityRowCount,
      })
      .from(allClientSyncTargets)
      .where(
        and(
          eq(allClientSyncTargets.runId, run.id),
          eq(allClientSyncTargets.provider, "ghl"),
        ),
      );
    const [mapping] = await db
      .select({
        lastSuccessfulSyncAt: integrationMappings.lastSuccessfulSyncAt,
      })
      .from(integrationMappings)
      .where(eq(integrationMappings.clientId, clientId));
    expect(completedRun?.status).toBe("succeeded");
    expect(completedTarget).toMatchObject({
      status: "succeeded",
      contactRowCount: 3,
      opportunityRowCount: 1,
    });
    expect(mapping?.lastSuccessfulSyncAt).toEqual(run.startedAt);
  });

  it("does not overlap a worker that already holds the run lease", async () => {
    const run = await syncAllClients(userId, {
      windsorClient: emptyWindsor,
      ghlConfig,
    });
    await db
      .update(allClientSyncRuns)
      .set({ workerLeaseExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(allClientSyncRuns.id, run.id));
    const ghl = createGhlClient();

    await expect(
      processPendingSyncTargets(
        { runId: run.id, maxChunks: 1 },
        {
          ghlClient: ghl.client,
          ghlConfig,
          windsorClient: emptyWindsor,
        },
      ),
    ).resolves.toEqual({ processedChunkCount: 0 });
    expect(ghl.fetcher).not.toHaveBeenCalled();

    await db.delete(allClientSyncRuns).where(eq(allClientSyncRuns.id, run.id));
    if (run.windsorSyncRunId) {
      await db.delete(syncRuns).where(eq(syncRuns.id, run.windsorSyncRunId));
    }
  });

  it.each([400, 401])(
    "retries transient status %i before permanently failing the target",
    async (status) => {
      const run = await syncAllClients(userId, {
        windsorClient: emptyWindsor,
        ghlConfig,
      });
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      const ghlClient = new GhlClient(ghlConfig.baseUrl, fetcher);

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await processPendingSyncTargets(
          { runId: run.id, maxChunks: 1 },
          { ghlClient, ghlConfig, windsorClient: emptyWindsor },
        );

        const [target] = await db
          .select({
            id: allClientSyncTargets.id,
            status: allClientSyncTargets.status,
            failureCount: allClientSyncTargets.failureCount,
            errorMessage: allClientSyncTargets.errorMessage,
          })
          .from(allClientSyncTargets)
          .where(
            and(
              eq(allClientSyncTargets.runId, run.id),
              eq(allClientSyncTargets.provider, "ghl"),
            ),
          );
        expect(target).toMatchObject(
          attempt < 3
            ? {
                status: "pending",
                failureCount: attempt,
                errorMessage: `Retry ${attempt}/3: GHL location request failed with status ${status}`,
              }
            : {
                status: "failed",
                failureCount: 3,
                errorMessage: `GHL location request failed with status ${status}`,
              },
        );
        if (attempt < 3 && target) {
          await db
            .update(allClientSyncTargets)
            .set({ availableAt: new Date(0) })
            .where(eq(allClientSyncTargets.id, target.id));
        }
      }

      const [completedRun] = await db
        .select({ status: allClientSyncRuns.status })
        .from(allClientSyncRuns)
        .where(eq(allClientSyncRuns.id, run.id));
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(completedRun?.status).toBe("failed");
    },
  );

  it("fails permanent provider errors without retrying the target", async () => {
    const run = await syncAllClients(userId, {
      windsorClient: emptyWindsor,
      ghlConfig,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 403 }));

    await processPendingSyncTargets(
      { runId: run.id, maxChunks: 1 },
      {
        ghlClient: new GhlClient(ghlConfig.baseUrl, fetcher),
        ghlConfig,
        windsorClient: emptyWindsor,
      },
    );

    const [failedRun] = await db
      .select({ status: allClientSyncRuns.status })
      .from(allClientSyncRuns)
      .where(eq(allClientSyncRuns.id, run.id));
    const [failedTarget] = await db
      .select({
        status: allClientSyncTargets.status,
        failureCount: allClientSyncTargets.failureCount,
        errorMessage: allClientSyncTargets.errorMessage,
      })
      .from(allClientSyncTargets)
      .where(
        and(
          eq(allClientSyncTargets.runId, run.id),
          eq(allClientSyncTargets.provider, "ghl"),
        ),
      );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(failedRun?.status).toBe("failed");
    expect(failedTarget).toMatchObject({
      status: "failed",
      failureCount: 1,
      errorMessage: "GHL location request failed with status 403",
    });
  });
});
