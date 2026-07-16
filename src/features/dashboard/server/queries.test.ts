import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getClientAnalytics } from "~/features/dashboard/server/queries";
import { db } from "~/server/db";
import {
  clients,
  integrationMappings,
  leads,
  sourceAccounts,
} from "~/server/db/schema";
import { eq } from "drizzle-orm";

const slug = "client-analytics-query-test";
let clientId = "";

describe("getClientAnalytics", () => {
  beforeAll(async () => {
    await db
      .delete(sourceAccounts)
      .where(eq(sourceAccounts.connectorAccountId, `facebook_leads__${slug}`));
    await db.delete(clients).where(eq(clients.slug, slug));
    const [client] = await db
      .insert(clients)
      .values({ slug, name: "Client Analytics Query Test" })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create analytics test client");
    clientId = client.id;
    const [source] = await db
      .insert(sourceAccounts)
      .values({
        clientId,
        dataProvider: "windsor",
        platform: "facebook",
        connector: "facebook_leads",
        connectorAccountId: `facebook_leads__${slug}`,
        externalAccountId: slug,
        externalAccountName: "Client Analytics Query Test",
        normalizedName: "client analytics query test",
      })
      .returning({ id: sourceAccounts.id });
    if (!source) throw new Error("Could not create analytics test source");
    await db.insert(integrationMappings).values({
      clientId,
      provider: "ghl",
      externalLocationId: `${slug}-location`,
      timezone: "America/New_York",
      syncFromAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    await db.insert(leads).values({
      sourceAccountId: source.id,
      externalId: `${slug}-lead`,
      occurredAt: new Date("2026-07-07T03:30:00.000Z"),
      rawPayload: {},
    });
  });

  afterAll(async () => {
    await db
      .delete(sourceAccounts)
      .where(eq(sourceAccounts.connectorAccountId, `facebook_leads__${slug}`));
    await db.delete(clients).where(eq(clients.slug, slug));
  });

  it("qualifies correlated client IDs and applies client-local dates", async () => {
    const result = await getClientAnalytics({
      from: "2026-07-06",
      to: "2026-08-01",
      page: 1,
      pageSize: 25,
      clientIds: [clientId],
    });

    expect(result.total).toBe(1);
    expect(result.rows).toEqual([
      expect.objectContaining({
        id: clientId,
        capturedLeads: 1,
        bookings: 0,
        estimatedRevenue: "0.00",
      }),
    ]);
  });

  it("includes a UTC-next-day lead on the prior New York date", async () => {
    const result = await getClientAnalytics({
      from: "2026-07-06",
      to: "2026-07-06",
      page: 1,
      pageSize: 25,
      clientIds: [clientId],
    });

    expect(result.rows[0]?.capturedLeads).toBe(1);
    expect(result.rows[0]?.timezone).toBe("America/New_York");
  });
});
