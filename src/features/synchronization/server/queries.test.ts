import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getSynchronizationClientStatuses } from "~/features/synchronization/server/queries";
import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clientMemberships,
  clientSynchronizationStates,
  clients,
  ghlClientConfigurations,
  sourceAccounts,
  users,
} from "~/server/db/schema";

const ownerId = "sync-status-owner";
const clientUserId = "sync-status-client-user";
const clientSlugs = ["sync-status-client-a", "sync-status-client-b"];
let clientAId = "";
let clientBId = "";

const owner = {
  id: ownerId,
  name: "Sync Status Owner",
  email: "sync-status-owner@example.com",
  role: "owner" as const,
  status: "active" as const,
};
const clientUser = {
  id: clientUserId,
  name: "Sync Status Client",
  email: "sync-status-client@example.com",
  role: "client" as const,
  status: "active" as const,
};

describe("getSynchronizationClientStatuses", () => {
  beforeAll(async () => {
    await db.insert(users).values([owner, clientUser]);
    const insertedClients = await db
      .insert(clients)
      .values([
        { slug: clientSlugs[0]!, name: "Sync Status Client A" },
        { slug: clientSlugs[1]!, name: "Sync Status Client B" },
      ])
      .returning({ id: clients.id, slug: clients.slug });
    clientAId = insertedClients.find(({ slug }) => slug === clientSlugs[0])!.id;
    clientBId = insertedClients.find(({ slug }) => slug === clientSlugs[1])!.id;
    await db.insert(clientMemberships).values({
      userId: clientUserId,
      clientId: clientAId,
    });
    await db.insert(ghlClientConfigurations).values({
      clientId: clientAId,
      locationId: "sync-status-location-a",
      encryptedToken: "encrypted",
      tokenIv: "iv",
      tokenAuthTag: "auth-tag",
      tokenLastFour: "1234",
      timezone: "UTC",
      createdByUserId: ownerId,
      updatedByUserId: ownerId,
    });
    await db.insert(sourceAccounts).values({
      clientId: clientBId,
      dataProvider: "windsor",
      platform: "facebook",
      connector: "facebook",
      connectorAccountId: "facebook__sync-status-b",
      externalAccountId: "sync-status-b",
      externalAccountName: "Sync Status B",
      normalizedName: "sync status b",
    });
    const succeededAt = new Date("2026-08-03T10:00:00.000Z");
    await db.insert(clientSynchronizationStates).values({
      clientId: clientAId,
      provider: "ghl",
      lastAttemptAt: succeededAt,
      lastSucceededAt: succeededAt,
    });
    const [run] = await db
      .insert(allClientSyncRuns)
      .values({
        requestedByUserId: ownerId,
        requestedClientId: clientAId,
        mode: "fresh",
        scope: "client",
        trigger: "manual",
      })
      .returning({ id: allClientSyncRuns.id });
    if (!run) throw new Error("Could not create status query test run");
    await db.insert(allClientSyncTargets).values({
      runId: run.id,
      clientId: clientAId,
      clientSlug: clientSlugs[0]!,
      clientName: "Sync Status Client A",
      provider: "ghl",
      status: "pending",
    });
  });

  afterAll(async () => {
    await db
      .delete(allClientSyncRuns)
      .where(eq(allClientSyncRuns.requestedByUserId, ownerId));
    await db
      .delete(sourceAccounts)
      .where(eq(sourceAccounts.connectorAccountId, "facebook__sync-status-b"));
    await db.delete(clients).where(inArray(clients.id, [clientAId, clientBId]));
    await db.delete(users).where(inArray(users.id, [ownerId, clientUserId]));
  });

  it("returns only active membership clients to client users", async () => {
    const statuses = await getSynchronizationClientStatuses(clientUser);

    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      id: clientAId,
      ghl: {
        configured: true,
        status: "pending",
        lastSucceededAt: new Date("2026-08-03T10:00:00.000Z"),
      },
      windsor: { configured: false, status: "idle" },
    });
  });

  it("returns all active clients to owners without exposing configuration secrets", async () => {
    const statuses = await getSynchronizationClientStatuses(owner);

    expect(statuses.map(({ id }) => id).sort()).toEqual(
      [clientAId, clientBId].sort(),
    );
    expect(statuses.find(({ id }) => id === clientBId)?.windsor).toMatchObject({
      configured: true,
      status: "idle",
    });
    expect(JSON.stringify(statuses)).not.toContain("encrypted");
  });
});
