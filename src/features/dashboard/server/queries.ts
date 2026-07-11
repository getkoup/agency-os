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
  lt,
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
  leadForms,
  leads,
  sourceAccounts,
  syncRuns,
} from "~/server/db/schema";
import { type DashboardFilters } from "~/features/dashboard/server/schemas";

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
  const from = new Date(`${filters.from}T00:00:00.000Z`);
  const end = new Date(`${filters.to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return [
    clientScopeCondition(scope),
    gte(leads.occurredAt, from),
    lt(leads.occurredAt, end),
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
  return {
    spend,
    platformLeads,
    capturedLeads: captured?.count ?? 0,
    messagingConversations: performance?.messagingConversations ?? 0,
    linkClicks,
    cpl:
      platformLeads === 0 ? null : (Number(spend) / platformLeads).toFixed(2),
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
  return { total: totalRow?.count ?? 0, rows };
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

export async function getFilterOptions(
  filters: Omit<DashboardFilters, "campaignId">,
  scope: AccessibleScope,
) {
  const scopeCondition = clientScopeCondition(scope);
  const clientRows =
    scope.clientIds === null
      ? await db
          .select({ id: clients.id, name: clients.name })
          .from(clients)
          .where(eq(clients.status, "active"))
          .orderBy(asc(clients.name))
      : await db
          .select({ id: clients.id, name: clients.name })
          .from(clients)
          .where(
            scope.clientIds.length
              ? inArray(clients.id, scope.clientIds)
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
    includeUnassigned: scope.includeUnassigned,
    platforms: platforms.map((platform) => platform.value),
    campaigns: campaignRows,
  };
}
