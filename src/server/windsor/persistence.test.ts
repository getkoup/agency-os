import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import {
  adGroups,
  adPerformanceDaily,
  ads,
  campaigns,
  clients,
  leadForms,
  leads,
  sourceAccounts,
} from "~/server/db/schema";
import {
  upsertLeadBatch,
  upsertPerformanceBatch,
} from "~/server/windsor/persistence";

const clientSlug = "windsor-batch-persistence-test";
const performanceAccountId = `${clientSlug}-performance`;
const leadAccountId = `${clientSlug}-leads`;
const performanceConnectorAccountId = `facebook__${performanceAccountId}`;
const leadConnectorAccountId = `facebook_leads__${leadAccountId}`;
let clientId = "";
let performanceSourceId = "";
let leadSourceId = "";

function performanceRow(date: string, clicks: number) {
  return {
    date,
    account_id: performanceAccountId,
    account_name: "Batch Test Account",
    campaign_id: `${clientSlug}-campaign`,
    campaign: "Batch Test Campaign",
    adset_id: `${clientSlug}-ad-group`,
    adset_name: "Batch Test Ad Group",
    ad_id: `${clientSlug}-ad`,
    ad_name: "Batch Test Ad",
    clicks,
  };
}

function leadRow(id: string, email: string) {
  return {
    id,
    created_time: "2026-07-16T10:00:00.000Z",
    account_id: leadAccountId,
    account_name: "Batch Test Lead Account",
    campaign_id: `${clientSlug}-campaign`,
    campaign: "Batch Test Campaign",
    adset_id: `${clientSlug}-ad-group`,
    adset_name: "Batch Test Ad Group",
    ad_id: `${clientSlug}-ad`,
    ad_name: "Batch Test Ad",
    form_id: `${clientSlug}-form`,
    email,
    full_name: "Batch Test Lead",
    phone: null,
    phone_number: "+1 555 0100",
  };
}

describe("Windsor batch persistence", () => {
  beforeAll(async () => {
    await db
      .delete(sourceAccounts)
      .where(
        inArray(sourceAccounts.connectorAccountId, [
          performanceConnectorAccountId,
          leadConnectorAccountId,
        ]),
      );
    await db.delete(clients).where(eq(clients.slug, clientSlug));
    const [client] = await db
      .insert(clients)
      .values({ slug: clientSlug, name: "Windsor Batch Persistence Test" })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create Windsor batch test client");
    clientId = client.id;
    const storedSources = await db
      .insert(sourceAccounts)
      .values([
        {
          clientId,
          dataProvider: "windsor",
          platform: "facebook",
          connector: "facebook",
          connectorAccountId: performanceConnectorAccountId,
          externalAccountId: performanceAccountId,
          externalAccountName: "Batch Test Account",
          normalizedName: "batchtestaccount",
        },
        {
          clientId,
          dataProvider: "windsor",
          platform: "facebook",
          connector: "facebook_leads",
          connectorAccountId: leadConnectorAccountId,
          externalAccountId: leadAccountId,
          externalAccountName: "Batch Test Lead Account",
          normalizedName: "batchtestleadaccount",
        },
      ])
      .returning({
        id: sourceAccounts.id,
        connector: sourceAccounts.connector,
      });
    performanceSourceId =
      storedSources.find(({ connector }) => connector === "facebook")?.id ?? "";
    leadSourceId =
      storedSources.find(({ connector }) => connector === "facebook_leads")
        ?.id ?? "";
    if (!performanceSourceId || !leadSourceId) {
      throw new Error("Could not create Windsor batch test sources");
    }
  });

  afterAll(async () => {
    await db
      .delete(sourceAccounts)
      .where(
        inArray(sourceAccounts.connectorAccountId, [
          performanceConnectorAccountId,
          leadConnectorAccountId,
        ]),
      );
    if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
  });

  it("bulk upserts hierarchy, performance, forms, and leads idempotently", async () => {
    await upsertPerformanceBatch(
      [performanceRow("2026-07-15", 10), performanceRow("2026-07-16", 20)],
      [performanceConnectorAccountId],
    );
    await upsertLeadBatch(
      [
        leadRow(`${clientSlug}-lead-1`, "first@example.com"),
        leadRow(`${clientSlug}-lead-2`, "second@example.com"),
      ],
      [leadConnectorAccountId],
    );

    await upsertPerformanceBatch(
      [performanceRow("2026-07-15", 99), performanceRow("2026-07-16", 20)],
      [performanceConnectorAccountId],
    );
    await upsertLeadBatch(
      [leadRow(`${clientSlug}-lead-1`, "updated@example.com")],
      [leadConnectorAccountId],
    );

    const [performanceCounts] = await db
      .select({
        campaigns: sql<number>`count(distinct ${campaigns.id})::int`,
        adGroups: sql<number>`count(distinct ${adGroups.id})::int`,
        ads: sql<number>`count(distinct ${ads.id})::int`,
        performanceRows: sql<number>`count(distinct ${adPerformanceDaily.id})::int`,
      })
      .from(campaigns)
      .innerJoin(adGroups, eq(adGroups.campaignId, campaigns.id))
      .innerJoin(ads, eq(ads.adGroupId, adGroups.id))
      .innerJoin(adPerformanceDaily, eq(adPerformanceDaily.adId, ads.id))
      .where(eq(campaigns.sourceAccountId, performanceSourceId));
    expect(performanceCounts).toEqual({
      campaigns: 1,
      adGroups: 1,
      ads: 1,
      performanceRows: 2,
    });

    const [updatedPerformance] = await db
      .select({ clicks: adPerformanceDaily.clicks })
      .from(adPerformanceDaily)
      .where(
        and(
          eq(adPerformanceDaily.sourceAccountId, performanceSourceId),
          eq(adPerformanceDaily.date, "2026-07-15"),
        ),
      );
    expect(updatedPerformance?.clicks).toBe(99);

    const [leadCounts] = await db
      .select({
        forms: sql<number>`count(distinct ${leadForms.id})::int`,
        leads: sql<number>`count(distinct ${leads.id})::int`,
      })
      .from(leads)
      .leftJoin(leadForms, eq(leads.leadFormId, leadForms.id))
      .where(eq(leads.sourceAccountId, leadSourceId));
    expect(leadCounts).toEqual({ forms: 1, leads: 2 });

    const [updatedLead] = await db
      .select({ email: leads.email })
      .from(leads)
      .where(
        and(
          eq(leads.sourceAccountId, leadSourceId),
          eq(leads.externalId, `${clientSlug}-lead-1`),
        ),
      );
    expect(updatedLead?.email).toBe("updated@example.com");
  });
});
