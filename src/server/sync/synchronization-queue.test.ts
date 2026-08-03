import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  clientSynchronizationStates,
  clients,
  sourceAccounts,
  syncRuns,
  users,
} from "~/server/db/schema";
import type { GhlConfig } from "~/server/ghl/env";
import { CLIENT_SYNC_COOLDOWN_MS } from "~/server/sync/sync-mode";
import {
  queueSynchronization,
  SyncAlreadyRunningError,
  SyncCooldownError,
} from "~/server/sync/synchronization-queue";

const userId = "sync-queue-test-user";
const clientSlugs = ["sync-queue-client-a", "sync-queue-client-b"];
const connectorAccountIds = [
  "facebook__sync-queue-a",
  "facebook__sync-queue-b",
];
let clientAId = "";
let clientBId = "";

function ghlConfig(): GhlConfig {
  return {
    baseUrl: new URL("https://ghl.example"),
    mappings: [
      {
        clientSlug: clientSlugs[0]!,
        clientName: "Sync Queue Client A",
        locationId: "location-a",
        token: "token-a",
      },
      {
        clientSlug: clientSlugs[1]!,
        clientName: "Sync Queue Client B",
        locationId: "location-b",
        token: "token-b",
      },
    ],
  };
}

describe("synchronization queue", () => {
  beforeAll(async () => {
    await db
      .delete(sourceAccounts)
      .where(inArray(sourceAccounts.connectorAccountId, connectorAccountIds));
    await db.insert(users).values({
      id: userId,
      name: "Sync Queue Test",
      email: "sync-queue-test@example.com",
      role: "owner",
      status: "active",
    });
    const insertedClients = await db
      .insert(clients)
      .values([
        { slug: clientSlugs[0]!, name: "Sync Queue Client A" },
        { slug: clientSlugs[1]!, name: "Sync Queue Client B" },
      ])
      .returning({ id: clients.id, slug: clients.slug });
    clientAId = insertedClients.find(({ slug }) => slug === clientSlugs[0])!.id;
    clientBId = insertedClients.find(({ slug }) => slug === clientSlugs[1])!.id;
    await db.insert(sourceAccounts).values([
      {
        clientId: clientAId,
        dataProvider: "windsor",
        platform: "facebook",
        connector: "facebook",
        connectorAccountId: connectorAccountIds[0]!,
        externalAccountId: "sync-queue-a",
        externalAccountName: "Sync Queue A",
        normalizedName: "sync queue a",
      },
      {
        clientId: clientBId,
        dataProvider: "windsor",
        platform: "facebook",
        connector: "facebook",
        connectorAccountId: connectorAccountIds[1]!,
        externalAccountId: "sync-queue-b",
        externalAccountName: "Sync Queue B",
        normalizedName: "sync queue b",
      },
    ]);
  });

  afterEach(async () => {
    const providerRuns = await db
      .select({ id: allClientSyncRuns.windsorSyncRunId })
      .from(allClientSyncRuns)
      .where(
        inArray(allClientSyncRuns.requestedClientId, [clientAId, clientBId]),
      );
    await db
      .delete(allClientSyncRuns)
      .where(
        inArray(allClientSyncRuns.requestedClientId, [clientAId, clientBId]),
      );
    const providerRunIds = providerRuns.flatMap(({ id }) => (id ? [id] : []));
    if (providerRunIds.length > 0) {
      await db.delete(syncRuns).where(inArray(syncRuns.id, providerRunIds));
    }
    await db
      .delete(clientSynchronizationStates)
      .where(
        inArray(clientSynchronizationStates.clientId, [clientAId, clientBId]),
      );
  });

  afterAll(async () => {
    await db
      .delete(sourceAccounts)
      .where(inArray(sourceAccounts.connectorAccountId, connectorAccountIds));
    await db.delete(clients).where(inArray(clients.id, [clientAId, clientBId]));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("queues a scoped fresh run with both configured providers", async () => {
    const run = await queueSynchronization(
      {
        mode: "fresh",
        requestedByUserId: userId,
        scope: { kind: "client", clientId: clientAId },
        trigger: "manual",
      },
      { ghlConfig: ghlConfig() },
    );

    expect(run).toMatchObject({
      mode: "fresh",
      requestedClientId: clientAId,
      scope: "client",
      status: "running",
      trigger: "manual",
    });
    expect(run?.targets).toHaveLength(2);
    expect(
      run?.targets.map(({ clientId, provider, status }) => ({
        clientId,
        provider,
        status,
      })),
    ).toEqual([
      { clientId: clientAId, provider: "windsor", status: "pending" },
      { clientId: clientAId, provider: "ghl", status: "pending" },
    ]);
  });

  it("deduplicates a client provider without blocking another client", async () => {
    await queueSynchronization(
      {
        mode: "fresh",
        requestedByUserId: userId,
        scope: { kind: "client", clientId: clientAId },
        trigger: "manual",
      },
      { ghlConfig: ghlConfig() },
    );

    await expect(
      queueSynchronization(
        {
          mode: "fresh",
          requestedByUserId: userId,
          scope: { kind: "client", clientId: clientAId },
          trigger: "manual",
        },
        { ghlConfig: ghlConfig() },
      ),
    ).rejects.toBeInstanceOf(SyncAlreadyRunningError);

    await expect(
      queueSynchronization(
        {
          mode: "fresh",
          requestedByUserId: userId,
          scope: { kind: "client", clientId: clientBId },
          trigger: "manual",
        },
        { ghlConfig: ghlConfig() },
      ),
    ).resolves.toMatchObject({ requestedClientId: clientBId });
  });

  it("queues scheduled work only after the provider becomes hourly due", async () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    await db.insert(clientSynchronizationStates).values([
      {
        clientId: clientAId,
        provider: "ghl",
        lastAttemptAt: new Date("2026-08-03T11:30:00.000Z"),
        lastSucceededAt: new Date("2026-08-03T11:30:00.000Z"),
      },
      {
        clientId: clientAId,
        provider: "windsor",
        lastAttemptAt: new Date("2026-08-03T11:30:00.000Z"),
        lastSucceededAt: new Date("2026-08-03T11:30:00.000Z"),
      },
    ]);

    await expect(
      queueSynchronization(
        {
          mode: "fresh",
          requestedByUserId: null,
          scope: { kind: "client", clientId: clientAId },
          trigger: "scheduled",
        },
        { ghlConfig: ghlConfig(), now: () => now },
      ),
    ).resolves.toBeNull();

    await db
      .update(clientSynchronizationStates)
      .set({
        lastAttemptAt: new Date("2026-08-03T10:00:00.000Z"),
        lastSucceededAt: new Date("2026-08-03T10:00:00.000Z"),
      })
      .where(eq(clientSynchronizationStates.clientId, clientAId));
    const run = await queueSynchronization(
      {
        mode: "fresh",
        requestedByUserId: null,
        scope: { kind: "client", clientId: clientAId },
        trigger: "scheduled",
      },
      { ghlConfig: ghlConfig(), now: () => now },
    );

    expect(run).toMatchObject({
      mode: "fresh",
      requestedByUserId: null,
      scope: "client",
      trigger: "scheduled",
    });
    expect(run?.targets.every(({ status }) => status === "pending")).toBe(true);
  });

  it("enforces the client self-service cooldown", async () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    await db.insert(clientSynchronizationStates).values({
      clientId: clientAId,
      provider: "ghl",
      lastAttemptAt: new Date("2026-08-03T11:55:00.000Z"),
    });

    await expect(
      queueSynchronization(
        {
          minimumIntervalMs: CLIENT_SYNC_COOLDOWN_MS,
          mode: "fresh",
          requestedByUserId: userId,
          scope: { kind: "client", clientId: clientAId },
          trigger: "manual",
        },
        { ghlConfig: ghlConfig(), now: () => now },
      ),
    ).rejects.toMatchObject({
      nextEligibleAt: new Date("2026-08-03T12:10:00.000Z"),
    });
    await expect(
      queueSynchronization(
        {
          minimumIntervalMs: CLIENT_SYNC_COOLDOWN_MS,
          mode: "fresh",
          requestedByUserId: userId,
          scope: { kind: "client", clientId: clientAId },
          trigger: "manual",
        },
        { ghlConfig: ghlConfig(), now: () => now },
      ),
    ).rejects.toBeInstanceOf(SyncCooldownError);
  });

  it("rate limits repeated client requests even when no provider is configured", async () => {
    const now = new Date("2026-08-03T12:00:00.000Z");
    await db
      .update(sourceAccounts)
      .set({ status: "disconnected" })
      .where(eq(sourceAccounts.clientId, clientAId));
    const emptyGhlConfig: GhlConfig = {
      baseUrl: new URL("https://ghl.example"),
      mappings: [],
    };
    try {
      const firstRun = await queueSynchronization(
        {
          minimumIntervalMs: CLIENT_SYNC_COOLDOWN_MS,
          mode: "fresh",
          requestedByUserId: userId,
          scope: { kind: "client", clientId: clientAId },
          trigger: "manual",
        },
        { ghlConfig: emptyGhlConfig, now: () => now },
      );
      expect(firstRun?.status).toBe("succeeded");
      expect(
        firstRun?.targets.every(({ status }) => status === "skipped"),
      ).toBe(true);

      await expect(
        queueSynchronization(
          {
            minimumIntervalMs: CLIENT_SYNC_COOLDOWN_MS,
            mode: "fresh",
            requestedByUserId: userId,
            scope: { kind: "client", clientId: clientAId },
            trigger: "manual",
          },
          { ghlConfig: emptyGhlConfig, now: () => now },
        ),
      ).rejects.toBeInstanceOf(SyncCooldownError);
    } finally {
      await db
        .update(sourceAccounts)
        .set({ status: "active" })
        .where(eq(sourceAccounts.clientId, clientAId));
    }
  });

  it("records owner-requested full synchronization explicitly", async () => {
    const run = await queueSynchronization(
      {
        mode: "full",
        requestedByUserId: userId,
        scope: { kind: "client", clientId: clientAId },
        trigger: "manual",
      },
      { ghlConfig: ghlConfig() },
    );

    expect(run).toMatchObject({ mode: "full", trigger: "manual" });
  });
});
