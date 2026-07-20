import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assignUnassignedSourceAccounts,
  createManagedClient,
  deleteManagedClient,
} from "~/features/management/server/actions";
import { db } from "~/server/db";
import { clients, sourceAccounts } from "~/server/db/schema";

const primarySlug = "client-assignment-action-test";
const secondarySlug = "client-assignment-action-test-secondary";
const connectorAccountIds = [
  "facebook__client_assignment_action_test_a",
  "facebook__client_assignment_action_test_b",
];
let firstSourceAccountId = "";
let secondSourceAccountId = "";

beforeAll(async () => {
  await db
    .delete(sourceAccounts)
    .where(inArray(sourceAccounts.connectorAccountId, connectorAccountIds));
  await db
    .delete(clients)
    .where(inArray(clients.slug, [primarySlug, secondarySlug]));
  const rows = await db
    .insert(sourceAccounts)
    .values(
      connectorAccountIds.map((connectorAccountId, index) => ({
        dataProvider: "windsor",
        platform: "facebook",
        connector: "facebook",
        connectorAccountId,
        externalAccountId: `${connectorAccountId}-external`,
        externalAccountName: `Unassigned Account ${index + 1}`,
        normalizedName: `unassignedaccount${index + 1}`,
      })),
    )
    .returning({ id: sourceAccounts.id });
  const [first, second] = rows;
  if (!first || !second) throw new Error("Could not create source fixtures");
  firstSourceAccountId = first.id;
  secondSourceAccountId = second.id;
});

afterAll(async () => {
  await db
    .delete(sourceAccounts)
    .where(inArray(sourceAccounts.connectorAccountId, connectorAccountIds));
  await db
    .delete(clients)
    .where(inArray(clients.slug, [primarySlug, secondarySlug]));
});

describe("client creation and unassigned account assignment", () => {
  it("creates a client and atomically assigns selected accounts", async () => {
    const client = await createManagedClient({
      name: "Client Assignment Action Test",
      sourceAccountIds: [firstSourceAccountId],
    });
    const [storedClient] = await db
      .select({ slug: clients.slug })
      .from(clients)
      .where(eq(clients.id, client.id));
    const accounts = await db
      .select({ id: sourceAccounts.id, clientId: sourceAccounts.clientId })
      .from(sourceAccounts)
      .where(
        inArray(sourceAccounts.id, [
          firstSourceAccountId,
          secondSourceAccountId,
        ]),
      );

    expect(storedClient?.slug).toBe(primarySlug);
    expect(
      accounts.find(({ id }) => id === firstSourceAccountId)?.clientId,
    ).toBe(client.id);
    expect(
      accounts.find(({ id }) => id === secondSourceAccountId)?.clientId,
    ).toBeNull();
  });

  it("bulk assigns remaining unassigned accounts", async () => {
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, primarySlug));
    if (!client) throw new Error("Primary client is missing");

    await assignUnassignedSourceAccounts({
      clientId: client.id,
      sourceAccountIds: [secondSourceAccountId],
    });
    const [account] = await db
      .select({ clientId: sourceAccounts.clientId })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.id, secondSourceAccountId));
    expect(account?.clientId).toBe(client.id);
  });

  it("does not move an account that is already assigned", async () => {
    const target = await createManagedClient({
      name: "Client Assignment Action Test Secondary",
      sourceAccountIds: [],
    });
    await expect(
      assignUnassignedSourceAccounts({
        clientId: target.id,
        sourceAccountIds: [firstSourceAccountId],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const [account] = await db
      .select({ clientId: sourceAccounts.clientId })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.id, firstSourceAccountId));
    expect(account?.clientId).not.toBe(target.id);
    await expect(deleteManagedClient(target.id)).resolves.toEqual({
      success: true,
    });
  });

  it("blocks permanent deletion when a client still owns accounts", async () => {
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, primarySlug));
    if (!client) throw new Error("Primary client is missing");

    await expect(deleteManagedClient(client.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
