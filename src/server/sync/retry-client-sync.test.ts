import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clients,
  syncRuns,
  users,
} from "~/server/db/schema";
import {
  FailedClientSyncTargetsNotFoundError,
  retryClientSync,
} from "~/server/sync/retry-client-sync";
import { SyncAlreadyRunningError } from "~/server/sync/sync-all-clients";

const userId = "client-retry-test-user";
const clientSlug = "client-retry-test-client";
let clientId = "";

const checkpoint = {
  version: 1,
  phase: "appointments",
  mappingId: "00000000-0000-4000-8000-000000000001",
  through: "2026-07-31T18:59:34.492Z",
  calendars: [
    {
      id: "calendar-1",
      locationId: "location-1",
      name: "Calendar 1",
      isActive: true,
    },
  ],
  windows: [
    {
      calendarId: "calendar-1",
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-07-08T00:00:00.000Z",
    },
  ],
  nextWindowIndex: 0,
  progress: {
    contactRowCount: 12,
    opportunityRowCount: 4,
    matchedOpportunityCount: 3,
    appointmentRowCount: 5,
    matchedAppointmentCount: 2,
  },
};

async function createSourceRun(targetStatus: "failed" | "succeeded") {
  const completedAt = new Date();
  const [run] = await db
    .insert(allClientSyncRuns)
    .values({
      requestedByUserId: userId,
      status: targetStatus === "failed" ? "failed" : "succeeded",
      completedAt,
      heartbeatAt: completedAt,
    })
    .returning({ id: allClientSyncRuns.id });
  if (!run) throw new Error("Could not create retry source run");
  await db.insert(allClientSyncTargets).values([
    {
      runId: run.id,
      clientId,
      clientSlug,
      clientName: "Client Retry Test",
      provider: "ghl",
      status: targetStatus,
      completedAt,
      checkpoint,
      contactRowCount: 12,
      opportunityRowCount: 5,
      matchedOpportunityCount: 2,
      errorMessage: targetStatus === "failed" ? "Temporary GHL failure" : null,
    },
    {
      runId: run.id,
      clientId,
      clientSlug,
      clientName: "Client Retry Test",
      provider: "windsor",
      status: "succeeded",
      completedAt,
      sourceAccountCount: 2,
    },
  ]);
  return run;
}

describe("retryClientSync", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      name: "Client Retry Test User",
      email: "client-retry-test@example.com",
      role: "owner",
      status: "active",
    });
    const [client] = await db
      .insert(clients)
      .values({
        slug: clientSlug,
        name: "Client Retry Test",
        status: "active",
      })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create retry test client");
    clientId = client.id;
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
  });

  afterAll(async () => {
    await db.delete(clients).where(eq(clients.id, clientId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("creates a targeted run containing only the failed client targets", async () => {
    const sourceRun = await createSourceRun("failed");

    const retryRun = await retryClientSync({
      sourceRunId: sourceRun.id,
      clientId,
      requestedByUserId: userId,
    });

    expect(retryRun).toMatchObject({
      status: "running",
      requestedByUserId: userId,
      windsorSyncRunId: null,
    });
    expect(retryRun.targets).toHaveLength(1);
    expect(retryRun.targets[0]).toMatchObject({
      clientId,
      clientSlug,
      provider: "ghl",
      status: "pending",
      contactRowCount: 12,
      opportunityRowCount: 5,
      matchedOpportunityCount: 2,
      errorMessage: null,
    });

    const [queuedTarget] = await db
      .select({
        checkpoint: allClientSyncTargets.checkpoint,
        failureCount: allClientSyncTargets.failureCount,
      })
      .from(allClientSyncTargets)
      .where(
        and(
          eq(allClientSyncTargets.runId, retryRun.id),
          eq(allClientSyncTargets.clientId, clientId),
        ),
      );
    expect(queuedTarget).toMatchObject({ checkpoint, failureCount: 0 });
  });

  it("queues every failed provider for the selected client", async () => {
    const sourceRun = await createSourceRun("failed");
    await db
      .update(allClientSyncTargets)
      .set({ status: "failed", errorMessage: "Temporary Windsor failure" })
      .where(
        and(
          eq(allClientSyncTargets.runId, sourceRun.id),
          eq(allClientSyncTargets.provider, "windsor"),
        ),
      );

    const retryRun = await retryClientSync({
      sourceRunId: sourceRun.id,
      clientId,
      requestedByUserId: userId,
    });

    expect(retryRun.windsorSyncRunId).not.toBeNull();
    expect(retryRun.targets).toHaveLength(2);
    expect(retryRun.targets.map(({ provider }) => provider).sort()).toEqual([
      "ghl",
      "windsor",
    ]);
    expect(retryRun.targets.every(({ status }) => status === "pending")).toBe(
      true,
    );
  });

  it("rejects a failed target superseded by a newer client run", async () => {
    const sourceRun = await createSourceRun("failed");
    const completedAt = new Date(Date.now() + 1_000);
    const [newerRun] = await db
      .insert(allClientSyncRuns)
      .values({
        requestedByUserId: userId,
        status: "succeeded",
        startedAt: completedAt,
        heartbeatAt: completedAt,
        completedAt,
      })
      .returning({ id: allClientSyncRuns.id });
    if (!newerRun) throw new Error("Could not create newer client run");
    await db.insert(allClientSyncTargets).values({
      runId: newerRun.id,
      clientId,
      clientSlug,
      clientName: "Client Retry Test",
      provider: "ghl",
      status: "succeeded",
      completedAt,
    });

    await expect(
      retryClientSync({
        sourceRunId: sourceRun.id,
        clientId,
        requestedByUserId: userId,
      }),
    ).rejects.toBeInstanceOf(FailedClientSyncTargetsNotFoundError);
  });

  it("rejects a client without failed targets", async () => {
    const sourceRun = await createSourceRun("succeeded");

    await expect(
      retryClientSync({
        sourceRunId: sourceRun.id,
        clientId,
        requestedByUserId: userId,
      }),
    ).rejects.toBeInstanceOf(FailedClientSyncTargetsNotFoundError);
  });

  it("does not overlap another active synchronization run", async () => {
    const sourceRun = await createSourceRun("failed");
    await db.insert(allClientSyncRuns).values({ requestedByUserId: userId });

    await expect(
      retryClientSync({
        sourceRunId: sourceRun.id,
        clientId,
        requestedByUserId: userId,
      }),
    ).rejects.toBeInstanceOf(SyncAlreadyRunningError);
  });
});
