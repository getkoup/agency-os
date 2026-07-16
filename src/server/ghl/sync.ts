import "server-only";

import { and, eq, lte, or } from "drizzle-orm";

import { db } from "~/server/db";
import {
  ghlContacts,
  ghlOpportunities,
  ghlOpportunityMatches,
  integrationMappings,
  leads,
  sourceAccounts,
} from "~/server/db/schema";
import type { GhlClient, GhlOpportunity } from "~/server/ghl/client";
import { normalizeEmail, normalizePhone } from "~/server/windsor/normalize";

const REPLAY_OVERLAP_MS = 5 * 60 * 1000;
export function normalizeGhlTags(
  tags: readonly string[] | undefined,
): string[] {
  const normalized = new Map<string, string>();
  for (const tag of tags ?? []) {
    const trimmed = tag.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (!normalized.has(key)) normalized.set(key, trimmed);
  }
  return [...normalized.values()];
}

export interface GhlSyncSummary {
  contactRowCount: number;
  opportunityRowCount: number;
  matchedOpportunityCount: number;
}

function safeRawOpportunity(row: GhlOpportunity): Record<string, unknown> {
  return {
    id: row.id,
    locationId: row.locationId,
    contactId: row.contactId,
    status: row.status,
    name: row.name ?? null,
    pipelineId: row.pipelineId ?? null,
    pipelineStageId: row.pipelineStageId ?? null,
    monetaryValue: row.monetaryValue ?? null,
    currency: row.currency ?? null,
    tags: row.tags ?? [],
    lastStatusChangeAt: row.lastStatusChangeAt,
    updatedAt: row.updatedAt,
  };
}

async function matchOpportunity(input: {
  opportunityId: string;
  clientId: string;
  wonAt: Date;
  email: string | null;
  phone: string | null;
}) {
  const keys = [
    input.email ? eq(leads.email, input.email) : undefined,
    input.phone ? eq(leads.phoneNumber, input.phone) : undefined,
  ].filter((value) => value !== undefined);
  const candidates =
    keys.length === 0
      ? []
      : await db
          .select({
            id: leads.id,
            email: leads.email,
            phone: leads.phoneNumber,
          })
          .from(leads)
          .innerJoin(
            sourceAccounts,
            eq(leads.sourceAccountId, sourceAccounts.id),
          )
          .where(
            and(
              eq(sourceAccounts.clientId, input.clientId),
              lte(leads.occurredAt, input.wonAt),
              or(...keys),
            ),
          );
  const candidateIds = new Set(candidates.map(({ id }) => id));
  const emailIds = new Set(
    candidates
      .filter(({ email }) => input.email !== null && email === input.email)
      .map(({ id }) => id),
  );
  const phoneIds = new Set(
    candidates
      .filter(({ phone }) => input.phone !== null && phone === input.phone)
      .map(({ id }) => id),
  );
  const matched = candidateIds.size === 1 ? candidates[0] : undefined;
  const method = matched
    ? emailIds.has(matched.id) && phoneIds.has(matched.id)
      ? "email_phone"
      : emailIds.has(matched.id)
        ? "email"
        : "phone"
    : null;
  const status = matched
    ? "matched"
    : candidateIds.size === 0
      ? "unmatched"
      : "ambiguous";

  await db
    .insert(ghlOpportunityMatches)
    .values({
      opportunityId: input.opportunityId,
      leadId: matched?.id ?? null,
      status,
      method,
      candidateCount: candidateIds.size,
    })
    .onConflictDoUpdate({
      target: ghlOpportunityMatches.opportunityId,
      set: {
        leadId: matched?.id ?? null,
        status,
        method,
        candidateCount: candidateIds.size,
        matchedAt: new Date(),
      },
    });
  return status === "matched";
}

async function upsertOpportunity(input: {
  mappingId: string;
  clientId: string;
  row: GhlOpportunity;
}) {
  const contactTags = normalizeGhlTags(input.row.contact.tags);
  const opportunityTags = normalizeGhlTags([
    ...(input.row.tags ?? []),
    ...contactTags,
  ]);
  const email = normalizeEmail(input.row.contact.email ?? undefined);
  const phone = normalizePhone(input.row.contact.phone ?? undefined);
  const now = new Date();
  const providerUpdatedAt = new Date(input.row.updatedAt);
  const wonAt = new Date(input.row.lastStatusChangeAt);
  const contact = await db.transaction(async (tx) => {
    const [value] = await tx
      .insert(ghlContacts)
      .values({
        integrationMappingId: input.mappingId,
        externalId: input.row.contact.id,
        fullName: input.row.contact.name ?? null,
        email: input.row.contact.email ?? null,
        normalizedEmail: email,
        phoneNumber: input.row.contact.phone ?? null,
        normalizedPhone: phone,
        tags: contactTags,
        providerUpdatedAt,
        rawPayload: {
          id: input.row.contact.id,
          name: input.row.contact.name ?? null,
          email: input.row.contact.email ?? null,
          phone: input.row.contact.phone ?? null,
          tags: input.row.contact.tags ?? [],
        },
      })
      .onConflictDoUpdate({
        target: [ghlContacts.integrationMappingId, ghlContacts.externalId],
        set: {
          fullName: input.row.contact.name ?? null,
          email: input.row.contact.email ?? null,
          normalizedEmail: email,
          phoneNumber: input.row.contact.phone ?? null,
          normalizedPhone: phone,
          tags: contactTags,
          providerUpdatedAt,
          updatedAt: now,
        },
      })
      .returning({ id: ghlContacts.id });
    if (!value) throw new Error("GHL contact upsert failed");
    const [opportunity] = await tx
      .insert(ghlOpportunities)
      .values({
        integrationMappingId: input.mappingId,
        contactId: value.id,
        externalId: input.row.id,
        status: input.row.status,
        name: input.row.name ?? null,
        pipelineId: input.row.pipelineId ?? null,
        pipelineStageId: input.row.pipelineStageId ?? null,
        monetaryValue:
          input.row.monetaryValue === null ||
          input.row.monetaryValue === undefined
            ? null
            : input.row.monetaryValue.toFixed(2),
        currency: input.row.currency ?? null,
        tags: opportunityTags,
        wonAt,
        providerUpdatedAt,
        rawPayload: safeRawOpportunity(input.row),
      })
      .onConflictDoUpdate({
        target: [
          ghlOpportunities.integrationMappingId,
          ghlOpportunities.externalId,
        ],
        set: {
          contactId: value.id,
          name: input.row.name ?? null,
          pipelineId: input.row.pipelineId ?? null,
          pipelineStageId: input.row.pipelineStageId ?? null,
          monetaryValue:
            input.row.monetaryValue === null ||
            input.row.monetaryValue === undefined
              ? null
              : input.row.monetaryValue.toFixed(2),
          currency: input.row.currency ?? null,
          tags: opportunityTags,
          wonAt,
          providerUpdatedAt,
          rawPayload: safeRawOpportunity(input.row),
          updatedAt: now,
        },
      })
      .returning({ id: ghlOpportunities.id });
    if (!opportunity) throw new Error("GHL opportunity upsert failed");
    return { opportunityId: opportunity.id };
  });
  const matched = await matchOpportunity({
    opportunityId: contact.opportunityId,
    clientId: input.clientId,
    wonAt,
    email,
    phone,
  });
  return matched;
}

export async function syncGhlLocation(input: {
  client: GhlClient;
  clientId: string;
  locationId: string;
  token: string;
  runStartedAt: Date;
  onPage?: () => Promise<void>;
}): Promise<GhlSyncSummary & { mappingId: string }> {
  const timezone = await input.client.locationTimezone({
    locationId: input.locationId,
    token: input.token,
  });
  const [mapping] = await db
    .insert(integrationMappings)
    .values({
      clientId: input.clientId,
      provider: "ghl",
      externalLocationId: input.locationId,
      timezone,
      syncFromAt: new Date(0),
    })
    .onConflictDoUpdate({
      target: [integrationMappings.clientId, integrationMappings.provider],
      set: { timezone, updatedAt: new Date() },
    })
    .returning({
      id: integrationMappings.id,
      syncFromAt: integrationMappings.syncFromAt,
      lastSuccessfulSyncAt: integrationMappings.lastSuccessfulSyncAt,
      externalLocationId: integrationMappings.externalLocationId,
    });
  if (mapping?.externalLocationId !== input.locationId) {
    throw new Error("GHL mapping identity conflict");
  }
  const replayFloor = mapping.lastSuccessfulSyncAt
    ? new Date(mapping.lastSuccessfulSyncAt.getTime() - REPLAY_OVERLAP_MS)
    : mapping.syncFromAt;
  const floor =
    replayFloor < mapping.syncFromAt ? mapping.syncFromAt : replayFloor;
  const summary: GhlSyncSummary = {
    contactRowCount: 0,
    opportunityRowCount: 0,
    matchedOpportunityCount: 0,
  };
  for await (const page of input.client.wonOpportunities({
    locationId: input.locationId,
    token: input.token,
    floor,
    through: input.runStartedAt,
    onPage: input.onPage,
  })) {
    for (const row of page) {
      const matched = await upsertOpportunity({
        mappingId: mapping.id,
        clientId: input.clientId,
        row,
      });
      summary.contactRowCount += 1;
      summary.opportunityRowCount += 1;
      if (matched) summary.matchedOpportunityCount += 1;
    }
  }
  await db
    .update(integrationMappings)
    .set({ lastSuccessfulSyncAt: input.runStartedAt, updatedAt: new Date() })
    .where(eq(integrationMappings.id, mapping.id));
  return { mappingId: mapping.id, ...summary };
}
