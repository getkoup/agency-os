import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getClientAnalytics,
  getDashboardOverview,
  getLeadAnalytics,
  getMonitoringCampaigns,
  getPerformanceRows,
  getTrend,
  resolveMonitoringDateRange,
} from "~/features/dashboard/server/queries";
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
} from "~/server/db/schema";

const slug = "client-analytics-query-test";
const leadConnectorAccountId = `facebook_leads__${slug}`;
const performanceConnectorAccountId = `facebook__${slug}`;
let clientId = "";

describe("dashboard queries", () => {
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
    const [client] = await db
      .insert(clients)
      .values({ slug, name: "Client Analytics Query Test" })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create analytics test client");
    clientId = client.id;
    const storedSources = await db
      .insert(sourceAccounts)
      .values([
        {
          clientId,
          dataProvider: "windsor",
          platform: "facebook",
          connector: "facebook_leads",
          connectorAccountId: leadConnectorAccountId,
          externalAccountId: `${slug}-leads`,
          externalAccountName: "Client Analytics Query Test Leads",
          normalizedName: "clientanalyticsquerytestleads",
        },
        {
          clientId,
          dataProvider: "windsor",
          platform: "facebook",
          connector: "facebook",
          connectorAccountId: performanceConnectorAccountId,
          externalAccountId: `${slug}-performance`,
          externalAccountName: "Client Analytics Query Test Performance",
          normalizedName: "clientanalyticsquerytestperformance",
        },
      ])
      .returning({
        id: sourceAccounts.id,
        connector: sourceAccounts.connector,
      });
    const leadSource = storedSources.find(
      ({ connector }) => connector === "facebook_leads",
    );
    const performanceSource = storedSources.find(
      ({ connector }) => connector === "facebook",
    );
    if (!leadSource || !performanceSource) {
      throw new Error("Could not create analytics test sources");
    }
    await db.insert(integrationMappings).values({
      clientId,
      provider: "ghl",
      externalLocationId: `${slug}-location`,
      timezone: "America/New_York",
      syncFromAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    const [campaign] = await db
      .insert(campaigns)
      .values({
        sourceAccountId: performanceSource.id,
        externalId: `${slug}-campaign`,
        name: "Ceramic Tint Campaign",
      })
      .returning({ id: campaigns.id });
    if (!campaign) throw new Error("Could not create analytics test campaign");
    const [adGroup] = await db
      .insert(adGroups)
      .values({
        campaignId: campaign.id,
        externalId: `${slug}-ad-group`,
        name: "Client Analytics Query Test Ad Group",
      })
      .returning({ id: adGroups.id });
    if (!adGroup) throw new Error("Could not create analytics test ad group");
    const [ad] = await db
      .insert(ads)
      .values({
        adGroupId: adGroup.id,
        externalId: `${slug}-ad`,
        name: "Client Analytics Query Test Ad",
      })
      .returning({ id: ads.id });
    if (!ad) throw new Error("Could not create analytics test ad");
    await db.insert(leads).values({
      sourceAccountId: leadSource.id,
      externalId: `${slug}-lead`,
      campaignId: campaign.id,
      adGroupId: adGroup.id,
      adId: ad.id,
      occurredAt: new Date("2026-07-07T03:30:00.000Z"),
      rawPayload: {},
    });
    await db.insert(leadClassificationRules).values([
      {
        clientId,
        categoryName: "Tint",
        keywords: ["tint"],
        matchMode: "any",
        priority: 100,
      },
      {
        clientId,
        categoryName: "Ceramic Coating",
        keywords: ["ceramic", "coating"],
        matchMode: "any",
        priority: 80,
      },
    ]);
    await db.insert(adPerformanceDaily).values({
      sourceAccountId: performanceSource.id,
      campaignId: campaign.id,
      adGroupId: adGroup.id,
      adId: ad.id,
      date: "2026-07-06",
      spend: "30.00",
      messagingConversations: 2,
      providerMetrics: {},
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
    await db.delete(clients).where(eq(clients.id, clientId));
  });

  it("resolves an inclusive three-day monitoring range", () => {
    expect(
      resolveMonitoringDateRange(new Date("2026-07-18T18:00:00.000Z")),
    ).toEqual({ from: "2026-07-16", to: "2026-07-18" });
  });

  it("qualifies correlated client IDs and combines both lead types", async () => {
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
        facebookLeadFormLeads: 1,
        dmLeads: 2,
        totalLeads: 3,
        bookings: 0,
        estimatedRevenue: "0.00",
      }),
    ]);
  });

  it("includes UTC-next-day lead forms on the prior New York date", async () => {
    const result = await getClientAnalytics({
      from: "2026-07-06",
      to: "2026-07-06",
      page: 1,
      pageSize: 25,
      clientIds: [clientId],
    });

    expect(result.rows[0]).toMatchObject({
      facebookLeadFormLeads: 1,
      dmLeads: 2,
      totalLeads: 3,
      timezone: "America/New_York",
    });
  });

  it("uses the combined lead total across dashboard views", async () => {
    const filters = {
      from: "2026-07-06",
      to: "2026-07-06",
      clientId: undefined,
      platform: undefined,
      campaignId: undefined,
    };
    const scope = { includeUnassigned: false, clientIds: [clientId] };
    const [overview, leadAnalytics, trend, performance, monitoring] =
      await Promise.all([
        getDashboardOverview(filters, scope),
        getLeadAnalytics(filters, scope),
        getTrend(filters, scope),
        getPerformanceRows(filters, scope, 1, 25),
        getMonitoringCampaigns(filters, scope),
      ]);

    expect(overview).toMatchObject({
      facebookLeadFormLeads: 1,
      dmLeads: 2,
      totalLeads: 3,
    });
    expect(leadAnalytics).toMatchObject({
      facebookLeadFormLeads: 1,
      dmLeads: 2,
      totalLeads: 3,
      leadTypes: [
        { type: "Facebook Lead Forms", leads: 1 },
        { type: "DM Conversations", leads: 2 },
      ],
      serviceCategories: [
        {
          categoryName: "Tint",
          facebookLeadFormLeads: 1,
          dmLeads: 2,
          totalLeads: 3,
        },
      ],
    });
    expect(leadAnalytics.daily).toEqual([
      {
        date: "2026-07-06",
        facebookLeadFormLeads: 1,
        dmLeads: 2,
        totalLeads: 3,
        bookings: 0,
        conversion: 0,
      },
    ]);
    expect(trend).toEqual([
      {
        date: "2026-07-06",
        spend: "30.00",
        facebookLeadFormLeads: 1,
        dmLeads: 2,
        totalLeads: 3,
        wonOpportunities: 0,
      },
    ]);
    expect(performance.rows).toEqual([
      expect.objectContaining({
        facebookLeadFormLeads: 1,
        dmLeads: 2,
        totalLeads: 3,
      }),
    ]);
    expect(monitoring).toMatchObject({
      from: "2026-07-06",
      to: "2026-07-06",
      activeCampaignCount: 1,
      activeAdCount: 1,
      totalSpend: "30.00",
      totalLeads: 3,
      cpl: "10.00",
      isTruncated: false,
      campaigns: [
        expect.objectContaining({
          name: "Ceramic Tint Campaign",
          spend: "30.00",
          totalLeads: 3,
          cpl: "10.00",
          ads: [
            expect.objectContaining({
              name: "Client Analytics Query Test Ad",
              spend: "30.00",
              facebookLeadFormLeads: 1,
              dmLeads: 2,
              totalLeads: 3,
              cpl: "10.00",
            }),
          ],
        }),
      ],
    });
  });
});
