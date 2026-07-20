import "server-only";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import {
  classifyCampaign,
  type LeadClassificationRule,
} from "~/features/dashboard/lead-classification";
import { db } from "~/server/db";
import {
  adPerformanceDaily,
  campaigns,
  clients,
  ghlClientConfigurations,
  integrationMappings,
  leadClassificationRules,
  leads,
  revenueRules,
  sourceAccounts,
} from "~/server/db/schema";

export async function listLeadClassificationRules(input: {
  clientId?: string;
  limit: number;
}) {
  const where = input.clientId
    ? eq(leadClassificationRules.clientId, input.clientId)
    : undefined;
  const rows = await db
    .select({
      id: leadClassificationRules.id,
      clientId: leadClassificationRules.clientId,
      client: clients.name,
      categoryName: leadClassificationRules.categoryName,
      keywords: leadClassificationRules.keywords,
      matchMode: leadClassificationRules.matchMode,
      priority: leadClassificationRules.priority,
      status: leadClassificationRules.status,
      updatedAt: leadClassificationRules.updatedAt,
    })
    .from(leadClassificationRules)
    .innerJoin(clients, eq(leadClassificationRules.clientId, clients.id))
    .where(where)
    .orderBy(
      asc(clients.name),
      desc(leadClassificationRules.priority),
      asc(leadClassificationRules.categoryName),
      asc(leadClassificationRules.id),
    )
    .limit(input.limit);
  const clientOptions = await db
    .select({ id: clients.id, name: clients.name, status: clients.status })
    .from(clients)
    .orderBy(asc(clients.name));

  if (!input.clientId) {
    return { rows, clientOptions, preview: [] };
  }
  const [formCampaigns, dmCampaigns] = await Promise.all([
    db
      .select({
        campaignName: campaigns.name,
        leads: count(),
      })
      .from(leads)
      .innerJoin(sourceAccounts, eq(leads.sourceAccountId, sourceAccounts.id))
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(eq(sourceAccounts.clientId, input.clientId))
      .groupBy(campaigns.name),
    db
      .select({
        campaignName: campaigns.name,
        leads: sql<number>`coalesce(sum(${adPerformanceDaily.messagingConversations}), 0)::int`,
      })
      .from(adPerformanceDaily)
      .innerJoin(
        sourceAccounts,
        eq(adPerformanceDaily.sourceAccountId, sourceAccounts.id),
      )
      .innerJoin(campaigns, eq(adPerformanceDaily.campaignId, campaigns.id))
      .where(eq(sourceAccounts.clientId, input.clientId))
      .groupBy(campaigns.name),
  ]);
  const activeRules: LeadClassificationRule[] = rows
    .filter((row) => row.status === "active")
    .map((row) => ({
      id: row.id,
      categoryName: row.categoryName,
      keywords: row.keywords,
      matchMode: row.matchMode,
      priority: row.priority,
    }));
  const previewByCampaign = new Map<
    string,
    {
      campaignName: string;
      categoryName: string;
      facebookLeadFormLeads: number;
      dmLeads: number;
    }
  >();
  function previewRow(campaignName: string | null) {
    let name = campaignName?.trim() ?? "Unattributed";
    if (name === "") name = "Unattributed";
    const current = previewByCampaign.get(name) ?? {
      campaignName: name,
      categoryName: classifyCampaign(campaignName, activeRules),
      facebookLeadFormLeads: 0,
      dmLeads: 0,
    };
    previewByCampaign.set(name, current);
    return current;
  }
  for (const row of formCampaigns) {
    previewRow(row.campaignName).facebookLeadFormLeads += row.leads;
  }
  for (const row of dmCampaigns) {
    previewRow(row.campaignName).dmLeads += row.leads;
  }
  const preview = [...previewByCampaign.values()]
    .map((row) => ({
      ...row,
      totalLeads: row.facebookLeadFormLeads + row.dmLeads,
    }))
    .sort(
      (left, right) =>
        right.totalLeads - left.totalLeads ||
        left.campaignName.localeCompare(right.campaignName),
    )
    .slice(0, 50);
  return { rows, clientOptions, preview };
}

export async function listRevenueRules(input: {
  clientId?: string;
  status?: "active" | "inactive";
  page: number;
  pageSize: number;
}) {
  const where = and(
    input.clientId ? eq(revenueRules.clientId, input.clientId) : undefined,
    input.status ? eq(revenueRules.status, input.status) : undefined,
  );
  const [totalRow] = await db
    .select({ count: count() })
    .from(revenueRules)
    .where(where);
  const rows = await db
    .select({
      id: revenueRules.id,
      clientId: revenueRules.clientId,
      client: clients.name,
      tagName: revenueRules.tagName,
      revenueValue: revenueRules.revenueValue,
      serviceName: revenueRules.serviceName,
      status: revenueRules.status,
      updatedAt: revenueRules.updatedAt,
    })
    .from(revenueRules)
    .innerJoin(clients, eq(revenueRules.clientId, clients.id))
    .where(where)
    .orderBy(asc(clients.name), asc(revenueRules.tagName), asc(revenueRules.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const clientOptions = await db
    .select({ id: clients.id, name: clients.name, status: clients.status })
    .from(clients)
    .orderBy(asc(clients.name));
  return { rows, total: totalRow?.count ?? 0, clientOptions };
}

export async function getGhlConfigurationStatus() {
  const rows = await db
    .select({
      clientId: clients.id,
      clientSlug: clients.slug,
      clientName: clients.name,
      clientStatus: clients.status,
      locationId: ghlClientConfigurations.locationId,
      timezone: ghlClientConfigurations.timezone,
      tokenLastFour: ghlClientConfigurations.tokenLastFour,
      configurationUpdatedAt: ghlClientConfigurations.updatedAt,
      mappingLocationId: integrationMappings.externalLocationId,
      lastSuccessfulSyncAt: integrationMappings.lastSuccessfulSyncAt,
    })
    .from(clients)
    .leftJoin(
      ghlClientConfigurations,
      eq(ghlClientConfigurations.clientId, clients.id),
    )
    .leftJoin(
      integrationMappings,
      and(
        eq(integrationMappings.clientId, clients.id),
        eq(integrationMappings.provider, "ghl"),
      ),
    )
    .orderBy(asc(clients.name), asc(clients.id));
  return rows.map((row) => {
    const mappingState =
      row.clientStatus !== "active"
        ? "inactive_client"
        : !row.locationId
          ? "missing_configuration"
          : !row.mappingLocationId
            ? "pending_sync"
            : row.mappingLocationId !== row.locationId
              ? "identity_conflict"
              : "active";
    return {
      clientId: row.clientId,
      clientSlug: row.clientSlug,
      clientName: row.clientName,
      clientStatus: row.clientStatus,
      mappingState,
      configured: Boolean(row.locationId),
      locationId: row.locationId,
      timezone: row.timezone,
      tokenHint: row.tokenLastFour ? `••••${row.tokenLastFour}` : null,
      configurationUpdatedAt: row.configurationUpdatedAt,
      lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
    };
  });
}
