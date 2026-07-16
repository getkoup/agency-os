import "server-only";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { clients, integrationMappings, revenueRules } from "~/server/db/schema";

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

const GHL_TARGETS = [
  {
    slug: "tint-lab",
    name: "Tint Lab",
    locationKey: "GHL_TINT_LAB_LOCATION_ID",
    tokenKey: "GHL_TINT_LAB_PRIVATE_INTEGRATION_TOKEN",
  },
  {
    slug: "diamond-auto-restoration",
    name: "Diamond Auto Restoration",
    locationKey: "GHL_DIAMOND_LOCATION_ID",
    tokenKey: "GHL_DIAMOND_PRIVATE_INTEGRATION_TOKEN",
  },
] as const;

function isConfigured(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

export async function getGhlConfigurationStatus() {
  const rows = await db
    .select({
      slug: clients.slug,
      clientName: clients.name,
      clientStatus: clients.status,
      mappingId: integrationMappings.id,
      lastSuccessfulSyncAt: integrationMappings.lastSuccessfulSyncAt,
    })
    .from(clients)
    .leftJoin(
      integrationMappings,
      and(
        eq(integrationMappings.clientId, clients.id),
        eq(integrationMappings.provider, "ghl"),
      ),
    )
    .where(sql`${clients.slug} in ('tint-lab', 'diamond-auto-restoration')`)
    .orderBy(desc(integrationMappings.lastSuccessfulSyncAt));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return GHL_TARGETS.map((target) => {
    const row = bySlug.get(target.slug);
    const mappingState = !row
      ? "missing_client"
      : row.clientStatus !== "active"
        ? "inactive_client"
        : !row.mappingId
          ? "missing_mapping"
          : "active";
    return {
      clientSlug: target.slug,
      clientName: row?.clientName ?? target.name,
      mappingState,
      locationConfigured: isConfigured(target.locationKey),
      tokenConfigured: isConfigured(target.tokenKey),
      lastSuccessfulSyncAt: row?.lastSuccessfulSyncAt ?? null,
    };
  });
}
