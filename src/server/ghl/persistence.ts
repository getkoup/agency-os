import { and, eq, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  ghlContacts,
  ghlOpportunities,
  ghlOpportunityMatches,
  leads,
  sourceAccounts,
} from "~/server/db/schema";
import type { GhlOpportunity } from "~/server/ghl/client";
import { normalizeEmail, normalizePhone } from "~/server/windsor/normalize";

export interface GhlPageSummary {
  contactRowCount: number;
  opportunityRowCount: number;
  matchedOpportunityCount: number;
}

type PreparedOpportunity = {
  row: GhlOpportunity;
  contactTags: string[];
  opportunityTags: string[];
  email: string | null;
  phone: string | null;
  wonAt: Date;
  providerUpdatedAt: Date;
};

type LeadCandidate = {
  id: string;
  email: string | null;
  phone: string | null;
  occurredAt: Date;
};

function normalizeGhlTags(tags: readonly string[] | undefined): string[] {
  const normalized = new Map<string, string>();
  for (const tag of tags ?? []) {
    const trimmed = tag.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (!normalized.has(key)) normalized.set(key, trimmed);
  }
  return [...normalized.values()];
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

function uniqueValues(values: ReadonlyArray<string | null>): string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== null)),
  ];
}

function requireMappedId(
  ids: ReadonlyMap<string, string>,
  externalId: string,
  message: string,
): string {
  const id = ids.get(externalId);
  if (!id) throw new Error(message);
  return id;
}

function addCandidate(
  candidates: Map<string, LeadCandidate[]>,
  key: string | null,
  candidate: LeadCandidate,
) {
  if (!key) return;
  const matches = candidates.get(key) ?? [];
  matches.push(candidate);
  candidates.set(key, matches);
}

export async function upsertGhlOpportunityPage(input: {
  mappingId: string;
  clientId: string;
  rows: readonly GhlOpportunity[];
}): Promise<GhlPageSummary> {
  if (input.rows.length === 0) {
    return {
      contactRowCount: 0,
      opportunityRowCount: 0,
      matchedOpportunityCount: 0,
    };
  }

  const preparedByOpportunityId = new Map<string, PreparedOpportunity>();
  for (const row of input.rows) {
    const contactTags = normalizeGhlTags(row.contact.tags);
    preparedByOpportunityId.set(row.id, {
      row,
      contactTags,
      opportunityTags: normalizeGhlTags([...(row.tags ?? []), ...contactTags]),
      email: normalizeEmail(row.contact.email ?? undefined),
      phone: normalizePhone(row.contact.phone ?? undefined),
      wonAt: new Date(row.createdAt),
      providerUpdatedAt: new Date(row.updatedAt),
    });
  }
  const prepared = [...preparedByOpportunityId.values()];

  const matchedOpportunityCount = await db.transaction(async (tx) => {
    const now = new Date();
    const contactValues = new Map<string, typeof ghlContacts.$inferInsert>();
    for (const value of prepared) {
      contactValues.set(value.row.contact.id, {
        integrationMappingId: input.mappingId,
        externalId: value.row.contact.id,
        fullName: value.row.contact.name ?? null,
        email: value.row.contact.email ?? null,
        normalizedEmail: value.email,
        phoneNumber: value.row.contact.phone ?? null,
        normalizedPhone: value.phone,
        tags: value.contactTags,
        providerUpdatedAt: value.providerUpdatedAt,
        rawPayload: {
          id: value.row.contact.id,
          name: value.row.contact.name ?? null,
          email: value.row.contact.email ?? null,
          phone: value.row.contact.phone ?? null,
          tags: value.row.contact.tags ?? [],
        },
      });
    }
    const storedContacts = await tx
      .insert(ghlContacts)
      .values([...contactValues.values()])
      .onConflictDoUpdate({
        target: [ghlContacts.integrationMappingId, ghlContacts.externalId],
        set: {
          fullName: sql`excluded."fullName"`,
          email: sql`excluded."email"`,
          normalizedEmail: sql`excluded."normalizedEmail"`,
          phoneNumber: sql`excluded."phoneNumber"`,
          normalizedPhone: sql`excluded."normalizedPhone"`,
          tags: sql`excluded."tags"`,
          providerUpdatedAt: sql`excluded."providerUpdatedAt"`,
          updatedAt: now,
        },
      })
      .returning({ id: ghlContacts.id, externalId: ghlContacts.externalId });
    const contactIds = new Map(
      storedContacts.map((contact) => [contact.externalId, contact.id]),
    );

    const opportunityValues = prepared.map((value) => ({
      integrationMappingId: input.mappingId,
      contactId: requireMappedId(
        contactIds,
        value.row.contact.id,
        "GHL contact upsert failed",
      ),
      externalId: value.row.id,
      status: value.row.status,
      name: value.row.name ?? null,
      pipelineId: value.row.pipelineId ?? null,
      pipelineStageId: value.row.pipelineStageId ?? null,
      monetaryValue:
        value.row.monetaryValue === null ||
        value.row.monetaryValue === undefined
          ? null
          : value.row.monetaryValue.toFixed(2),
      currency: value.row.currency ?? null,
      tags: value.opportunityTags,
      wonAt: value.wonAt,
      providerUpdatedAt: value.providerUpdatedAt,
      rawPayload: safeRawOpportunity(value.row),
    }));
    const storedOpportunities = await tx
      .insert(ghlOpportunities)
      .values(opportunityValues)
      .onConflictDoUpdate({
        target: [
          ghlOpportunities.integrationMappingId,
          ghlOpportunities.externalId,
        ],
        set: {
          contactId: sql`excluded."contactId"`,
          name: sql`excluded."name"`,
          pipelineId: sql`excluded."pipelineId"`,
          pipelineStageId: sql`excluded."pipelineStageId"`,
          monetaryValue: sql`excluded."monetaryValue"`,
          currency: sql`excluded."currency"`,
          tags: sql`excluded."tags"`,
          wonAt: sql`excluded."wonAt"`,
          providerUpdatedAt: sql`excluded."providerUpdatedAt"`,
          rawPayload: sql`excluded."rawPayload"`,
          updatedAt: now,
        },
      })
      .returning({
        id: ghlOpportunities.id,
        externalId: ghlOpportunities.externalId,
      });
    const opportunityIds = new Map(
      storedOpportunities.map((opportunity) => [
        opportunity.externalId,
        opportunity.id,
      ]),
    );

    const emails = uniqueValues(prepared.map(({ email }) => email));
    const phones = uniqueValues(prepared.map(({ phone }) => phone));
    const maxWonAt = new Date(
      Math.max(...prepared.map(({ wonAt }) => wonAt.getTime())),
    );
    const contactPredicate =
      emails.length > 0 && phones.length > 0
        ? or(inArray(leads.email, emails), inArray(leads.phoneNumber, phones))
        : emails.length > 0
          ? inArray(leads.email, emails)
          : phones.length > 0
            ? inArray(leads.phoneNumber, phones)
            : undefined;
    const candidateRows: LeadCandidate[] = contactPredicate
      ? await tx
          .select({
            id: leads.id,
            email: leads.email,
            phone: leads.phoneNumber,
            occurredAt: leads.occurredAt,
          })
          .from(leads)
          .innerJoin(
            sourceAccounts,
            eq(leads.sourceAccountId, sourceAccounts.id),
          )
          .where(
            and(
              eq(sourceAccounts.clientId, input.clientId),
              lte(leads.occurredAt, maxWonAt),
              contactPredicate,
            ),
          )
      : [];
    const candidatesByEmail = new Map<string, LeadCandidate[]>();
    const candidatesByPhone = new Map<string, LeadCandidate[]>();
    for (const candidate of candidateRows) {
      addCandidate(candidatesByEmail, candidate.email, candidate);
      addCandidate(candidatesByPhone, candidate.phone, candidate);
    }

    const matchValues: Array<typeof ghlOpportunityMatches.$inferInsert> = [];
    let matchedCount = 0;
    for (const value of prepared) {
      const emailCandidates = value.email
        ? (candidatesByEmail.get(value.email) ?? []).filter(
            ({ occurredAt }) => occurredAt <= value.wonAt,
          )
        : [];
      const phoneCandidates = value.phone
        ? (candidatesByPhone.get(value.phone) ?? []).filter(
            ({ occurredAt }) => occurredAt <= value.wonAt,
          )
        : [];
      const candidatesById = new Map(
        [...emailCandidates, ...phoneCandidates].map((candidate) => [
          candidate.id,
          candidate,
        ]),
      );
      const matched =
        candidatesById.size === 1 ? [...candidatesById.values()][0] : undefined;
      const emailIds = new Set(emailCandidates.map(({ id }) => id));
      const phoneIds = new Set(phoneCandidates.map(({ id }) => id));
      const method = matched
        ? emailIds.has(matched.id) && phoneIds.has(matched.id)
          ? "email_phone"
          : emailIds.has(matched.id)
            ? "email"
            : "phone"
        : null;
      const status = matched
        ? ("matched" as const)
        : candidatesById.size === 0
          ? ("unmatched" as const)
          : ("ambiguous" as const);
      if (matched) matchedCount += 1;
      matchValues.push({
        opportunityId: requireMappedId(
          opportunityIds,
          value.row.id,
          "GHL opportunity upsert failed",
        ),
        leadId: matched?.id ?? null,
        status,
        method,
        candidateCount: candidatesById.size,
      });
    }
    await tx
      .insert(ghlOpportunityMatches)
      .values(matchValues)
      .onConflictDoUpdate({
        target: ghlOpportunityMatches.opportunityId,
        set: {
          leadId: sql`excluded."leadId"`,
          status: sql`excluded."status"`,
          method: sql`excluded."method"`,
          candidateCount: sql`excluded."candidateCount"`,
          matchedAt: now,
        },
      });
    return matchedCount;
  });

  return {
    contactRowCount: input.rows.length,
    opportunityRowCount: input.rows.length,
    matchedOpportunityCount,
  };
}
