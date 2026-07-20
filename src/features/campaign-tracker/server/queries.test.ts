import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { saveCampaignRemark } from "~/features/campaign-tracker/server/actions";
import {
  getCampaignTrackerRows,
  resolveCampaignTrackerDates,
} from "~/features/campaign-tracker/server/queries";
import { db } from "~/server/db";
import {
  adGroups,
  adPerformanceDaily,
  ads,
  campaigns,
  clients,
  integrationMappings,
  leadClassificationRules,
  leads,
  sourceAccounts,
  users,
} from "~/server/db/schema";

const slug = "campaign-tracker-query-test";
const userId = "campaign-tracker-manager-test";
const leadConnectorAccountId = `facebook_leads__${slug}`;
const performanceConnectorAccountId = `facebook__${slug}`;
let campaignId = "";

beforeAll(async () => {
  await db
    .delete(sourceAccounts)
    .where(
      inArray(sourceAccounts.connectorAccountId, [
        leadConnectorAccountId,
        performanceConnectorAccountId,
      ]),
    );
  await db.delete(clients).where(eq(clients.slug, slug));
  await db.delete(users).where(eq(users.id, userId));
  await db.insert(users).values({
    id: userId,
    email: `${slug}@example.com`,
    name: "Campaign Tracker Manager",
    role: "manager",
  });
  const [client] = await db
    .insert(clients)
    .values({ slug, name: "Campaign Tracker Query Test" })
    .returning({ id: clients.id });
  if (!client) throw new Error("Could not create campaign tracker client");
  const sources = await db
    .insert(sourceAccounts)
    .values([
      {
        clientId: client.id,
        dataProvider: "windsor",
        platform: "facebook",
        connector: "facebook_leads",
        connectorAccountId: leadConnectorAccountId,
        externalAccountId: `${slug}-leads`,
        externalAccountName: "Campaign Tracker Leads",
        normalizedName: "campaigntrackerleads",
      },
      {
        clientId: client.id,
        dataProvider: "windsor",
        platform: "facebook",
        connector: "facebook",
        connectorAccountId: performanceConnectorAccountId,
        externalAccountId: `${slug}-performance`,
        externalAccountName: "Campaign Tracker Performance",
        normalizedName: "campaigntrackerperformance",
      },
    ])
    .returning({ id: sourceAccounts.id, connector: sourceAccounts.connector });
  const leadSource = sources.find(
    ({ connector }) => connector === "facebook_leads",
  );
  const performanceSource = sources.find(
    ({ connector }) => connector === "facebook",
  );
  if (!leadSource || !performanceSource)
    throw new Error("Could not create campaign tracker sources");
  await db.insert(integrationMappings).values({
    clientId: client.id,
    provider: "ghl",
    externalLocationId: `${slug}-location`,
    timezone: "UTC",
    syncFromAt: new Date("2026-07-01T00:00:00.000Z"),
  });
  const [campaign] = await db
    .insert(campaigns)
    .values({
      sourceAccountId: performanceSource.id,
      externalId: `${slug}-campaign`,
      name: "Tint Lead Form Campaign",
    })
    .returning({ id: campaigns.id });
  if (!campaign) throw new Error("Could not create campaign tracker campaign");
  campaignId = campaign.id;
  const [adGroup] = await db
    .insert(adGroups)
    .values({
      campaignId,
      externalId: `${slug}-ad-group`,
      name: "Campaign Tracker Ad Group",
    })
    .returning({ id: adGroups.id });
  if (!adGroup) throw new Error("Could not create campaign tracker ad group");
  const [ad] = await db
    .insert(ads)
    .values({
      adGroupId: adGroup.id,
      externalId: `${slug}-ad`,
      name: "Campaign Tracker Ad",
    })
    .returning({ id: ads.id });
  if (!ad) throw new Error("Could not create campaign tracker ad");
  await db.insert(leadClassificationRules).values({
    clientId: client.id,
    categoryName: "Tint",
    keywords: ["tint"],
    priority: 100,
  });
  await db.insert(adPerformanceDaily).values(
    [
      { date: "2026-07-15", spend: "10.00", dmLeads: 1 },
      { date: "2026-07-16", spend: "40.00", dmLeads: 2 },
      { date: "2026-07-17", spend: "60.00", dmLeads: 2 },
      { date: "2026-07-18", spend: "60.00", dmLeads: 2 },
    ].map(({ date, spend, dmLeads }) => ({
      sourceAccountId: performanceSource.id,
      campaignId,
      adGroupId: adGroup.id,
      adId: ad.id,
      date,
      spend,
      messagingConversations: dmLeads,
      providerMetrics: {},
      rawPayload: {},
    })),
  );
  await db.insert(leads).values({
    sourceAccountId: leadSource.id,
    externalId: `${slug}-lead`,
    campaignId,
    adGroupId: adGroup.id,
    adId: ad.id,
    occurredAt: new Date("2026-07-18T12:00:00.000Z"),
    rawPayload: {},
  });
});

afterAll(async () => {
  await db
    .delete(sourceAccounts)
    .where(
      inArray(sourceAccounts.connectorAccountId, [
        leadConnectorAccountId,
        performanceConnectorAccountId,
      ]),
    );
  await db.delete(clients).where(eq(clients.slug, slug));
  await db.delete(users).where(eq(users.id, userId));
});

describe("campaign tracker queries", () => {
  it("resolves four dates ending on the selected date", () => {
    expect(resolveCampaignTrackerDates("2026-07-18")).toEqual([
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
    ]);
  });

  it("returns campaign types and daily CPL with combined leads", async () => {
    await saveCampaignRemark({
      campaignId,
      date: "2026-07-18",
      remark: "  Budget adjusted  ",
      userId,
    });
    const result = await getCampaignTrackerRows("2026-07-18");

    expect(result).toMatchObject({
      focusDate: "2026-07-18",
      isTruncated: false,
      rows: [
        {
          id: campaignId,
          clientName: "Campaign Tracker Query Test",
          campaignName: "Tint Lead Form Campaign",
          campaignType: "Tint",
          remark: "Budget adjusted",
          daily: [
            { date: "2026-07-15", metrics: { totalLeads: 1, cpl: "10.00" } },
            { date: "2026-07-16", metrics: { totalLeads: 2, cpl: "20.00" } },
            { date: "2026-07-17", metrics: { totalLeads: 2, cpl: "30.00" } },
            {
              date: "2026-07-18",
              metrics: {
                facebookLeadFormLeads: 1,
                dmLeads: 2,
                totalLeads: 3,
                cpl: "20.00",
              },
            },
          ],
        },
      ],
    });
  });

  it("updates and clears a dated remark", async () => {
    await saveCampaignRemark({
      campaignId,
      date: "2026-07-18",
      remark: "Creative changed",
      userId,
    });
    expect((await getCampaignTrackerRows("2026-07-18")).rows[0]?.remark).toBe(
      "Creative changed",
    );

    await saveCampaignRemark({
      campaignId,
      date: "2026-07-18",
      remark: "   ",
      userId,
    });
    expect((await getCampaignTrackerRows("2026-07-18")).rows[0]?.remark).toBe(
      "",
    );
  });
});
