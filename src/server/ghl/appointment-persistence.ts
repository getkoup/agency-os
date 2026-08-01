import "server-only";

import { and, eq, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  ghlAppointmentMatches,
  ghlAppointments,
  ghlCalendars,
  ghlContacts,
  leads,
  salespeople,
  sourceAccounts,
} from "~/server/db/schema";
import type {
  GhlCalendar,
  GhlCalendarEvent,
  GhlContact,
  GhlUser,
} from "~/server/ghl/client";
import { normalizeEmail, normalizePhone } from "~/server/windsor/normalize";

type LeadCandidate = {
  id: string;
  email: string | null;
  phone: string | null;
  occurredAt: Date;
};

function normalizedTags(tags: readonly string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function normalizedSource(source: string | null | undefined): string | null {
  const trimmed = source?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function joinedName(
  values: readonly (string | null | undefined)[],
): string | null {
  const name = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return name || null;
}

function contactFullName(contact: GhlContact): string | null {
  return (
    normalizedSource(contact.name) ??
    joinedName([contact.firstName, contact.lastName])
  );
}

function userFullName(user: GhlUser): string | null {
  return (
    normalizedSource(user.name) ?? joinedName([user.firstName, user.lastName])
  );
}

export async function updateGhlSalespersonNames(input: {
  clientId: string;
  users: readonly GhlUser[];
}): Promise<{ updatedCount: number }> {
  const names = new Map<string, string>();
  for (const user of input.users) {
    const providerName = userFullName(user);
    if (providerName) names.set(user.id, providerName);
  }
  if (names.size === 0) return { updatedCount: 0 };

  return db.transaction(async (tx) => {
    let updatedCount = 0;
    for (const [externalUserId, providerName] of names) {
      const rows = await tx
        .update(salespeople)
        .set({ providerName, updatedAt: new Date() })
        .where(
          and(
            eq(salespeople.clientId, input.clientId),
            eq(salespeople.externalUserId, externalUserId),
          ),
        )
        .returning({ id: salespeople.id });
      updatedCount += rows.length;
    }
    return { updatedCount };
  });
}

export async function upsertGhlAppointmentBatch(input: {
  mappingId: string;
  clientId: string;
  calendars: readonly GhlCalendar[];
  events: readonly GhlCalendarEvent[];
  contacts: ReadonlyMap<string, GhlContact>;
}): Promise<{ appointmentCount: number; matchedAppointmentCount: number }> {
  if (input.calendars.length === 0) {
    return { appointmentCount: 0, matchedAppointmentCount: 0 };
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const storedCalendars = await tx
      .insert(ghlCalendars)
      .values(
        input.calendars.map((calendar) => ({
          integrationMappingId: input.mappingId,
          externalId: calendar.id,
          name: calendar.name,
          isActive: calendar.isActive,
        })),
      )
      .onConflictDoUpdate({
        target: [ghlCalendars.integrationMappingId, ghlCalendars.externalId],
        set: {
          name: sql`excluded."name"`,
          isActive: sql`excluded."isActive"`,
          updatedAt: now,
        },
      })
      .returning({ id: ghlCalendars.id, externalId: ghlCalendars.externalId });
    const calendarIds = new Map(
      storedCalendars.map((calendar) => [calendar.externalId, calendar.id]),
    );
    if (input.events.length === 0) {
      return { appointmentCount: 0, matchedAppointmentCount: 0 };
    }

    const contacts = [...input.contacts.values()];
    const storedContacts = await tx
      .insert(ghlContacts)
      .values(
        contacts.map((contact) => ({
          integrationMappingId: input.mappingId,
          externalId: contact.id,
          fullName: contactFullName(contact),
          email: contact.email ?? null,
          normalizedEmail: normalizeEmail(contact.email ?? undefined),
          phoneNumber: contact.phone ?? null,
          normalizedPhone: normalizePhone(contact.phone ?? undefined),
          source: normalizedSource(contact.source),
          attributionSource: contact.attributionSource ?? null,
          lastAttributionSource: contact.lastAttributionSource ?? null,
          tags: normalizedTags(contact.tags),
          providerUpdatedAt: new Date(contact.dateUpdated),
          rawPayload: {
            id: contact.id,
            name: contact.name ?? null,
            firstName: contact.firstName ?? null,
            lastName: contact.lastName ?? null,
            email: contact.email ?? null,
            phone: contact.phone ?? null,
            source: contact.source ?? null,
            attributionSource: contact.attributionSource ?? null,
            lastAttributionSource: contact.lastAttributionSource ?? null,
            tags: contact.tags ?? [],
          },
        })),
      )
      .onConflictDoUpdate({
        target: [ghlContacts.integrationMappingId, ghlContacts.externalId],
        set: {
          fullName: sql`excluded."fullName"`,
          email: sql`excluded."email"`,
          normalizedEmail: sql`excluded."normalizedEmail"`,
          phoneNumber: sql`excluded."phoneNumber"`,
          normalizedPhone: sql`excluded."normalizedPhone"`,
          source: sql`excluded."source"`,
          attributionSource: sql`excluded."attributionSource"`,
          lastAttributionSource: sql`excluded."lastAttributionSource"`,
          tags: sql`excluded."tags"`,
          providerUpdatedAt: sql`excluded."providerUpdatedAt"`,
          rawPayload: sql`excluded."rawPayload"`,
          updatedAt: now,
        },
      })
      .returning({ id: ghlContacts.id, externalId: ghlContacts.externalId });
    const contactIds = new Map(
      storedContacts.map((contact) => [contact.externalId, contact.id]),
    );
    const externalUserIds = [
      ...new Set(
        input.events.flatMap((event) =>
          [
            normalizedSource(event.createdBy?.userId),
            normalizedSource(event.assignedUserId),
          ].filter((value): value is string => value !== null),
        ),
      ),
    ];
    if (externalUserIds.length > 0) {
      await tx
        .insert(salespeople)
        .values(
          externalUserIds.map((externalUserId) => ({
            clientId: input.clientId,
            externalUserId,
            providerName: null,
            displayName: null,
            lastSeenAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [salespeople.clientId, salespeople.externalUserId],
          set: {
            status: "active",
            lastSeenAt: now,
            updatedAt: now,
          },
        });
    }

    const appointments = await tx
      .insert(ghlAppointments)
      .values(
        input.events.map((event) => {
          const calendarId = calendarIds.get(event.calendarId);
          const contactId = contactIds.get(event.contactId);
          if (!calendarId || !contactId) {
            throw new Error("GHL appointment relationship mapping failed");
          }
          return {
            integrationMappingId: input.mappingId,
            calendarId,
            contactId,
            externalId: event.id,
            status: event.appointmentStatus,
            title: normalizedSource(event.title),
            description: normalizedSource(event.description),
            notes: normalizedSource(event.notes),
            assignedUserExternalId: normalizedSource(event.assignedUserId),
            createdByUserExternalId: normalizedSource(event.createdBy?.userId),
            createdBySource: normalizedSource(event.createdBy?.source),
            startsAt: new Date(event.startTime),
            endsAt: new Date(event.endTime),
            providerCreatedAt: new Date(event.dateAdded),
            providerUpdatedAt: new Date(event.dateUpdated),
            deleted: event.deleted,
            rawPayload: event,
          };
        }),
      )
      .onConflictDoUpdate({
        target: [
          ghlAppointments.integrationMappingId,
          ghlAppointments.externalId,
        ],
        set: {
          calendarId: sql`excluded."calendarId"`,
          contactId: sql`excluded."contactId"`,
          status: sql`excluded."status"`,
          title: sql`excluded."title"`,
          description: sql`excluded."description"`,
          notes: sql`excluded."notes"`,
          assignedUserExternalId: sql`excluded."assignedUserExternalId"`,
          createdByUserExternalId: sql`excluded."createdByUserExternalId"`,
          createdBySource: sql`excluded."createdBySource"`,
          startsAt: sql`excluded."startsAt"`,
          endsAt: sql`excluded."endsAt"`,
          providerUpdatedAt: sql`excluded."providerUpdatedAt"`,
          deleted: sql`excluded."deleted"`,
          rawPayload: sql`excluded."rawPayload"`,
          updatedAt: now,
        },
      })
      .returning({
        id: ghlAppointments.id,
        externalId: ghlAppointments.externalId,
      });
    const appointmentIds = new Map(
      appointments.map((appointment) => [
        appointment.externalId,
        appointment.id,
      ]),
    );

    const emails = contacts
      .map((contact) => normalizeEmail(contact.email ?? undefined))
      .filter((value): value is string => value !== null);
    const phones = contacts
      .map((contact) => normalizePhone(contact.phone ?? undefined))
      .filter((value): value is string => value !== null);
    const latestStart = new Date(
      Math.max(...input.events.map((event) => Date.parse(event.startTime))),
    );
    const contactPredicate =
      emails.length && phones.length
        ? or(inArray(leads.email, emails), inArray(leads.phoneNumber, phones))
        : emails.length
          ? inArray(leads.email, emails)
          : phones.length
            ? inArray(leads.phoneNumber, phones)
            : undefined;
    const candidates: LeadCandidate[] = contactPredicate
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
              lte(leads.occurredAt, latestStart),
              contactPredicate,
            ),
          )
      : [];
    let matchedAppointmentCount = 0;
    const matches = input.events.map((event) => {
      const contact = input.contacts.get(event.contactId);
      if (!contact) throw new Error("GHL appointment contact missing");
      const email = normalizeEmail(contact.email ?? undefined);
      const phone = normalizePhone(contact.phone ?? undefined);
      const startsAt = new Date(event.startTime);
      const emailMatches = candidates.filter(
        (candidate) =>
          email &&
          candidate.email === email &&
          candidate.occurredAt <= startsAt,
      );
      const phoneMatches = candidates.filter(
        (candidate) =>
          phone &&
          candidate.phone === phone &&
          candidate.occurredAt <= startsAt,
      );
      const byId = new Map(
        [...emailMatches, ...phoneMatches].map((candidate) => [
          candidate.id,
          candidate,
        ]),
      );
      const matched = byId.size === 1 ? [...byId.values()][0] : undefined;
      if (matched) matchedAppointmentCount += 1;
      const method = matched
        ? emailMatches.some(({ id }) => id === matched.id) &&
          phoneMatches.some(({ id }) => id === matched.id)
          ? ("email_phone" as const)
          : emailMatches.some(({ id }) => id === matched.id)
            ? ("email" as const)
            : ("phone" as const)
        : null;
      const appointmentId = appointmentIds.get(event.id);
      if (!appointmentId) throw new Error("GHL appointment upsert failed");
      return {
        appointmentId,
        leadId: matched?.id ?? null,
        status: matched
          ? ("matched" as const)
          : byId.size
            ? ("ambiguous" as const)
            : ("unmatched" as const),
        method,
        candidateCount: byId.size,
      };
    });
    await tx
      .insert(ghlAppointmentMatches)
      .values(matches)
      .onConflictDoUpdate({
        target: ghlAppointmentMatches.appointmentId,
        set: {
          leadId: sql`excluded."leadId"`,
          status: sql`excluded."status"`,
          method: sql`excluded."method"`,
          candidateCount: sql`excluded."candidateCount"`,
          matchedAt: now,
        },
      });
    return { appointmentCount: input.events.length, matchedAppointmentCount };
  });
}
