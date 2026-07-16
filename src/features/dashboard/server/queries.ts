import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

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
  leadForms,
  leads,
  revenueRules,
  sourceAccounts,
  syncRuns,
} from "~/server/db/schema";
import { type DashboardFilters } from "~/features/dashboard/server/schemas";
import { calculateClientHealth } from "~/features/dashboard/health";

export interface AccessibleScope {
  includeUnassigned: boolean;
  clientIds: string[] | null;
}

function clientScopeCondition(scope: AccessibleScope): SQL | undefined {
  if (scope.clientIds === null) return undefined;
  if (scope.clientIds.length === 0) {
    return scope.includeUnassigned
      ? isNull(sourceAccounts.clientId)
      : sql`false`;
  }
  const assigned = inArray(sourceAccounts.clientId, scope.clientIds);
  return scope.includeUnassigned
    ? or(assigned, isNull(sourceAccounts.clientId))
    : assigned;
}
function opportunityScopeCondition(scope: AccessibleScope): SQL | undefined {
  if (scope.clientIds === null) return undefined;
  return scope.clientIds.length
    ? inArray(integrationMappings.clientId, scope.clientIds)
    : sql`false`;
}
const sourceAccountTimezoneSql = sql<string>`coalesce((
  select mapping."timezone"
  from ${integrationMappings} mapping
  where mapping."clientId" = ${sourceAccounts.clientId}
    and mapping."provider" = 'ghl'
  limit 1
), 'UTC')`;
const leadLocalDateSql = sql<string>`timezone(${sourceAccountTimezoneSql}, ${leads.occurredAt})::date`;
const opportunityLocalDateSql = sql<string>`timezone(${integrationMappings.timezone}, ${ghlOpportunities.wonAt})::date`;
const clientTimezoneSql = sql<string>`coalesce((
  select mapping."timezone"
  from ${integrationMappings} mapping
  where mapping."clientId" = ${clients.id}
    and mapping."provider" = 'ghl'
  limit 1
), 'UTC')`;

function opportunityConditions(
  filters: DashboardFilters,
  scope: AccessibleScope,
): Array<SQL | undefined> {
  return [
    opportunityScopeCondition(scope),
    sql`${opportunityLocalDateSql} >= ${filters.from}::date`,
    sql`${opportunityLocalDateSql} <= ${filters.to}::date`,
    filters.platform
      ? eq(sourceAccounts.platform, filters.platform)
      : undefined,
    filters.campaignId ? eq(campaigns.id, filters.campaignId) : undefined,
  ];
}

const opportunityRevenueSql = sql<string>`coalesce((
  select sum(rr."revenueValue")
  from ${revenueRules} rr
  where rr."clientId" = ${integrationMappings.clientId}
    and rr."status" = 'active'
    and lower(rr."tagName") in (
      select distinct lower(btrim(tag))
      from unnest(${ghlOpportunities.tags}) tag
      where btrim(tag) <> ''
    )
), 0)::numeric(14,2)`;

const opportunityHasRuleSql = sql<boolean>`exists(
  select 1
  from ${revenueRules} rr
  where rr."clientId" = ${integrationMappings.clientId}
    and rr."status" = 'active'
    and lower(rr."tagName") in (
      select distinct lower(btrim(tag))
      from unnest(${ghlOpportunities.tags}) tag
      where btrim(tag) <> ''
    )
)`;

function performanceConditions(
  filters: DashboardFilters,
  scope: AccessibleScope,
): Array<SQL | undefined> {
  return [
    clientScopeCondition(scope),
    gte(adPerformanceDaily.date, filters.from),
    lte(adPerformanceDaily.date, filters.to),
    filters.platform
      ? eq(sourceAccounts.platform, filters.platform)
      : undefined,
    filters.campaignId ? eq(campaigns.id, filters.campaignId) : undefined,
  ];
}

function leadConditions(
  filters: DashboardFilters,
  scope: AccessibleScope,
): Array<SQL | undefined> {
  return [
    clientScopeCondition(scope),
    sql`${leadLocalDateSql} >= ${filters.from}::date`,
    sql`${leadLocalDateSql} <= ${filters.to}::date`,
    filters.platform
      ? eq(sourceAccounts.platform, filters.platform)
      : undefined,
    filters.campaignId ? eq(campaigns.id, filters.campaignId) : undefined,
  ];
}

export async function getDashboardOverview(
  filters: DashboardFilters,
  scope: AccessibleScope,
) {
  const [performance] = await db
    .select({
      spend: sql<string>`coalesce(sum(${adPerformanceDaily.spend}), 0)::numeric(14,2)`,
      platformLeads: sql<number>`coalesce(sum(${adPerformanceDaily.leads}), 0)::int`,
      messagingConversations: sql<number>`coalesce(sum(${adPerformanceDaily.messagingConversations}), 0)::int`,
      linkClicks: sql<number>`coalesce(sum(${adPerformanceDaily.linkClicks}), 0)::int`,
    })
    .from(adPerformanceDaily)
    .innerJoin(
      sourceAccounts,
      eq(adPerformanceDaily.sourceAccountId, sourceAccounts.id),
    )
    .innerJoin(campaigns, eq(adPerformanceDaily.campaignId, campaigns.id))
    .where(and(...performanceConditions(filters, scope)));
  const [captured] = await db
    .select({ count: count() })
    .from(leads)
    .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(and(...leadConditions(filters, scope)));
  const [bookings] = await db
    .select({
      count: count(),
      estimatedRevenue: sql<string>`coalesce(sum(${opportunityRevenueSql}), 0)::numeric(14,2)`,
      missingRuleCount: sql<number>`count(*) filter (where not ${opportunityHasRuleSql})::int`,
    })
    .from(ghlOpportunities)
    .innerJoin(
      integrationMappings,
      eq(ghlOpportunities.integrationMappingId, integrationMappings.id),
    )
    .leftJoin(
      ghlOpportunityMatches,
      eq(ghlOpportunities.id, ghlOpportunityMatches.opportunityId),
    )
    .leftJoin(leads, eq(ghlOpportunityMatches.leadId, leads.id))
    .leftJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(and(...opportunityConditions(filters, scope)));
  const [activeClients] = await db
    .select({ count: count() })
    .from(clients)
    .where(
      and(
        eq(clients.status, "active"),
        scope.clientIds === null
          ? undefined
          : scope.clientIds.length
            ? inArray(clients.id, scope.clientIds)
            : sql`false`,
      ),
    );
  const [latestSync] = await db
    .select({
      status: syncRuns.status,
      startedAt: syncRuns.startedAt,
      completedAt: syncRuns.completedAt,
    })
    .from(syncRuns)
    .where(eq(syncRuns.dataProvider, "windsor"))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  const spend = performance?.spend ?? "0.00";
  const platformLeads = performance?.platformLeads ?? 0;
  const linkClicks = performance?.linkClicks ?? 0;
  const capturedLeads = captured?.count ?? 0;
  const bookingCount = bookings?.count ?? 0;
  return {
    spend,
    platformLeads,
    capturedLeads: captured?.count ?? 0,
    activeClientCount: activeClients?.count ?? 0,
    bookings: bookingCount,
    conversion: capturedLeads === 0 ? 0 : bookingCount / capturedLeads,
    estimatedRevenue: bookings?.estimatedRevenue ?? "0.00",
    missingRuleCount: bookings?.missingRuleCount ?? 0,
    messagingConversations: performance?.messagingConversations ?? 0,
    linkClicks,
    cpl:
      capturedLeads === 0 ? null : (Number(spend) / capturedLeads).toFixed(2),
    cpc: linkClicks === 0 ? null : (Number(spend) / linkClicks).toFixed(2),
    latestSync: latestSync ?? null,
  };
}

export async function getPerformanceRows(
  filters: DashboardFilters,
  scope: AccessibleScope,
  page: number,
  pageSize: number,
) {
  const where = and(...performanceConditions(filters, scope));
  const [totalRow] = await db
    .select({ count: count() })
    .from(adPerformanceDaily)
    .innerJoin(
      sourceAccounts,
      eq(adPerformanceDaily.sourceAccountId, sourceAccounts.id),
    )
    .innerJoin(campaigns, eq(adPerformanceDaily.campaignId, campaigns.id))
    .where(where);
  const rows = await db
    .select({
      id: adPerformanceDaily.id,
      date: adPerformanceDaily.date,
      client: clients.name,
      platform: sourceAccounts.platform,
      sourceAccount: sourceAccounts.externalAccountName,
      campaign: campaigns.name,
      adGroup: adGroups.name,
      ad: ads.name,
      spend: sql<string>`coalesce(${adPerformanceDaily.spend}, 0)::numeric(14,2)`,
      platformLeads: sql<number>`coalesce(${adPerformanceDaily.leads}, 0)::int`,
      messagingConversations: sql<number>`coalesce(${adPerformanceDaily.messagingConversations}, 0)::int`,
      linkClicks: sql<number>`coalesce(${adPerformanceDaily.linkClicks}, 0)::int`,
      ctr: sql<string | null>`${adPerformanceDaily.ctr}::numeric(14,2)`,
      cpc: sql<string | null>`${adPerformanceDaily.cpc}::numeric(14,2)`,
      capturedLeads: sql<number>`(
        select count(*)::int
        from ${leads} creative_lead
        where creative_lead."adId" = ${adPerformanceDaily.adId}
          and timezone(${sourceAccountTimezoneSql}, creative_lead."occurredAt")::date = ${adPerformanceDaily.date}::date
      )`,
    })
    .from(adPerformanceDaily)
    .innerJoin(
      sourceAccounts,
      eq(adPerformanceDaily.sourceAccountId, sourceAccounts.id),
    )
    .leftJoin(clients, eq(sourceAccounts.clientId, clients.id))
    .innerJoin(campaigns, eq(adPerformanceDaily.campaignId, campaigns.id))
    .innerJoin(adGroups, eq(adPerformanceDaily.adGroupId, adGroups.id))
    .innerJoin(ads, eq(adPerformanceDaily.adId, ads.id))
    .where(where)
    .orderBy(desc(adPerformanceDaily.date), desc(adPerformanceDaily.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: totalRow?.count ?? 0,
    rows: rows.map((row) => ({
      ...row,
      cpl:
        row.capturedLeads === 0
          ? null
          : (Number(row.spend) / row.capturedLeads).toFixed(2),
    })),
  };
}

export async function getLeadRows(
  filters: DashboardFilters,
  scope: AccessibleScope,
  page: number,
  pageSize: number,
) {
  const where = and(...leadConditions(filters, scope));
  const [totalRow] = await db
    .select({ count: count() })
    .from(leads)
    .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(where);
  const rows = await db
    .select({
      id: leads.id,
      occurredAt: leads.occurredAt,
      timezone: sourceAccountTimezoneSql,
      client: clients.name,
      platform: sourceAccounts.platform,
      sourceAccount: sourceAccounts.externalAccountName,
      campaign: campaigns.name,
      adGroup: adGroups.name,
      ad: ads.name,
      leadForm: leadForms.name,
      fullName: leads.fullName,
      email: leads.email,
      phoneNumber: leads.phoneNumber,
      booked: sql<boolean>`exists(
        select 1
        from ${ghlOpportunityMatches} lead_match
        where lead_match."leadId" = ${leads.id}
          and lead_match."status" = 'matched'
      )`,
    })
    .from(leads)
    .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(clients, eq(sourceAccounts.clientId, clients.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .leftJoin(adGroups, eq(leads.adGroupId, adGroups.id))
    .leftJoin(ads, eq(leads.adId, ads.id))
    .leftJoin(leadForms, eq(leads.leadFormId, leadForms.id))
    .where(where)
    .orderBy(desc(leads.occurredAt), desc(leads.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { total: totalRow?.count ?? 0, rows };
}
export async function getLeadAnalytics(
  filters: DashboardFilters,
  scope: AccessibleScope,
) {
  const leadWhere = and(...leadConditions(filters, scope));
  const bookingWhere = and(...opportunityConditions(filters, scope));
  const [leadTotal] = await db
    .select({ count: count() })
    .from(leads)
    .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(leadWhere);
  const [bookingTotal] = await db
    .select({ count: count() })
    .from(ghlOpportunities)
    .innerJoin(
      integrationMappings,
      eq(ghlOpportunities.integrationMappingId, integrationMappings.id),
    )
    .leftJoin(
      ghlOpportunityMatches,
      eq(ghlOpportunities.id, ghlOpportunityMatches.opportunityId),
    )
    .leftJoin(leads, eq(ghlOpportunityMatches.leadId, leads.id))
    .leftJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(bookingWhere);
  const leadSources = await db
    .select({ source: sourceAccounts.platform, leads: count() })
    .from(leads)
    .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(leadWhere)
    .groupBy(sourceAccounts.platform);
  const bookingSources = await db
    .select({
      source: sql<string>`coalesce(${sourceAccounts.platform}, 'Unattributed')`,
      bookings: count(),
    })
    .from(ghlOpportunities)
    .innerJoin(
      integrationMappings,
      eq(ghlOpportunities.integrationMappingId, integrationMappings.id),
    )
    .leftJoin(
      ghlOpportunityMatches,
      eq(ghlOpportunities.id, ghlOpportunityMatches.opportunityId),
    )
    .leftJoin(leads, eq(ghlOpportunityMatches.leadId, leads.id))
    .leftJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(bookingWhere)
    .groupBy(sql`coalesce(${sourceAccounts.platform}, 'Unattributed')`);
  const leadDays = await db
    .select({
      date: sql<string>`to_char(${leadLocalDateSql}, 'YYYY-MM-DD')`,
      leads: count(),
    })
    .from(leads)
    .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(leadWhere)
    .groupBy(sql`to_char(${leadLocalDateSql}, 'YYYY-MM-DD')`);
  const bookingDays = await db
    .select({
      date: sql<string>`to_char(${opportunityLocalDateSql}, 'YYYY-MM-DD')`,
      bookings: count(),
    })
    .from(ghlOpportunities)
    .innerJoin(
      integrationMappings,
      eq(ghlOpportunities.integrationMappingId, integrationMappings.id),
    )
    .leftJoin(
      ghlOpportunityMatches,
      eq(ghlOpportunities.id, ghlOpportunityMatches.opportunityId),
    )
    .leftJoin(leads, eq(ghlOpportunityMatches.leadId, leads.id))
    .leftJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(bookingWhere)
    .groupBy(sql`to_char(${opportunityLocalDateSql}, 'YYYY-MM-DD')`);

  const sourceMap = new Map<
    string,
    { source: string; leads: number; bookings: number }
  >();
  for (const row of leadSources) {
    sourceMap.set(row.source, {
      source: row.source,
      leads: row.leads,
      bookings: 0,
    });
  }
  for (const row of bookingSources) {
    const current = sourceMap.get(row.source) ?? {
      source: row.source,
      leads: 0,
      bookings: 0,
    };
    current.bookings = row.bookings;
    sourceMap.set(row.source, current);
  }
  const sources = [...sourceMap.values()]
    .map((row) => ({
      ...row,
      conversion: row.leads === 0 ? 0 : row.bookings / row.leads,
    }))
    .sort(
      (left, right) =>
        right.leads - left.leads || left.source.localeCompare(right.source),
    );

  const leadsByDay = new Map(leadDays.map((row) => [row.date, row.leads]));
  const bookingsByDay = new Map(
    bookingDays.map((row) => [row.date, row.bookings]),
  );
  const daily = [];
  const cursor = new Date(`${filters.from}T00:00:00.000Z`);
  const end = new Date(`${filters.to}T00:00:00.000Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const dayLeads = leadsByDay.get(date) ?? 0;
    const bookings = bookingsByDay.get(date) ?? 0;
    daily.push({
      date,
      leads: dayLeads,
      bookings,
      conversion: dayLeads === 0 ? 0 : bookings / dayLeads,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const totalLeads = leadTotal?.count ?? 0;
  const totalBookings = bookingTotal?.count ?? 0;
  return {
    totalLeads,
    totalBookings,
    conversion: totalLeads === 0 ? 0 : totalBookings / totalLeads,
    sourceCount: sources.length,
    sources,
    daily,
  };
}

export async function getRevenueRows(
  filters: DashboardFilters,
  scope: AccessibleScope,
  page: number,
  pageSize: number,
) {
  const where = and(...opportunityConditions(filters, scope));
  const [summary] = await db
    .select({
      bookings: count(),
      estimatedRevenue: sql<string>`coalesce(sum(${opportunityRevenueSql}), 0)::numeric(14,2)`,
      missingRules: sql<number>`count(*) filter (where not ${opportunityHasRuleSql})::int`,
    })
    .from(ghlOpportunities)
    .innerJoin(
      integrationMappings,
      eq(ghlOpportunities.integrationMappingId, integrationMappings.id),
    )
    .leftJoin(
      ghlOpportunityMatches,
      eq(ghlOpportunities.id, ghlOpportunityMatches.opportunityId),
    )
    .leftJoin(leads, eq(ghlOpportunityMatches.leadId, leads.id))
    .leftJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(where);
  const rows = await db
    .select({
      id: ghlOpportunities.id,
      wonAt: ghlOpportunities.wonAt,
      timezone: integrationMappings.timezone,
      clientId: clients.id,
      client: clients.name,
      opportunity: ghlOpportunities.name,
      contact: ghlContacts.fullName,
      email: ghlContacts.email,
      tags: sql<string[]>`coalesce(array(
        select distinct lower(btrim(tag))
        from unnest(${ghlOpportunities.tags}) tag
        where btrim(tag) <> ''
        order by lower(btrim(tag))
      ), '{}'::text[])`,
      matchedServices: sql<string[]>`coalesce(array(
        select distinct rr."serviceName"
        from ${revenueRules} rr
        where rr."clientId" = ${integrationMappings.clientId}
          and rr."status" = 'active'
          and rr."serviceName" is not null
          and lower(rr."tagName") in (
            select distinct lower(btrim(tag))
            from unnest(${ghlOpportunities.tags}) tag
            where btrim(tag) <> ''
          )
        order by rr."serviceName"
      ), '{}'::text[])`,
      estimatedRevenue: opportunityRevenueSql,
      ruleStatus: sql<
        "matched" | "missing"
      >`case when ${opportunityHasRuleSql} then 'matched' else 'missing' end`,
    })
    .from(ghlOpportunities)
    .innerJoin(
      integrationMappings,
      eq(ghlOpportunities.integrationMappingId, integrationMappings.id),
    )
    .innerJoin(ghlContacts, eq(ghlOpportunities.contactId, ghlContacts.id))
    .innerJoin(clients, eq(integrationMappings.clientId, clients.id))
    .leftJoin(
      ghlOpportunityMatches,
      eq(ghlOpportunities.id, ghlOpportunityMatches.opportunityId),
    )
    .leftJoin(leads, eq(ghlOpportunityMatches.leadId, leads.id))
    .leftJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(where)
    .orderBy(desc(ghlOpportunities.wonAt), desc(ghlOpportunities.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    rows,
    total: summary?.bookings ?? 0,
    bookings: summary?.bookings ?? 0,
    estimatedRevenue: summary?.estimatedRevenue ?? "0.00",
    missingRules: summary?.missingRules ?? 0,
  };
}

export async function getFilterOptions(
  filters: Omit<DashboardFilters, "campaignId">,
  scope: AccessibleScope,
  clientOptionScope: AccessibleScope = scope,
) {
  const scopeCondition = clientScopeCondition(scope);
  const clientSelection = {
    id: clients.id,
    name: clients.name,
    timezone: clientTimezoneSql,
  };
  const clientRows =
    clientOptionScope.clientIds === null
      ? await db
          .select(clientSelection)
          .from(clients)
          .where(eq(clients.status, "active"))
          .orderBy(asc(clients.name))
      : await db
          .select(clientSelection)
          .from(clients)
          .where(
            clientOptionScope.clientIds.length
              ? inArray(clients.id, clientOptionScope.clientIds)
              : sql`false`,
          )
          .orderBy(asc(clients.name));
  const platforms = await db
    .selectDistinct({ value: sourceAccounts.platform })
    .from(sourceAccounts)
    .where(scopeCondition)
    .orderBy(asc(sourceAccounts.platform));
  const campaignRows = await db
    .selectDistinct({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .innerJoin(sourceAccounts, eq(campaigns.sourceAccountId, sourceAccounts.id))
    .where(
      and(
        scopeCondition,
        filters.platform
          ? eq(sourceAccounts.platform, filters.platform)
          : undefined,
      ),
    )
    .orderBy(asc(campaigns.name));
  return {
    clients: clientRows,
    includeUnassigned: clientOptionScope.includeUnassigned,
    platforms: platforms.map((platform) => platform.value),
    campaigns: campaignRows,
  };
}

export async function getTrend(
  filters: DashboardFilters,
  scope: AccessibleScope,
) {
  const performanceRows = await db
    .select({
      date: adPerformanceDaily.date,
      spend: sql<string>`coalesce(sum(${adPerformanceDaily.spend}), 0)::numeric(14,2)`,
      platformLeads: sql<number>`coalesce(sum(${adPerformanceDaily.leads}), 0)::int`,
    })
    .from(adPerformanceDaily)
    .innerJoin(
      sourceAccounts,
      eq(adPerformanceDaily.sourceAccountId, sourceAccounts.id),
    )
    .innerJoin(campaigns, eq(adPerformanceDaily.campaignId, campaigns.id))
    .where(and(...performanceConditions(filters, scope)))
    .groupBy(adPerformanceDaily.date)
    .orderBy(asc(adPerformanceDaily.date));
  const capturedRows = await db
    .select({
      date: sql<string>`to_char(${leadLocalDateSql}, 'YYYY-MM-DD')`,
      capturedLeads: count(),
    })
    .from(leads)
    .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(and(...leadConditions(filters, scope)))
    .groupBy(sql`to_char(${leadLocalDateSql}, 'YYYY-MM-DD')`);
  const byDate = new Map(performanceRows.map((row) => [row.date, row]));
  const capturedByDate = new Map(
    capturedRows.map((row) => [row.date, row.capturedLeads]),
  );
  const rows = [];
  const cursor = new Date(`${filters.from}T00:00:00.000Z`);
  const end = new Date(`${filters.to}T00:00:00.000Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const performance = byDate.get(date);
    rows.push({
      date,
      spend: performance?.spend ?? "0.00",
      platformLeads: performance?.platformLeads ?? 0,
      capturedLeads: capturedByDate.get(date) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

export async function getTopCampaigns(
  filters: DashboardFilters,
  scope: AccessibleScope,
) {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      client: clients.name,
      spend: sql<string>`coalesce(sum(${adPerformanceDaily.spend}), 0)::numeric(14,2)`,
      platformLeads: sql<number>`coalesce(sum(${adPerformanceDaily.leads}), 0)::int`,
    })
    .from(adPerformanceDaily)
    .innerJoin(
      sourceAccounts,
      eq(adPerformanceDaily.sourceAccountId, sourceAccounts.id),
    )
    .leftJoin(clients, eq(sourceAccounts.clientId, clients.id))
    .innerJoin(campaigns, eq(adPerformanceDaily.campaignId, campaigns.id))
    .where(and(...performanceConditions(filters, scope)))
    .groupBy(campaigns.id, campaigns.name, clients.name)
    .orderBy(desc(sql`sum(${adPerformanceDaily.spend})`), asc(campaigns.id))
    .limit(10);
  return rows.map((row) => ({
    ...row,
    cpl:
      row.platformLeads === 0
        ? null
        : (Number(row.spend) / row.platformLeads).toFixed(2),
  }));
}

export async function getSourceAccountRows(
  input: {
    query?: string;
    platform?: string;
    status?: "active" | "disconnected" | "ignored";
    assignment?: "assigned" | "unassigned";
  },
  scope: AccessibleScope,
  page: number,
  pageSize: number,
) {
  const where = and(
    clientScopeCondition(scope),
    input.query
      ? or(
          sql`${sourceAccounts.externalAccountName} ilike ${`%${input.query}%`}`,
          sql`${sourceAccounts.externalAccountId} ilike ${`%${input.query}%`}`,
        )
      : undefined,
    input.platform ? eq(sourceAccounts.platform, input.platform) : undefined,
    input.status ? eq(sourceAccounts.status, input.status) : undefined,
    input.assignment === "assigned"
      ? sql`${sourceAccounts.clientId} is not null`
      : input.assignment === "unassigned"
        ? isNull(sourceAccounts.clientId)
        : undefined,
  );
  const [totalRow] = await db
    .select({ count: count() })
    .from(sourceAccounts)
    .where(where);
  const rows = await db
    .select({
      id: sourceAccounts.id,
      name: sourceAccounts.externalAccountName,
      platform: sourceAccounts.platform,
      connector: sourceAccounts.connector,
      status: sourceAccounts.status,
      clientId: clients.id,
      clientName: clients.name,
      lastSyncedAt: sourceAccounts.lastSyncedAt,
    })
    .from(sourceAccounts)
    .leftJoin(clients, eq(sourceAccounts.clientId, clients.id))
    .where(where)
    .orderBy(asc(sourceAccounts.normalizedName), asc(sourceAccounts.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: totalRow?.count ?? 0,
    rows: rows.map(({ clientId, clientName, ...row }) => ({
      ...row,
      client:
        clientId && clientName ? { id: clientId, name: clientName } : null,
    })),
  };
}

export async function getAccountSummary(
  scope: AccessibleScope,
  platform?: string,
) {
  const rows = await db
    .select({
      status: sourceAccounts.status,
      assigned: sql<boolean>`${sourceAccounts.clientId} is not null`,
      count: count(),
    })
    .from(sourceAccounts)
    .where(
      and(
        clientScopeCondition(scope),
        platform ? eq(sourceAccounts.platform, platform) : undefined,
      ),
    )
    .groupBy(
      sourceAccounts.status,
      sql`${sourceAccounts.clientId} is not null`,
    );
  const result = {
    total: 0,
    assigned: 0,
    unassigned: 0,
    active: 0,
    disconnected: 0,
    ignored: 0,
  };
  for (const row of rows) {
    result.total += row.count;
    result[row.assigned ? "assigned" : "unassigned"] += row.count;
    result[row.status] += row.count;
  }
  return result;
}

export async function getSyncRuns(page: number, pageSize: number) {
  const [totalRow] = await db.select({ count: count() }).from(syncRuns);
  const rows = await db
    .select({
      id: syncRuns.id,
      status: syncRuns.status,
      startedAt: syncRuns.startedAt,
      completedAt: syncRuns.completedAt,
      discoveredAccountCount: syncRuns.discoveredAccountCount,
      performanceRowCount: syncRuns.performanceRowCount,
      leadRowCount: syncRuns.leadRowCount,
    })
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total: totalRow?.count ?? 0 };
}

export async function getClientAnalytics(input: {
  from: string;
  to: string;
  query?: string;
  status?: "active" | "inactive";
  page: number;
  pageSize: number;
  clientIds?: string[] | null;
}) {
  const selectedFrom = new Date(`${input.from}T00:00:00.000Z`);
  const selectedEnd = new Date(`${input.to}T00:00:00.000Z`);
  selectedEnd.setUTCDate(selectedEnd.getUTCDate() + 1);
  const dayCount = Math.round(
    (selectedEnd.getTime() - selectedFrom.getTime()) / 86_400_000,
  );
  const priorFrom = new Date(selectedFrom);
  priorFrom.setUTCDate(priorFrom.getUTCDate() - dayCount);
  const priorFromDate = priorFrom.toISOString().slice(0, 10);
  const outerClientId = sql.raw('"agency_os_client"."id"');
  const outerClientTimezone = sql<string>`coalesce((
    select local_mapping."timezone"
    from ${integrationMappings} local_mapping
    where local_mapping."clientId" = ${outerClientId}
      and local_mapping."provider" = 'ghl'
    limit 1
  ), 'UTC')`;
  const where = and(
    input.query ? sql`${clients.name} ilike ${`%${input.query}%`}` : undefined,
    input.status ? eq(clients.status, input.status) : undefined,
    input.clientIds === null || input.clientIds === undefined
      ? undefined
      : input.clientIds.length
        ? inArray(clients.id, input.clientIds)
        : sql`false`,
  );
  const [totalRow] = await db
    .select({ count: count() })
    .from(clients)
    .where(where);
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      timezone: outerClientTimezone,
      sourceAccountCount: sql<number>`(select count(*)::int from ${sourceAccounts} sa where sa."clientId" = ${outerClientId})`,
      spend: sql<string>`coalesce((select sum(p."spend") from ${adPerformanceDaily} p inner join ${sourceAccounts} sa on p."sourceAccountId" = sa."id" where sa."clientId" = ${outerClientId} and p."date" >= ${input.from} and p."date" <= ${input.to}), 0)::numeric(14,2)`,
      priorSpend: sql<string>`coalesce((select sum(p."spend") from ${adPerformanceDaily} p inner join ${sourceAccounts} sa on p."sourceAccountId" = sa."id" where sa."clientId" = ${outerClientId} and p."date" >= ${priorFromDate} and p."date" < ${input.from}), 0)::numeric(14,2)`,
      platformLeads: sql<number>`coalesce((select sum(p."leads")::int from ${adPerformanceDaily} p inner join ${sourceAccounts} sa on p."sourceAccountId" = sa."id" where sa."clientId" = ${outerClientId} and p."date" >= ${input.from} and p."date" <= ${input.to}), 0)::int`,
      capturedLeads: sql<number>`(select count(*)::int from ${leads} l inner join ${sourceAccounts} sa on l."sourceAccountId" = sa."id" where sa."clientId" = ${outerClientId} and timezone(${outerClientTimezone}, l."occurredAt")::date >= ${input.from}::date and timezone(${outerClientTimezone}, l."occurredAt")::date <= ${input.to}::date)`,
      priorCapturedLeads: sql<number>`(select count(*)::int from ${leads} l inner join ${sourceAccounts} sa on l."sourceAccountId" = sa."id" where sa."clientId" = ${outerClientId} and timezone(${outerClientTimezone}, l."occurredAt")::date >= ${priorFromDate}::date and timezone(${outerClientTimezone}, l."occurredAt")::date < ${input.from}::date)`,
      bookings: sql<number>`(select count(*)::int from ${ghlOpportunities} o inner join ${integrationMappings} im on o."integrationMappingId" = im."id" where im."clientId" = ${outerClientId} and timezone(im."timezone", o."wonAt")::date >= ${input.from}::date and timezone(im."timezone", o."wonAt")::date <= ${input.to}::date)`,
      priorBookings: sql<number>`(select count(*)::int from ${ghlOpportunities} o inner join ${integrationMappings} im on o."integrationMappingId" = im."id" where im."clientId" = ${outerClientId} and timezone(im."timezone", o."wonAt")::date >= ${priorFromDate}::date and timezone(im."timezone", o."wonAt")::date < ${input.from}::date)`,
      estimatedRevenue: sql<string>`coalesce((
        select sum(coalesce((
          select sum(rr."revenueValue")
          from ${revenueRules} rr
          where rr."clientId" = ${outerClientId}
            and rr."status" = 'active'
            and lower(rr."tagName") in (
              select distinct lower(btrim(tag))
              from unnest(o."tags") tag
              where btrim(tag) <> ''
            )
        ), 0))
        from ${ghlOpportunities} o
        inner join ${integrationMappings} im on o."integrationMappingId" = im."id"
        where im."clientId" = ${outerClientId}
          and timezone(im."timezone", o."wonAt")::date >= ${input.from}::date
          and timezone(im."timezone", o."wonAt")::date <= ${input.to}::date
      ), 0)::numeric(14,2)`,
    })
    .from(clients)
    .where(where)
    .orderBy(asc(clients.name), asc(clients.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  const [benchmark] = await db
    .select({
      activeClients: sql<number>`count(*)::int`,
      capturedLeads: sql<number>`coalesce(sum((
        select count(*)
        from ${leads} benchmark_lead
        inner join ${sourceAccounts} benchmark_source
          on benchmark_lead."sourceAccountId" = benchmark_source."id"
        where benchmark_source."clientId" = ${outerClientId}
          and timezone(${outerClientTimezone}, benchmark_lead."occurredAt")::date >= ${input.from}::date
          and timezone(${outerClientTimezone}, benchmark_lead."occurredAt")::date <= ${input.to}::date
      )), 0)::int`,
      bookings: sql<number>`coalesce(sum((
        select count(*)
        from ${ghlOpportunities} benchmark_opportunity
        inner join ${integrationMappings} benchmark_mapping
          on benchmark_opportunity."integrationMappingId" = benchmark_mapping."id"
        where benchmark_mapping."clientId" = ${outerClientId}
          and timezone(benchmark_mapping."timezone", benchmark_opportunity."wonAt")::date >= ${input.from}::date
          and timezone(benchmark_mapping."timezone", benchmark_opportunity."wonAt")::date <= ${input.to}::date
      )), 0)::int`,
    })
    .from(clients)
    .where(
      and(
        eq(clients.status, "active"),
        input.clientIds === null || input.clientIds === undefined
          ? undefined
          : input.clientIds.length
            ? inArray(clients.id, input.clientIds)
            : sql`false`,
      ),
    );
  const activeClientCount = benchmark?.activeClients ?? 0;
  const benchmarkLeads = benchmark?.capturedLeads ?? 0;
  const averageCapturedLeads =
    activeClientCount === 0 ? null : benchmarkLeads / activeClientCount;
  const averageBookingConversion =
    benchmarkLeads === 0 ? null : (benchmark?.bookings ?? 0) / benchmarkLeads;

  return {
    rows: rows.map((row) => {
      const cpl =
        row.capturedLeads === 0 ? null : Number(row.spend) / row.capturedLeads;
      const priorCpl =
        row.priorCapturedLeads === 0
          ? null
          : Number(row.priorSpend) / row.priorCapturedLeads;
      const conversion =
        row.capturedLeads === 0 ? 0 : row.bookings / row.capturedLeads;
      const health = calculateClientHealth({
        currentCpl: cpl,
        priorCpl,
        capturedLeads: row.capturedLeads,
        averageCapturedLeads,
        bookingConversion: conversion,
        averageBookingConversion,
      });
      return {
        ...row,
        cpl: cpl === null ? null : cpl.toFixed(2),
        priorCpl: priorCpl === null ? null : priorCpl.toFixed(2),
        conversion,
        health,
      };
    }),
    total: totalRow?.count ?? 0,
  };
}
export async function getClientHealthRows(
  filters: DashboardFilters,
  scope: AccessibleScope,
) {
  const result = await getClientAnalytics({
    from: filters.from,
    to: filters.to,
    status: "active",
    page: 1,
    pageSize: 100,
    clientIds: scope.clientIds,
  });
  return result.rows;
}
