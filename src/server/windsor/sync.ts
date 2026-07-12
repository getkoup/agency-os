import { and, eq, inArray, ne, sql } from "drizzle-orm";

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
import {
  type LeadRow,
  type PerformanceRow,
  WindsorClient,
} from "~/server/windsor/client";
import {
  CLIENT_MAPPINGS,
  findClientMapping,
} from "~/server/windsor/client-mappings";
import {
  chunkValues,
  normalizeEmail,
  normalizePhone,
  normalizeSuggestionKey,
  parseConnectorAccountId,
  parseNullableInteger,
  parseNullableNumber,
  parseOccurredAt,
} from "~/server/windsor/normalize";

export interface SyncSummary {
  runId: string;
  status: "succeeded" | "failed";
  discoveredAccountCount: number;
  performanceRowCount: number;
  leadRowCount: number;
  durationMs: number;
}

export class WindsorSyncError extends Error {
  readonly summary: SyncSummary;

  constructor(summary: SyncSummary, options?: ErrorOptions) {
    super("Windsor synchronization failed", options);
    this.name = "WindsorSyncError";
    this.summary = summary;
  }
}

function numericString(value: unknown): string | null {
  const parsed = parseNullableNumber(value);
  return parsed === null ? null : parsed.toFixed(2);
}

function rawPayload(row: object): Record<string, unknown> {
  return { ...row };
}

async function requireSourceAccount(
  connector: "facebook" | "facebook_leads",
  rowAccountId: string,
  requestedAccounts: readonly string[],
) {
  const matches = await db
    .select({
      id: sourceAccounts.id,
      connectorAccountId: sourceAccounts.connectorAccountId,
    })
    .from(sourceAccounts)
    .where(
      and(
        eq(sourceAccounts.dataProvider, "windsor"),
        eq(sourceAccounts.connector, connector),
        eq(sourceAccounts.externalAccountId, rowAccountId),
      ),
    );
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Source account identity mismatch for ${connector}`);
  }
  if (!requestedAccounts.includes(matches[0].connectorAccountId)) {
    throw new Error(
      `Source account row was outside the requested ${connector} batch`,
    );
  }
  return matches[0];
}

async function upsertPerformanceBatch(
  rows: readonly PerformanceRow[],
  requestedAccounts: readonly string[],
) {
  for (const row of rows) {
    await requireSourceAccount("facebook", row.account_id, requestedAccounts);
  }
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const [source] = await tx
        .select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(
          and(
            eq(sourceAccounts.dataProvider, "windsor"),
            eq(sourceAccounts.connector, "facebook"),
            eq(sourceAccounts.externalAccountId, row.account_id),
          ),
        )
        .limit(1);
      if (!source) throw new Error("Validated performance source disappeared");
      const now = new Date();
      const [campaign] = await tx
        .insert(campaigns)
        .values({
          sourceAccountId: source.id,
          externalId: row.campaign_id,
          name: row.campaign,
        })
        .onConflictDoUpdate({
          target: [campaigns.sourceAccountId, campaigns.externalId],
          set: { name: row.campaign, updatedAt: now },
        })
        .returning({ id: campaigns.id });
      if (!campaign) throw new Error("Campaign upsert failed");
      const [adGroup] = await tx
        .insert(adGroups)
        .values({
          campaignId: campaign.id,
          externalId: row.adset_id,
          name: row.adset_name,
        })
        .onConflictDoUpdate({
          target: [adGroups.campaignId, adGroups.externalId],
          set: { name: row.adset_name, updatedAt: now },
        })
        .returning({ id: adGroups.id });
      if (!adGroup) throw new Error("Ad group upsert failed");
      const [ad] = await tx
        .insert(ads)
        .values({
          adGroupId: adGroup.id,
          externalId: row.ad_id,
          name: row.ad_name,
        })
        .onConflictDoUpdate({
          target: [ads.adGroupId, ads.externalId],
          set: { name: row.ad_name, updatedAt: now },
        })
        .returning({ id: ads.id });
      if (!ad) throw new Error("Ad upsert failed");

      await tx
        .insert(adPerformanceDaily)
        .values({
          sourceAccountId: source.id,
          campaignId: campaign.id,
          adGroupId: adGroup.id,
          adId: ad.id,
          date: row.date,
          currency: row.currency ?? null,
          spend: numericString(row.spend),
          impressions: parseNullableInteger(row.impressions),
          reach: parseNullableInteger(row.reach),
          clicks: parseNullableInteger(row.clicks),
          linkClicks: parseNullableInteger(row.link_clicks),
          engagements: parseNullableInteger(row.actions_post_engagement),
          conversions: null,
          leads: parseNullableInteger(row.actions_lead),
          messagingConversations: parseNullableInteger(
            row.actions_onsite_conversion_messaging_conversation_started_7d,
          ),
          messagingConnections: parseNullableInteger(
            row.actions_onsite_conversion_total_messaging_connection,
          ),
          cpc: numericString(row.cpc),
          ctr: numericString(row.ctr),
          providerMetrics: {
            actions_leadgen_grouped: row.actions_leadgen_grouped ?? null,
            cost_per_action_type_lead: row.cost_per_action_type_lead ?? null,
          },
          rawPayload: rawPayload(row),
        })
        .onConflictDoUpdate({
          target: [adPerformanceDaily.adId, adPerformanceDaily.date],
          set: {
            sourceAccountId: source.id,
            campaignId: campaign.id,
            adGroupId: adGroup.id,
            currency: row.currency ?? null,
            spend: numericString(row.spend),
            impressions: parseNullableInteger(row.impressions),
            reach: parseNullableInteger(row.reach),
            clicks: parseNullableInteger(row.clicks),
            linkClicks: parseNullableInteger(row.link_clicks),
            engagements: parseNullableInteger(row.actions_post_engagement),
            conversions: null,
            leads: parseNullableInteger(row.actions_lead),
            messagingConversations: parseNullableInteger(
              row.actions_onsite_conversion_messaging_conversation_started_7d,
            ),
            messagingConnections: parseNullableInteger(
              row.actions_onsite_conversion_total_messaging_connection,
            ),
            cpc: numericString(row.cpc),
            ctr: numericString(row.ctr),
            providerMetrics: {
              actions_leadgen_grouped: row.actions_leadgen_grouped ?? null,
              cost_per_action_type_lead: row.cost_per_action_type_lead ?? null,
            },
            rawPayload: rawPayload(row),
            updatedAt: now,
          },
        });
      await tx
        .update(sourceAccounts)
        .set({ lastSyncedAt: now })
        .where(eq(sourceAccounts.id, source.id));
    }
  });
}

async function resolveLeadHierarchy(row: LeadRow) {
  if (!row.campaign_id) {
    return { campaignId: null, adGroupId: null, adId: null };
  }
  const campaignMatches = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.externalId, row.campaign_id));
  if (campaignMatches.length === 0) {
    return { campaignId: null, adGroupId: null, adId: null };
  }
  if (campaignMatches.length !== 1 || !campaignMatches[0]) {
    throw new Error("Ambiguous lead campaign identity");
  }
  const campaignId = campaignMatches[0].id;
  if (!row.adset_id) return { campaignId, adGroupId: null, adId: null };
  const adGroupMatches = await db
    .select({ id: adGroups.id })
    .from(adGroups)
    .where(
      and(
        eq(adGroups.campaignId, campaignId),
        eq(adGroups.externalId, row.adset_id),
      ),
    );
  if (adGroupMatches.length !== 1 || !adGroupMatches[0]) {
    if (adGroupMatches.length > 1) throw new Error("Ambiguous lead ad group");
    return { campaignId, adGroupId: null, adId: null };
  }
  const adGroupId = adGroupMatches[0].id;
  const adMatches = row.ad_id
    ? await db
        .select({ id: ads.id })
        .from(ads)
        .where(and(eq(ads.adGroupId, adGroupId), eq(ads.externalId, row.ad_id)))
    : row.ad_name
      ? await db
          .select({ id: ads.id })
          .from(ads)
          .where(and(eq(ads.adGroupId, adGroupId), eq(ads.name, row.ad_name)))
      : [];
  if (adMatches.length > 1) throw new Error("Ambiguous lead ad identity");
  return { campaignId, adGroupId, adId: adMatches[0]?.id ?? null };
}

async function upsertLeadBatch(
  rows: readonly LeadRow[],
  requestedAccounts: readonly string[],
) {
  const prepared: Array<{
    row: LeadRow;
    source: { id: string; connectorAccountId: string };
    hierarchy: {
      campaignId: string | null;
      adGroupId: string | null;
      adId: string | null;
    };
  }> = [];
  for (const row of rows) {
    const source = await requireSourceAccount(
      "facebook_leads",
      row.account_id,
      requestedAccounts,
    );
    prepared.push({ row, source, hierarchy: await resolveLeadHierarchy(row) });
  }
  await db.transaction(async (tx) => {
    for (const { row, source, hierarchy } of prepared) {
      const now = new Date();
      let leadFormId: string | null = null;
      if (row.form_id) {
        const [leadForm] = await tx
          .insert(leadForms)
          .values({ sourceAccountId: source.id, externalId: row.form_id })
          .onConflictDoUpdate({
            target: [leadForms.sourceAccountId, leadForms.externalId],
            set: { updatedAt: now },
          })
          .returning({ id: leadForms.id });
        if (!leadForm) throw new Error("Lead form upsert failed");
        leadFormId = leadForm.id;
      }
      const fullName = row.full_name?.trim();
      const phoneSource = row.phone_number?.trim()
        ? row.phone_number
        : row.phone;
      const values = {
        sourceAccountId: source.id,
        externalId: row.id,
        campaignId: hierarchy.campaignId,
        adGroupId: hierarchy.adGroupId,
        adId: hierarchy.adId,
        leadFormId,
        occurredAt: parseOccurredAt(row.created_time),
        fullName: fullName === "" ? null : (fullName ?? null),
        email: normalizeEmail(row.email),
        phoneNumber: normalizePhone(phoneSource),
        rawPayload: rawPayload(row),
      };
      await tx
        .insert(leads)
        .values(values)
        .onConflictDoUpdate({
          target: [leads.sourceAccountId, leads.externalId],
          set: { ...values, updatedAt: now },
        });
      await tx
        .update(sourceAccounts)
        .set({ lastSyncedAt: now })
        .where(eq(sourceAccounts.id, source.id));
    }
  });
}

export async function syncWindsor(
  client: WindsorClient = new WindsorClient(),
): Promise<SyncSummary> {
  const startedAt = new Date();
  const [run] = await db
    .insert(syncRuns)
    .values({ dataProvider: "windsor" })
    .returning({ id: syncRuns.id });
  if (!run) throw new Error("Could not create Windsor sync run");
  let discoveredAccountCount = 0;
  let performanceRowCount = 0;
  let leadRowCount = 0;

  try {
    const discovered = (await client.discoverAccounts()).filter(
      (account) =>
        account.datasource === "facebook" ||
        account.datasource === "facebook_leads",
    );
    discoveredAccountCount = discovered.length;

    const clientIds = new Map<string, string>();
    for (const mapping of CLIENT_MAPPINGS) {
      await db
        .insert(clients)
        .values({ slug: mapping.slug, name: mapping.name })
        .onConflictDoNothing({ target: clients.slug });
      const [clientRow] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.slug, mapping.slug))
        .limit(1);
      if (!clientRow) throw new Error("Client mapping insert failed");
      clientIds.set(mapping.slug, clientRow.id);
    }

    const seenConnectorAccounts: string[] = [];
    for (const account of discovered) {
      const parsed = parseConnectorAccountId(account.account_id);
      if (parsed.connector !== account.datasource) {
        throw new Error("Discovery datasource did not match account selector");
      }
      seenConnectorAccounts.push(account.account_id);
      const mapping = findClientMapping(account.account_id);
      const mappedClientId = mapping ? clientIds.get(mapping.slug) : undefined;
      const [existing] = await db
        .select({
          id: sourceAccounts.id,
          clientId: sourceAccounts.clientId,
          status: sourceAccounts.status,
        })
        .from(sourceAccounts)
        .where(
          and(
            eq(sourceAccounts.dataProvider, "windsor"),
            eq(sourceAccounts.connectorAccountId, account.account_id),
          ),
        )
        .limit(1);
      const displayName =
        account.account_name
          .replace(new RegExp(`^${account.datasource}__`), "")
          .trim() || parsed.externalAccountId;
      if (existing) {
        await db
          .update(sourceAccounts)
          .set({
            externalAccountId: parsed.externalAccountId,
            externalAccountName: displayName,
            normalizedName: normalizeSuggestionKey(displayName),
            status: existing.status === "ignored" ? "ignored" : "active",
            lastSeenAt: new Date(),
          })
          .where(eq(sourceAccounts.id, existing.id));
      } else {
        await db.transaction(async (tx) => {
          if (mappedClientId) {
            await tx.execute(
              sql`select "id" from ${clients} where "id" = ${mappedClientId} order by "id" for update`,
            );
          }
          const [alreadyInserted] = await tx
            .select({ id: sourceAccounts.id })
            .from(sourceAccounts)
            .where(
              and(
                eq(sourceAccounts.dataProvider, "windsor"),
                eq(sourceAccounts.connectorAccountId, account.account_id),
              ),
            )
            .limit(1);
          if (alreadyInserted) return;
          const [mappedClient] = mappedClientId
            ? await tx
                .select({ status: clients.status })
                .from(clients)
                .where(eq(clients.id, mappedClientId))
                .limit(1)
            : [];
          await tx.insert(sourceAccounts).values({
            clientId:
              mappedClientId && mappedClient?.status === "active"
                ? mappedClientId
                : null,
            dataProvider: "windsor",
            platform: "facebook",
            connector: parsed.connector,
            connectorAccountId: account.account_id,
            externalAccountId: parsed.externalAccountId,
            externalAccountName: displayName,
            normalizedName: normalizeSuggestionKey(displayName),
          });
        });
      }
    }
    if (seenConnectorAccounts.length > 0) {
      await db
        .update(sourceAccounts)
        .set({ status: "disconnected" })
        .where(
          and(
            eq(sourceAccounts.dataProvider, "windsor"),
            inArray(sourceAccounts.connector, ["facebook", "facebook_leads"]),
            ne(sourceAccounts.status, "ignored"),
            ne(sourceAccounts.connectorAccountId, seenConnectorAccounts[0]!),
            ...seenConnectorAccounts
              .slice(1)
              .map((id) => ne(sourceAccounts.connectorAccountId, id)),
          ),
        );
    }

    const activeAccounts = await db
      .select({
        connector: sourceAccounts.connector,
        connectorAccountId: sourceAccounts.connectorAccountId,
      })
      .from(sourceAccounts)
      .where(
        and(
          eq(sourceAccounts.dataProvider, "windsor"),
          eq(sourceAccounts.status, "active"),
        ),
      );
    const performanceAccounts = activeAccounts
      .filter((account) => account.connector === "facebook")
      .map((account) => account.connectorAccountId);
    const leadAccounts = activeAccounts
      .filter((account) => account.connector === "facebook_leads")
      .map((account) => account.connectorAccountId);

    for (const batch of chunkValues(performanceAccounts, 20)) {
      const rows = await client.fetchPerformance(batch);
      await upsertPerformanceBatch(rows, batch);
      performanceRowCount += rows.length;
    }
    for (const batch of chunkValues(leadAccounts, 20)) {
      const rows = await client.fetchLeads(batch);
      await upsertLeadBatch(rows, batch);
      leadRowCount += rows.length;
    }

    const completedAt = new Date();
    await db
      .update(syncRuns)
      .set({
        status: "succeeded",
        completedAt,
        discoveredAccountCount,
        performanceRowCount,
        leadRowCount,
      })
      .where(eq(syncRuns.id, run.id));
    return {
      runId: run.id,
      status: "succeeded",
      discoveredAccountCount,
      performanceRowCount,
      leadRowCount,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    const completedAt = new Date();
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt,
        discoveredAccountCount,
        performanceRowCount,
        leadRowCount,
        errorMessage:
          error instanceof Error ? error.message : "Unknown sync error",
      })
      .where(eq(syncRuns.id, run.id));
    throw new WindsorSyncError(
      {
        runId: run.id,
        status: "failed",
        discoveredAccountCount,
        performanceRowCount,
        leadRowCount,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
      { cause: error },
    );
  }
}
