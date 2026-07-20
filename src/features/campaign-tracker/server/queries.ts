import "server-only";

import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import {
  classifyCampaign,
  type LeadClassificationRule,
} from "~/features/dashboard/lead-classification";
import { db } from "~/server/db";
import {
  adPerformanceDaily,
  campaignDailyRemarks,
  campaigns,
  clients,
  integrationMappings,
  leadClassificationRules,
  leads,
  sourceAccounts,
} from "~/server/db/schema";

const sourceAccountTimezoneSql = sql<string>`coalesce((
  select mapping."timezone"
  from ${integrationMappings} mapping
  where mapping."clientId" = ${sourceAccounts.clientId}
    and mapping."provider" = 'ghl'
  limit 1
), 'UTC')`;
const leadLocalDateSql = sql<string>`timezone(${sourceAccountTimezoneSql}, ${leads.occurredAt})::date`;

export function resolveCampaignTrackerDates(focusDate: string) {
  const end = new Date(`${focusDate}T00:00:00.000Z`);
  if (
    Number.isNaN(end.getTime()) ||
    end.toISOString().slice(0, 10) !== focusDate
  )
    throw new Error("Invalid campaign tracker date");
  return Array.from({ length: 4 }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (3 - index));
    return date.toISOString().slice(0, 10);
  });
}

export async function getCampaignTrackerRows(focusDate: string) {
  const dates = resolveCampaignTrackerDates(focusDate);
  const from = dates[0];
  if (!from) throw new Error("Campaign tracker date range is empty");
  const campaignLimit = 500;
  const activeCampaignRows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(adPerformanceDaily)
    .innerJoin(
      sourceAccounts,
      eq(adPerformanceDaily.sourceAccountId, sourceAccounts.id),
    )
    .innerJoin(clients, eq(sourceAccounts.clientId, clients.id))
    .innerJoin(campaigns, eq(adPerformanceDaily.campaignId, campaigns.id))
    .where(
      and(
        eq(sourceAccounts.status, "active"),
        eq(clients.status, "active"),
        gte(adPerformanceDaily.date, from),
        lte(adPerformanceDaily.date, focusDate),
      ),
    )
    .groupBy(campaigns.id, campaigns.name, clients.id, clients.name)
    .orderBy(asc(clients.name), asc(campaigns.name), asc(campaigns.id))
    .limit(campaignLimit + 1);
  const isTruncated = activeCampaignRows.length > campaignLimit;
  const activeCampaigns = activeCampaignRows.slice(0, campaignLimit);
  const campaignIds = activeCampaigns.map(({ id }) => id);
  const clientIds = [
    ...new Set(activeCampaigns.map(({ clientId }) => clientId)),
  ];
  if (!campaignIds.length) {
    return { focusDate, dates, rows: [], isTruncated };
  }
  const [performanceRows, formLeadRows, ruleRows, remarkRows] =
    await Promise.all([
      db
        .select({
          campaignId: adPerformanceDaily.campaignId,
          date: adPerformanceDaily.date,
          spend: sql<string>`coalesce(sum(${adPerformanceDaily.spend}), 0)::numeric(14,2)`,
          dmLeads: sql<number>`coalesce(sum(${adPerformanceDaily.messagingConversations}), 0)::int`,
        })
        .from(adPerformanceDaily)
        .where(
          and(
            inArray(adPerformanceDaily.campaignId, campaignIds),
            gte(adPerformanceDaily.date, from),
            lte(adPerformanceDaily.date, focusDate),
          ),
        )
        .groupBy(adPerformanceDaily.campaignId, adPerformanceDaily.date),
      db
        .select({
          campaignId: leads.campaignId,
          date: sql<string>`to_char(${leadLocalDateSql}, 'YYYY-MM-DD')`,
          facebookLeadFormLeads: count(),
        })
        .from(leads)
        .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
        .where(
          and(
            inArray(leads.campaignId, campaignIds),
            sql`${leadLocalDateSql} >= ${from}::date`,
            sql`${leadLocalDateSql} <= ${focusDate}::date`,
          ),
        )
        .groupBy(leads.campaignId, sql`${leadLocalDateSql}`),
      db
        .select({
          id: leadClassificationRules.id,
          clientId: leadClassificationRules.clientId,
          categoryName: leadClassificationRules.categoryName,
          keywords: leadClassificationRules.keywords,
          matchMode: leadClassificationRules.matchMode,
          priority: leadClassificationRules.priority,
        })
        .from(leadClassificationRules)
        .where(
          and(
            eq(leadClassificationRules.status, "active"),
            inArray(leadClassificationRules.clientId, clientIds),
          ),
        ),
      db
        .select({
          campaignId: campaignDailyRemarks.campaignId,
          remark: campaignDailyRemarks.remark,
        })
        .from(campaignDailyRemarks)
        .where(
          and(
            inArray(campaignDailyRemarks.campaignId, campaignIds),
            eq(campaignDailyRemarks.date, focusDate),
          ),
        ),
    ]);
  const rulesByClient = new Map<string, LeadClassificationRule[]>();
  for (const rule of ruleRows) {
    const rules = rulesByClient.get(rule.clientId) ?? [];
    rules.push(rule);
    rulesByClient.set(rule.clientId, rules);
  }
  const remarksByCampaign = new Map(
    remarkRows.map((row) => [row.campaignId, row.remark]),
  );
  const metricsByCampaignDate = new Map<
    string,
    {
      spend: number;
      facebookLeadFormLeads: number;
      dmLeads: number;
    }
  >();
  function metricKey(campaignId: string, date: string) {
    return `${campaignId}:${date}`;
  }
  for (const row of performanceRows) {
    metricsByCampaignDate.set(metricKey(row.campaignId, row.date), {
      spend: Number(row.spend),
      facebookLeadFormLeads: 0,
      dmLeads: row.dmLeads,
    });
  }
  for (const row of formLeadRows) {
    if (!row.campaignId) continue;
    const key = metricKey(row.campaignId, row.date);
    const metric = metricsByCampaignDate.get(key) ?? {
      spend: 0,
      facebookLeadFormLeads: 0,
      dmLeads: 0,
    };
    metric.facebookLeadFormLeads += row.facebookLeadFormLeads;
    metricsByCampaignDate.set(key, metric);
  }
  return {
    focusDate,
    dates,
    isTruncated,
    rows: activeCampaigns.map((campaign) => ({
      id: campaign.id,
      clientName: campaign.clientName,
      campaignName: campaign.name,
      campaignType: classifyCampaign(
        campaign.name,
        rulesByClient.get(campaign.clientId) ?? [],
      ),
      remark: remarksByCampaign.get(campaign.id) ?? "",
      daily: dates.map((date) => {
        const metric = metricsByCampaignDate.get(metricKey(campaign.id, date));
        if (!metric) return { date, metrics: null };
        const totalLeads = metric.facebookLeadFormLeads + metric.dmLeads;
        return {
          date,
          metrics: {
            spend: metric.spend.toFixed(2),
            facebookLeadFormLeads: metric.facebookLeadFormLeads,
            dmLeads: metric.dmLeads,
            totalLeads,
            cpl:
              totalLeads === 0 ? null : (metric.spend / totalLeads).toFixed(2),
          },
        };
      }),
    })),
  };
}
