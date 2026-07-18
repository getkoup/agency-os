import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  adGroups,
  adPerformanceDaily,
  ads,
  campaigns,
  leadForms,
  leads,
  sourceAccounts,
} from "~/server/db/schema";
import type { LeadRow, PerformanceRow } from "~/server/windsor/client";
import {
  chunkValues,
  normalizeEmail,
  normalizePhone,
  parseNullableInteger,
  parseNullableNumber,
  parseOccurredAt,
} from "~/server/windsor/normalize";

const WRITE_CHUNK_SIZE = 500;

type SourceIdentity = {
  id: string;
  connectorAccountId: string;
  externalAccountId: string;
};

function identityKey(...values: string[]): string {
  return JSON.stringify(values);
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function numericString(value: unknown): string | null {
  const parsed = parseNullableNumber(value);
  return parsed === null ? null : parsed.toFixed(2);
}

function rawPayload(row: object): Record<string, unknown> {
  return { ...row };
}

function mapSourceAccounts(
  connector: "facebook" | "facebook_leads",
  accountIds: readonly string[],
  requestedAccounts: readonly string[],
  sources: readonly SourceIdentity[],
): Map<string, SourceIdentity> {
  const requested = new Set(requestedAccounts);
  const byExternalId = new Map<string, SourceIdentity>();
  for (const source of sources) {
    if (byExternalId.has(source.externalAccountId)) {
      throw new Error(`Source account identity mismatch for ${connector}`);
    }
    byExternalId.set(source.externalAccountId, source);
  }
  for (const accountId of accountIds) {
    const source = byExternalId.get(accountId);
    if (!source) {
      throw new Error(`Source account identity mismatch for ${connector}`);
    }
    if (!requested.has(source.connectorAccountId)) {
      throw new Error(
        `Source account row was outside the requested ${connector} batch`,
      );
    }
  }
  return byExternalId;
}

function requireMappedValue<T>(
  values: ReadonlyMap<string, T>,
  key: string,
  message: string,
): T {
  const value = values.get(key);
  if (!value) throw new Error(message);
  return value;
}

export async function upsertPerformanceBatch(
  rows: readonly PerformanceRow[],
  requestedAccounts: readonly string[],
) {
  if (rows.length === 0) return;

  await db.transaction(async (tx) => {
    const accountIds = uniqueValues(rows.map((row) => row.account_id));
    const sourceRows = await tx
      .select({
        id: sourceAccounts.id,
        connectorAccountId: sourceAccounts.connectorAccountId,
        externalAccountId: sourceAccounts.externalAccountId,
      })
      .from(sourceAccounts)
      .where(
        and(
          eq(sourceAccounts.dataProvider, "windsor"),
          eq(sourceAccounts.connector, "facebook"),
          inArray(sourceAccounts.externalAccountId, accountIds),
        ),
      );
    const sources = mapSourceAccounts(
      "facebook",
      accountIds,
      requestedAccounts,
      sourceRows,
    );
    const now = new Date();

    const campaignValues = new Map<string, typeof campaigns.$inferInsert>();
    for (const row of rows) {
      const source = requireMappedValue(
        sources,
        row.account_id,
        "Validated performance source disappeared",
      );
      campaignValues.set(identityKey(source.id, row.campaign_id), {
        sourceAccountId: source.id,
        externalId: row.campaign_id,
        name: row.campaign,
      });
    }
    const storedCampaigns: Array<{
      id: string;
      sourceAccountId: string;
      externalId: string;
    }> = [];
    for (const values of chunkValues(
      [...campaignValues.values()],
      WRITE_CHUNK_SIZE,
    )) {
      storedCampaigns.push(
        ...(await tx
          .insert(campaigns)
          .values(values)
          .onConflictDoUpdate({
            target: [campaigns.sourceAccountId, campaigns.externalId],
            set: { name: sql`excluded."name"`, updatedAt: now },
          })
          .returning({
            id: campaigns.id,
            sourceAccountId: campaigns.sourceAccountId,
            externalId: campaigns.externalId,
          })),
      );
    }
    const campaignIds = new Map(
      storedCampaigns.map((campaign) => [
        identityKey(campaign.sourceAccountId, campaign.externalId),
        campaign.id,
      ]),
    );

    const adGroupValues = new Map<string, typeof adGroups.$inferInsert>();
    for (const row of rows) {
      const source = requireMappedValue(
        sources,
        row.account_id,
        "Validated performance source disappeared",
      );
      const campaignId = requireMappedValue(
        campaignIds,
        identityKey(source.id, row.campaign_id),
        "Campaign upsert failed",
      );
      adGroupValues.set(identityKey(campaignId, row.adset_id), {
        campaignId,
        externalId: row.adset_id,
        name: row.adset_name,
      });
    }
    const storedAdGroups: Array<{
      id: string;
      campaignId: string;
      externalId: string;
    }> = [];
    for (const values of chunkValues(
      [...adGroupValues.values()],
      WRITE_CHUNK_SIZE,
    )) {
      storedAdGroups.push(
        ...(await tx
          .insert(adGroups)
          .values(values)
          .onConflictDoUpdate({
            target: [adGroups.campaignId, adGroups.externalId],
            set: { name: sql`excluded."name"`, updatedAt: now },
          })
          .returning({
            id: adGroups.id,
            campaignId: adGroups.campaignId,
            externalId: adGroups.externalId,
          })),
      );
    }
    const adGroupIds = new Map(
      storedAdGroups.map((adGroup) => [
        identityKey(adGroup.campaignId, adGroup.externalId),
        adGroup.id,
      ]),
    );

    const adValues = new Map<string, typeof ads.$inferInsert>();
    for (const row of rows) {
      const source = requireMappedValue(
        sources,
        row.account_id,
        "Validated performance source disappeared",
      );
      const campaignId = requireMappedValue(
        campaignIds,
        identityKey(source.id, row.campaign_id),
        "Campaign upsert failed",
      );
      const adGroupId = requireMappedValue(
        adGroupIds,
        identityKey(campaignId, row.adset_id),
        "Ad group upsert failed",
      );
      adValues.set(identityKey(adGroupId, row.ad_id), {
        adGroupId,
        externalId: row.ad_id,
        name: row.ad_name,
      });
    }
    const storedAds: Array<{
      id: string;
      adGroupId: string;
      externalId: string;
    }> = [];
    for (const values of chunkValues(
      [...adValues.values()],
      WRITE_CHUNK_SIZE,
    )) {
      storedAds.push(
        ...(await tx
          .insert(ads)
          .values(values)
          .onConflictDoUpdate({
            target: [ads.adGroupId, ads.externalId],
            set: { name: sql`excluded."name"`, updatedAt: now },
          })
          .returning({
            id: ads.id,
            adGroupId: ads.adGroupId,
            externalId: ads.externalId,
          })),
      );
    }
    const adIds = new Map(
      storedAds.map((ad) => [identityKey(ad.adGroupId, ad.externalId), ad.id]),
    );

    const performanceValues = new Map<
      string,
      typeof adPerformanceDaily.$inferInsert
    >();
    for (const row of rows) {
      const source = requireMappedValue(
        sources,
        row.account_id,
        "Validated performance source disappeared",
      );
      const campaignId = requireMappedValue(
        campaignIds,
        identityKey(source.id, row.campaign_id),
        "Campaign upsert failed",
      );
      const adGroupId = requireMappedValue(
        adGroupIds,
        identityKey(campaignId, row.adset_id),
        "Ad group upsert failed",
      );
      const adId = requireMappedValue(
        adIds,
        identityKey(adGroupId, row.ad_id),
        "Ad upsert failed",
      );
      performanceValues.set(identityKey(adId, row.date), {
        sourceAccountId: source.id,
        campaignId,
        adGroupId,
        adId,
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
      });
    }
    for (const values of chunkValues(
      [...performanceValues.values()],
      WRITE_CHUNK_SIZE,
    )) {
      await tx
        .insert(adPerformanceDaily)
        .values(values)
        .onConflictDoUpdate({
          target: [adPerformanceDaily.adId, adPerformanceDaily.date],
          set: {
            sourceAccountId: sql`excluded."sourceAccountId"`,
            campaignId: sql`excluded."campaignId"`,
            adGroupId: sql`excluded."adGroupId"`,
            currency: sql`excluded."currency"`,
            spend: sql`excluded."spend"`,
            impressions: sql`excluded."impressions"`,
            reach: sql`excluded."reach"`,
            clicks: sql`excluded."clicks"`,
            linkClicks: sql`excluded."linkClicks"`,
            engagements: sql`excluded."engagements"`,
            conversions: sql`excluded."conversions"`,
            leads: sql`excluded."leads"`,
            messagingConversations: sql`excluded."messagingConversations"`,
            messagingConnections: sql`excluded."messagingConnections"`,
            cpc: sql`excluded."cpc"`,
            ctr: sql`excluded."ctr"`,
            providerMetrics: sql`excluded."providerMetrics"`,
            rawPayload: sql`excluded."rawPayload"`,
            updatedAt: now,
          },
        });
    }

    await tx
      .update(sourceAccounts)
      .set({ lastSyncedAt: now })
      .where(
        inArray(
          sourceAccounts.id,
          uniqueValues(sourceRows.map(({ id }) => id)),
        ),
      );
  });
}

type PreparedLead = {
  row: LeadRow;
  source: SourceIdentity;
  hierarchy: {
    campaignId: string | null;
    adGroupId: string | null;
    adId: string | null;
  };
};

export async function upsertLeadBatch(
  rows: readonly LeadRow[],
  requestedAccounts: readonly string[],
) {
  if (rows.length === 0) return;

  await db.transaction(async (tx) => {
    const accountIds = uniqueValues(rows.map((row) => row.account_id));
    const sourceRows = await tx
      .select({
        id: sourceAccounts.id,
        connectorAccountId: sourceAccounts.connectorAccountId,
        externalAccountId: sourceAccounts.externalAccountId,
      })
      .from(sourceAccounts)
      .where(
        and(
          eq(sourceAccounts.dataProvider, "windsor"),
          eq(sourceAccounts.connector, "facebook_leads"),
          inArray(sourceAccounts.externalAccountId, accountIds),
        ),
      );
    const sources = mapSourceAccounts(
      "facebook_leads",
      accountIds,
      requestedAccounts,
      sourceRows,
    );

    const requestedCampaignIds = uniqueValues(
      rows.flatMap((row) => (row.campaign_id ? [row.campaign_id] : [])),
    );
    const storedCampaigns =
      requestedCampaignIds.length === 0
        ? []
        : await tx
            .select({ id: campaigns.id, externalId: campaigns.externalId })
            .from(campaigns)
            .where(inArray(campaigns.externalId, requestedCampaignIds));
    const campaignsByExternalId = new Map<
      string,
      Array<{ id: string; externalId: string }>
    >();
    for (const campaign of storedCampaigns) {
      const matches = campaignsByExternalId.get(campaign.externalId) ?? [];
      matches.push(campaign);
      campaignsByExternalId.set(campaign.externalId, matches);
    }

    const withCampaigns = rows.map((row) => {
      const source = requireMappedValue(
        sources,
        row.account_id,
        "Validated lead source disappeared",
      );
      if (!row.campaign_id) return { row, source, campaignId: null };
      const matches = campaignsByExternalId.get(row.campaign_id) ?? [];
      if (matches.length > 1) {
        throw new Error("Ambiguous lead campaign identity");
      }
      return { row, source, campaignId: matches[0]?.id ?? null };
    });

    const requestedAdGroupCampaignIds = uniqueValues(
      withCampaigns.flatMap(({ campaignId, row }) =>
        campaignId && row.adset_id ? [campaignId] : [],
      ),
    );
    const requestedAdGroupExternalIds = uniqueValues(
      withCampaigns.flatMap(({ campaignId, row }) =>
        campaignId && row.adset_id ? [row.adset_id] : [],
      ),
    );
    const storedAdGroups =
      requestedAdGroupCampaignIds.length === 0 ||
      requestedAdGroupExternalIds.length === 0
        ? []
        : await tx
            .select({
              id: adGroups.id,
              campaignId: adGroups.campaignId,
              externalId: adGroups.externalId,
            })
            .from(adGroups)
            .where(
              and(
                inArray(adGroups.campaignId, requestedAdGroupCampaignIds),
                inArray(adGroups.externalId, requestedAdGroupExternalIds),
              ),
            );
    const adGroupsByIdentity = new Map<
      string,
      Array<{ id: string; campaignId: string; externalId: string }>
    >();
    for (const adGroup of storedAdGroups) {
      const key = identityKey(adGroup.campaignId, adGroup.externalId);
      const matches = adGroupsByIdentity.get(key) ?? [];
      matches.push(adGroup);
      adGroupsByIdentity.set(key, matches);
    }

    const withAdGroups = withCampaigns.map(({ row, source, campaignId }) => {
      if (!campaignId || !row.adset_id) {
        return { row, source, campaignId, adGroupId: null };
      }
      const matches =
        adGroupsByIdentity.get(identityKey(campaignId, row.adset_id)) ?? [];
      if (matches.length > 1) throw new Error("Ambiguous lead ad group");
      return {
        row,
        source,
        campaignId,
        adGroupId: matches[0]?.id ?? null,
      };
    });

    const requestedAdGroupIds = uniqueValues(
      withAdGroups.flatMap(({ adGroupId }) => (adGroupId ? [adGroupId] : [])),
    );
    const storedAds =
      requestedAdGroupIds.length === 0
        ? []
        : await tx
            .select({
              id: ads.id,
              adGroupId: ads.adGroupId,
              externalId: ads.externalId,
              name: ads.name,
            })
            .from(ads)
            .where(inArray(ads.adGroupId, requestedAdGroupIds));
    const adsByAdGroup = new Map<
      string,
      Array<{ id: string; externalId: string; name: string }>
    >();
    for (const ad of storedAds) {
      const matches = adsByAdGroup.get(ad.adGroupId) ?? [];
      matches.push(ad);
      adsByAdGroup.set(ad.adGroupId, matches);
    }

    const prepared: PreparedLead[] = withAdGroups.map(
      ({ row, source, campaignId, adGroupId }) => {
        if (!adGroupId) {
          return {
            row,
            source,
            hierarchy: { campaignId, adGroupId: null, adId: null },
          };
        }
        const candidates = adsByAdGroup.get(adGroupId) ?? [];
        const matches = row.ad_id
          ? candidates.filter((ad) => ad.externalId === row.ad_id)
          : row.ad_name
            ? candidates.filter((ad) => ad.name === row.ad_name)
            : [];
        if (matches.length > 1) throw new Error("Ambiguous lead ad identity");
        return {
          row,
          source,
          hierarchy: {
            campaignId,
            adGroupId,
            adId: matches[0]?.id ?? null,
          },
        };
      },
    );

    const now = new Date();
    const leadFormValues = new Map<string, typeof leadForms.$inferInsert>();
    for (const { row, source } of prepared) {
      if (!row.form_id) continue;
      leadFormValues.set(identityKey(source.id, row.form_id), {
        sourceAccountId: source.id,
        externalId: row.form_id,
      });
    }
    const storedLeadForms: Array<{
      id: string;
      sourceAccountId: string;
      externalId: string;
    }> = [];
    for (const values of chunkValues(
      [...leadFormValues.values()],
      WRITE_CHUNK_SIZE,
    )) {
      storedLeadForms.push(
        ...(await tx
          .insert(leadForms)
          .values(values)
          .onConflictDoUpdate({
            target: [leadForms.sourceAccountId, leadForms.externalId],
            set: { updatedAt: now },
          })
          .returning({
            id: leadForms.id,
            sourceAccountId: leadForms.sourceAccountId,
            externalId: leadForms.externalId,
          })),
      );
    }
    const leadFormIds = new Map(
      storedLeadForms.map((form) => [
        identityKey(form.sourceAccountId, form.externalId),
        form.id,
      ]),
    );

    const leadValues = new Map<string, typeof leads.$inferInsert>();
    for (const { row, source, hierarchy } of prepared) {
      const fullName = row.full_name?.trim();
      const phoneSource = row.phone_number?.trim()
        ? row.phone_number
        : row.phone;
      const leadFormId = row.form_id
        ? requireMappedValue(
            leadFormIds,
            identityKey(source.id, row.form_id),
            "Lead form upsert failed",
          )
        : null;
      leadValues.set(identityKey(source.id, row.id), {
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
      });
    }
    for (const values of chunkValues(
      [...leadValues.values()],
      WRITE_CHUNK_SIZE,
    )) {
      await tx
        .insert(leads)
        .values(values)
        .onConflictDoUpdate({
          target: [leads.sourceAccountId, leads.externalId],
          set: {
            campaignId: sql`excluded."campaignId"`,
            adGroupId: sql`excluded."adGroupId"`,
            adId: sql`excluded."adId"`,
            leadFormId: sql`excluded."leadFormId"`,
            occurredAt: sql`excluded."occurredAt"`,
            fullName: sql`excluded."fullName"`,
            email: sql`excluded."email"`,
            phoneNumber: sql`excluded."phoneNumber"`,
            rawPayload: sql`excluded."rawPayload"`,
            updatedAt: now,
          },
        });
    }

    await tx
      .update(sourceAccounts)
      .set({ lastSyncedAt: now })
      .where(
        inArray(
          sourceAccounts.id,
          uniqueValues(sourceRows.map(({ id }) => id)),
        ),
      );
  });
}
