import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getGlobalSalespeople,
  linkSalespersonToGlobal,
  separateSalespersonIdentity,
  updateGlobalSalesperson,
} from "~/features/sales-commissions/server/global-salespeople";
import { db } from "~/server/db";
import {
  clients,
  globalSalespeople,
  globalSalespersonIdentities,
  salespeople,
} from "~/server/db/schema";
import { eq, inArray } from "drizzle-orm";

const externalUserIdA = "global-salespeople-test-user-a";
const externalUserIdB = "global-salespeople-test-user-b";
let clientIds: string[] = [];
let salespersonIds: string[] = [];
let globalSalespersonIdA = "";
let globalSalespersonIdB = "";

beforeAll(async () => {
  const createdClients = await db
    .insert(clients)
    .values([
      { slug: "global-salespeople-test-a", name: "Global Test Client A" },
      { slug: "global-salespeople-test-b", name: "Global Test Client B" },
      { slug: "global-salespeople-test-c", name: "Global Test Client C" },
    ])
    .returning({ id: clients.id });
  clientIds = createdClients.map((client) => client.id);
  if (clientIds.length !== 3) throw new Error("Could not create test clients");

  const createdGlobalSalespeople = await db
    .insert(globalSalespeople)
    .values([{}, {}])
    .returning({ id: globalSalespeople.id });
  const firstGlobalSalesperson = createdGlobalSalespeople[0];
  const secondGlobalSalesperson = createdGlobalSalespeople[1];
  if (!firstGlobalSalesperson || !secondGlobalSalesperson) {
    throw new Error("Could not create global salesperson fixtures");
  }
  globalSalespersonIdA = firstGlobalSalesperson.id;
  globalSalespersonIdB = secondGlobalSalesperson.id;
  await db.insert(globalSalespersonIdentities).values([
    {
      globalSalespersonId: globalSalespersonIdA,
      provider: "ghl",
      externalUserId: externalUserIdA,
    },
    {
      globalSalespersonId: globalSalespersonIdB,
      provider: "ghl",
      externalUserId: externalUserIdB,
    },
  ]);

  const createdSalespeople = await db
    .insert(salespeople)
    .values([
      {
        clientId: clientIds[0]!,
        externalUserId: externalUserIdA,
        providerName: "Shared Test Closer",
      },
      {
        clientId: clientIds[1]!,
        externalUserId: externalUserIdA,
        providerName: "Shared Test Closer",
      },
      {
        clientId: clientIds[2]!,
        externalUserId: externalUserIdB,
        providerName: "Second Test Identity",
      },
    ])
    .returning({ id: salespeople.id });
  salespersonIds = createdSalespeople.map((person) => person.id);
});

afterAll(async () => {
  if (clientIds.length) {
    await db.delete(clients).where(inArray(clients.id, clientIds));
  }
  if (globalSalespersonIdA || globalSalespersonIdB) {
    await db
      .delete(globalSalespeople)
      .where(
        inArray(
          globalSalespeople.id,
          [globalSalespersonIdA, globalSalespersonIdB].filter(Boolean),
        ),
      );
  }
  await db
    .delete(globalSalespersonIdentities)
    .where(
      inArray(globalSalespersonIdentities.externalUserId, [
        externalUserIdA,
        externalUserIdB,
      ]),
    );
});

describe("global salesperson identities", () => {
  it("presents one global salesperson with multiple client assignments", async () => {
    const result = await getGlobalSalespeople({
      search: "Shared Test Closer",
      page: 1,
      pageSize: 25,
    });

    expect(result.people).toHaveLength(1);
    expect(result.people[0]).toMatchObject({
      id: globalSalespersonIdA,
      name: "Shared Test Closer",
      clientCount: 2,
      externalIdentityCount: 1,
    });
    expect(result.people[0]?.assignments).toHaveLength(2);
  });

  it("links and separates a different GHL ID without changing client records", async () => {
    const sourceSalespersonId = salespersonIds[2];
    if (!sourceSalespersonId) throw new Error("Source salesperson is missing");

    await linkSalespersonToGlobal({
      salespersonId: sourceSalespersonId,
      targetGlobalSalespersonId: globalSalespersonIdA,
    });
    const result = await getGlobalSalespeople({
      search: "Shared Test Closer",
      page: 1,
      pageSize: 25,
    });
    const storedSalespeople = await db
      .select({ id: salespeople.id, clientId: salespeople.clientId })
      .from(salespeople)
      .where(inArray(salespeople.id, salespersonIds));

    expect(result.people).toHaveLength(1);
    expect(result.people[0]).toMatchObject({
      id: globalSalespersonIdA,
      clientCount: 3,
      externalIdentityCount: 2,
    });
    expect(storedSalespeople).toHaveLength(3);
    expect(new Set(storedSalespeople.map((person) => person.clientId))).toEqual(
      new Set(clientIds),
    );

    await updateGlobalSalesperson({
      globalSalespersonId: globalSalespersonIdA,
      displayName: "Global Test Closer",
    });
    const separated = await separateSalespersonIdentity({
      salespersonId: sourceSalespersonId,
    });
    globalSalespersonIdB = separated.globalSalespersonId;
    const linkedIdentity = await db
      .select({
        globalSalespersonId: globalSalespersonIdentities.globalSalespersonId,
      })
      .from(globalSalespersonIdentities)
      .where(eq(globalSalespersonIdentities.externalUserId, externalUserIdB))
      .limit(1);
    const original = await getGlobalSalespeople({
      search: "Global Test Closer",
      page: 1,
      pageSize: 25,
    });

    expect(linkedIdentity[0]?.globalSalespersonId).toBe(
      separated.globalSalespersonId,
    );
    expect(original.people[0]).toMatchObject({
      id: globalSalespersonIdA,
      name: "Global Test Closer",
      clientCount: 2,
      externalIdentityCount: 1,
    });
  });
});
