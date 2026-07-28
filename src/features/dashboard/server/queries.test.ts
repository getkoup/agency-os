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
  ghlContacts,
  ghlOpportunities,
  ghlOpportunityMatches,
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
    await db.delete(clients).where(eq(clients.slug, slug));
    await db
      .delete(sourceAccounts)
      .where(
        inArray(sourceAccounts.connectorAccountId, [
          leadConnectorAccountId,
          performanceConnectorAccountId,
        ]),
      );
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
    const [mapping] = await db
      .insert(integrationMappings)
      .values({
        clientId,
        provider: "ghl",
        externalLocationId: `${slug}-location`,
        timezone: "America/New_York",
        syncFromAt: new Date("2026-07-01T00:00:00.000Z"),
      })
      .returning({ id: integrationMappings.id });
    if (!mapping) throw new Error("Could not create analytics test mapping");
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
    const [lead] = await db
      .insert(leads)
      .values({
        sourceAccountId: leadSource.id,
        externalId: `${slug}-lead`,
        campaignId: campaign.id,
        adGroupId: adGroup.id,
        adId: ad.id,
        occurredAt: new Date("2026-07-07T03:30:00.000Z"),
        rawPayload: {},
      })
      .returning({ id: leads.id });
    if (!lead) throw new Error("Could not create analytics test lead");
    const storedContacts = await db
      .insert(ghlContacts)
      .values([
        {
          integrationMappingId: mapping.id,
          externalId: `${slug}-form-contact`,
          providerUpdatedAt: new Date("2026-07-06T16:00:00.000Z"),
          rawPayload: {},
        },
        {
          integrationMappingId: mapping.id,
          externalId: `${slug}-dm-contact`,
          providerUpdatedAt: new Date("2026-07-06T17:00:00.000Z"),
          rawPayload: {},
        },
      ])
      .returning({ id: ghlContacts.id, externalId: ghlContacts.externalId });
    const formContact = storedContacts.find(({ externalId }) =>
      externalId.endsWith("-form-contact"),
    );
    const dmContact = storedContacts.find(({ externalId }) =>
      externalId.endsWith("-dm-contact"),
    );
    if (!formContact || !dmContact) {
      throw new Error("Could not create analytics test contacts");
    }
    const storedOpportunities = await db
      .insert(ghlOpportunities)
      .values([
        {
          integrationMappingId: mapping.id,
          contactId: formContact.id,
          externalId: `${slug}-form-booking`,
          status: "won",
          source: "Facebook",
          tags: ["tint"],
          wonAt: new Date("2026-07-06T16:00:00.000Z"),
          providerUpdatedAt: new Date("2026-07-06T16:00:00.000Z"),
          rawPayload: { source: "Facebook" },
        },
        {
          integrationMappingId: mapping.id,
          contactId: dmContact.id,
          externalId: `${slug}-dm-booking`,
          status: "won",
          source: null,
          tags: ["tint"],
          wonAt: new Date("2026-07-06T17:00:00.000Z"),
          providerUpdatedAt: new Date("2026-07-06T17:00:00.000Z"),
          rawPayload: { source: null },
        },
      ])
      .returning({ id: ghlOpportunities.id, source: ghlOpportunities.source });
    const formOpportunity = storedOpportunities.find(
      ({ source }) => source === "Facebook",
    );
    const dmOpportunity = storedOpportunities.find(
      ({ source }) => source === null,
    );
    if (!formOpportunity || !dmOpportunity) {
      throw new Error("Could not create analytics test opportunities");
    }
    await db.insert(ghlOpportunityMatches).values([
      {
        opportunityId: formOpportunity.id,
        leadId: lead.id,
        status: "matched",
        method: "email",
        candidateCount: 1,
      },
      {
        opportunityId: dmOpportunity.id,
        status: "unmatched",
        candidateCount: 0,
      },
    ]);
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
    await db.delete(clients).where(eq(clients.id, clientId));
    await db
      .delete(sourceAccounts)
      .where(
        inArray(sourceAccounts.connectorAccountId, [
          leadConnectorAccountId,
          performanceConnectorAccountId,
        ]),
      );
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
        bookings: 2,
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
      bookings: 2,
      conversion: 2 / 3,
    });
    expect(leadAnalytics).toMatchObject({
      facebookLeadFormLeads: 1,
      dmLeads: 2,
      totalLeads: 3,
      totalBookings: 2,
      conversion: 2 / 3,
      leadTypes: [
        { type: "Facebook Lead Forms", leads: 1 },
        { type: "DM Conversations", leads: 2 },
      ],
      serviceCategories: [
        {
          categoryName: "Tint",
          facebookLeadFormLeads: 1,
          facebookLeadFormBookings: 1,
          facebookLeadFormConversion: 1,
          dmLeads: 2,
          dmBookings: 1,
          dmConversion: 0.5,
          totalLeads: 3,
          totalBookings: 2,
          conversion: 2 / 3,
        },
      ],
    });
    expect(leadAnalytics.daily).toEqual([
      {
        date: "2026-07-06",
        facebookLeadFormLeads: 1,
        dmLeads: 2,
        totalLeads: 3,
        bookings: 2,
        conversion: 2 / 3,
      },
    ]);
    expect(trend).toEqual([
      {
        date: "2026-07-06",
        spend: "30.00",
        facebookLeadFormLeads: 1,
        dmLeads: 2,
        totalLeads: 3,
        wonOpportunities: 2,
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
      activeAdSetCount: 1,
      activeAdCount: 1,
      totalSpend: "30.00",
      totalLeads: 3,
      cpl: "10.00",
      dmLeads: 2,
      costPerConversationStarted: "15.00",
      isTruncated: false,
      campaigns: [
        expect.objectContaining({
          name: "Ceramic Tint Campaign",
          spend: "30.00",
          totalLeads: 3,
          cpl: "10.00",
          dmLeads: 2,
          costPerConversationStarted: "15.00",
          activeAdSetCount: 1,
          activeAdCount: 1,
          adSets: [
            expect.objectContaining({
              name: "Client Analytics Query Test Ad Group",
              spend: "30.00",
              totalLeads: 3,
              cpl: "10.00",
              dmLeads: 2,
              costPerConversationStarted: "15.00",
              ads: [
                expect.objectContaining({
                  name: "Client Analytics Query Test Ad",
                  spend: "30.00",
                  facebookLeadFormLeads: 1,
                  dmLeads: 2,
                  totalLeads: 3,
                  cpl: "10.00",
                  costPerConversationStarted: "15.00",
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });
});
