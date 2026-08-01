import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import {
  clients,
  ghlAppointments,
  ghlContacts,
  ghlOpportunities,
  globalSalespersonIdentities,
  ghlOpportunityMatches,
  integrationMappings,
  leads,
  salespeople,
  sourceAccounts,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import { processGhlLocationSyncChunk } from "~/server/ghl/sync";

const clientSlug = "ghl-sync-test-client";
let clientId = "";

function opportunity(input: {
  id: string;
  wonAt: string;
  createdAt?: string;
  tags?: string[];
  contactTags?: string[];
  source?: string;
}) {
  return {
    id: input.id,
    locationId: "test-location",
    contactId: "contact-1",
    status: "won",
    name: "Won opportunity",
    pipelineId: "pipeline-1",
    pipelineStageId: "won-stage",
    monetaryValue: 450,
    currency: "USD",
    source: input.source,
    tags: input.tags,
    createdAt: input.createdAt ?? input.wonAt,
    lastStatusChangeAt: input.wonAt,
    updatedAt: input.wonAt,
    contact: {
      id: "contact-1",
      name: "Matched Customer",
      email: "matched@example.com",
      phone: null,
      tags: input.contactTags,
    },
  };
}

function clientReturning(rows: unknown[]) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation((request) => {
    const url = new URL(
      request instanceof URL
        ? request.href
        : typeof request === "string"
          ? request
          : request.url,
    );
    return Promise.resolve(
      url.pathname.startsWith("/locations/")
        ? Response.json({
            location: {
              id: "test-location",
              timezone: "America/New_York",
            },
          })
        : url.pathname === "/calendars/"
          ? Response.json({ calendars: [] })
          : url.pathname === "/users/"
            ? Response.json({ users: [] })
            : Response.json({ opportunities: rows, meta: {} }),
    );
  });
  return {
    client: new GhlClient(new URL("https://ghl.example"), fetcher),
    fetcher,
  };
}

async function syncGhlLocation(input: {
  client: GhlClient;
  clientId: string;
  locationId: string;
  token: string;
  runStartedAt: Date;
  onPage?: () => Promise<void>;
}) {
  let checkpoint: unknown = null;
  while (true) {
    const result = await processGhlLocationSyncChunk({
      ...input,
      checkpoint,
      onProgress: input.onPage,
    });
    if (result.done) return result.summary;
    checkpoint = result.checkpoint;
  }
}

describe("processGhlLocationSyncChunk", () => {
  beforeAll(async () => {
    const [client] = await db
      .insert(clients)
      .values({ slug: clientSlug, name: "GHL Sync Test Client" })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create GHL test client");
    clientId = client.id;
    const [source] = await db
      .insert(sourceAccounts)
      .values({
        clientId,
        dataProvider: "windsor",
        platform: "facebook",
        connector: "facebook_leads",
        connectorAccountId: "facebook_leads__ghl-sync-test",
        externalAccountId: "ghl-sync-test",
        externalAccountName: "GHL Sync Test",
        normalizedName: "ghl sync test",
      })
      .returning({ id: sourceAccounts.id });
    if (!source) throw new Error("Could not create GHL test source");
    await db.insert(leads).values({
      sourceAccountId: source.id,
      externalId: "matching-lead",
      occurredAt: new Date("2026-07-15T10:00:00.000Z"),
      fullName: "Matched Customer",
      email: "matched@example.com",
      rawPayload: {},
    });
  });

  afterAll(async () => {
    if (clientId) {
      await db
        .delete(integrationMappings)
        .where(eq(integrationMappings.clientId, clientId));
      await db
        .delete(sourceAccounts)
        .where(eq(sourceAccounts.clientId, clientId));
      await db.delete(clients).where(eq(clients.id, clientId));
    }
  });

  it("backfills first sync, then idempotently matches later wins", async () => {
    const firstStartedAt = new Date("2026-07-15T10:02:00.000Z");
    const first = clientReturning([
      opportunity({ id: "historical-win", wonAt: "2026-07-15T09:00:00.000Z" }),
      ...Array.from({ length: 99 }, (_, index) =>
        opportunity({
          id: `historical-win-${index + 2}`,
          wonAt: "2026-07-15T09:30:00.000Z",
        }),
      ),
    ]);
    const firstSummary = await syncGhlLocation({
      client: first.client,
      clientId,
      locationId: "test-location",
      token: "test-token",
      runStartedAt: firstStartedAt,
    });
    expect(first.fetcher).toHaveBeenCalledTimes(4);
    expect(firstSummary).toMatchObject({
      contactRowCount: 100,
      opportunityRowCount: 100,
      matchedOpportunityCount: 0,
    });

    const secondStartedAt = new Date("2026-07-15T10:10:00.000Z");
    const second = clientReturning([
      opportunity({
        id: "new-win",
        createdAt: "2026-07-15T10:01:00.000Z",
        wonAt: "2026-07-15T10:05:00.000Z",
        tags: [" Premium ", "premium", ""],
        contactTags: ["Qualified", " qualified "],
        source: " Facebook ",
      }),
      opportunity({ id: "historical-win", wonAt: "2026-07-15T09:00:00.000Z" }),
    ]);
    const secondSummary = await syncGhlLocation({
      client: second.client,
      clientId,
      locationId: "test-location",
      token: "test-token",
      runStartedAt: secondStartedAt,
    });
    expect(secondSummary).toMatchObject({
      contactRowCount: 1,
      opportunityRowCount: 1,
      matchedOpportunityCount: 1,
    });

    await syncGhlLocation({
      client: second.client,
      clientId,
      locationId: "test-location",
      token: "test-token",
      runStartedAt: secondStartedAt,
    });
    const [counts] = await db
      .select({
        contacts: sql<number>`count(distinct ${ghlContacts.id})::int`,
        opportunities: sql<number>`count(distinct ${ghlOpportunities.id})::int`,
        matches: sql<number>`count(distinct ${ghlOpportunityMatches.opportunityId})::int`,
      })
      .from(integrationMappings)
      .leftJoin(
        ghlContacts,
        eq(ghlContacts.integrationMappingId, integrationMappings.id),
      )
      .leftJoin(
        ghlOpportunities,
        eq(ghlOpportunities.integrationMappingId, integrationMappings.id),
      )
      .leftJoin(
        ghlOpportunityMatches,
        eq(ghlOpportunityMatches.opportunityId, ghlOpportunities.id),
      )
      .where(
        and(
          eq(integrationMappings.clientId, clientId),
          eq(integrationMappings.provider, "ghl"),
        ),
      );
    expect(counts).toEqual({ contacts: 1, opportunities: 101, matches: 101 });
    const [storedOpportunity] = await db
      .select({
        contactTags: ghlContacts.tags,
        opportunityTags: ghlOpportunities.tags,
        source: ghlOpportunities.source,
        rawPayload: ghlOpportunities.rawPayload,
        wonAt: ghlOpportunities.wonAt,
      })
      .from(ghlOpportunities)
      .innerJoin(ghlContacts, eq(ghlOpportunities.contactId, ghlContacts.id))
      .innerJoin(
        integrationMappings,
        eq(ghlOpportunities.integrationMappingId, integrationMappings.id),
      )
      .where(
        and(
          eq(integrationMappings.clientId, clientId),
          eq(ghlOpportunities.externalId, "new-win"),
        ),
      );
    expect(storedOpportunity).toBeDefined();
    expect(storedOpportunity?.contactTags).toEqual(["Qualified"]);
    expect(storedOpportunity?.opportunityTags).toEqual([
      "Premium",
      "Qualified",
    ]);
    expect(storedOpportunity?.source).toBe("Facebook");
    expect(storedOpportunity?.rawPayload).toMatchObject({ source: "Facebook" });
    expect(storedOpportunity?.wonAt).toEqual(
      new Date("2026-07-15T10:01:00.000Z"),
    );

    const [mapping] = await db
      .select({
        syncFromAt: integrationMappings.syncFromAt,
        lastSuccessfulSyncAt: integrationMappings.lastSuccessfulSyncAt,
        timezone: integrationMappings.timezone,
      })
      .from(integrationMappings)
      .where(eq(integrationMappings.clientId, clientId));
    expect(mapping?.syncFromAt).toEqual(new Date(0));
    expect(mapping?.lastSuccessfulSyncAt).toEqual(secondStartedAt);
    expect(mapping?.timezone).toBe("America/New_York");
  });

  it("does not advance the watermark after a provider validation failure", async () => {
    const [before] = await db
      .select({ value: integrationMappings.lastSuccessfulSyncAt })
      .from(integrationMappings)
      .where(eq(integrationMappings.clientId, clientId));
    const failed = clientReturning([{ id: "invalid" }]);
    await expect(
      syncGhlLocation({
        client: failed.client,
        clientId,
        locationId: "test-location",
        token: "test-token",
        runStartedAt: new Date("2026-07-15T10:20:00.000Z"),
      }),
    ).rejects.toThrow();
    const [after] = await db
      .select({ value: integrationMappings.lastSuccessfulSyncAt })
      .from(integrationMappings)
      .where(eq(integrationMappings.clientId, clientId));
    expect(after?.value).toEqual(before?.value);
  });

  it("checkpoints calendar windows and bounds concurrent contact requests", async () => {
    const events = Array.from({ length: 25 }, (_, index) => ({
      id: `batched-event-${index + 1}`,
      locationId: "test-location",
      calendarId: "calendar-1",
      contactId: `batched-contact-${index + 1}`,
      appointmentStatus: "confirmed",
      startTime: "2026-07-16T14:00:00.000Z",
      endTime: "2026-07-16T15:00:00.000Z",
      dateAdded: "2026-07-15T12:00:00.000Z",
      dateUpdated: "2026-07-15T12:00:00.000Z",
      title: `Batched appointment ${index + 1}`,
      description: `NC299 package ${index + 1}`,
      notes: "Booked after consultation",
      assignedUserId: `salesperson-${(index % 2) + 1}`,
      createdBy: {
        source: "contactdetails_page",
        userId: `salesperson-${(index % 2) + 1}`,
      },
      deleted: false,
    }));
    let calendarPageCount = 0;
    let activeCalendarRequests = 0;
    let maximumCalendarConcurrency = 0;
    let activeContactRequests = 0;
    let maximumContactConcurrency = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (request) => {
        const url = new URL(
          request instanceof URL
            ? request.href
            : typeof request === "string"
              ? request
              : request.url,
        );
        if (url.pathname.startsWith("/locations/")) {
          return Response.json({
            location: {
              id: "test-location",
              timezone: "America/New_York",
            },
          });
        }
        if (url.pathname === "/opportunities/search") {
          return Response.json({ opportunities: [], meta: {} });
        }
        if (url.pathname === "/calendars/") {
          return Response.json({
            calendars: [
              {
                id: "calendar-1",
                locationId: "test-location",
                name: "Main calendar",
                isActive: true,
              },
            ],
          });
        }
        if (url.pathname === "/users/") {
          return Response.json({
            users: [
              { id: "salesperson-1", name: "Salesperson One" },
              {
                id: "salesperson-2",
                firstName: "Salesperson",
                lastName: "Two",
              },
            ],
          });
        }
        if (url.pathname === "/calendars/events") {
          const pageEvents = calendarPageCount === 0 ? events : [];
          calendarPageCount += 1;
          activeCalendarRequests += 1;
          maximumCalendarConcurrency = Math.max(
            maximumCalendarConcurrency,
            activeCalendarRequests,
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
          activeCalendarRequests -= 1;
          return Response.json({ events: pageEvents });
        }
        if (url.pathname.startsWith("/contacts/")) {
          const contactId = decodeURIComponent(url.pathname.split("/").at(-1)!);
          activeContactRequests += 1;
          maximumContactConcurrency = Math.max(
            maximumContactConcurrency,
            activeContactRequests,
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
          activeContactRequests -= 1;
          return Response.json({
            contact: {
              id: contactId,
              firstName: "Contact",
              lastName: contactId,
              email: `${contactId}@example.com`,
              phone: null,
              tags: [],
              source: "Facebook",
              attributionSource: null,
              lastAttributionSource: null,
              dateAdded: "2026-07-15T12:00:00.000Z",
              dateUpdated: "2026-07-15T12:00:00.000Z",
            },
          });
        }
        throw new Error(`Unexpected GHL test request: ${url.pathname}`);
      });
    const onPage = vi.fn(() => Promise.resolve());

    const summary = await syncGhlLocation({
      client: new GhlClient(new URL("https://ghl.example"), fetcher),
      clientId,
      locationId: "test-location",
      token: "test-token",
      runStartedAt: new Date("2026-07-15T10:30:00.000Z"),
      onPage,
    });

    expect(summary).toMatchObject({
      contactRowCount: 25,
      appointmentRowCount: 25,
      matchedAppointmentCount: 0,
    });
    expect(maximumCalendarConcurrency).toBe(1);
    expect(maximumContactConcurrency).toBe(20);
    expect(onPage).toHaveBeenCalledTimes(42);

    const [storedAppointment] = await db
      .select({
        contactName: ghlContacts.fullName,
        description: ghlAppointments.description,
        notes: ghlAppointments.notes,
        assignedUserExternalId: ghlAppointments.assignedUserExternalId,
        createdByUserExternalId: ghlAppointments.createdByUserExternalId,
        createdBySource: ghlAppointments.createdBySource,
        rawPayload: ghlAppointments.rawPayload,
      })
      .from(ghlAppointments)
      .innerJoin(ghlContacts, eq(ghlAppointments.contactId, ghlContacts.id))
      .innerJoin(
        integrationMappings,
        eq(ghlAppointments.integrationMappingId, integrationMappings.id),
      )
      .where(
        and(
          eq(integrationMappings.clientId, clientId),
          eq(ghlAppointments.externalId, "batched-event-1"),
        ),
      );
    expect(storedAppointment).toMatchObject({
      contactName: "Contact batched-contact-1",
      description: "NC299 package 1",
      notes: "Booked after consultation",
      assignedUserExternalId: "salesperson-1",
      createdByUserExternalId: "salesperson-1",
      createdBySource: "contactdetails_page",
      rawPayload: {
        description: "NC299 package 1",
        createdBy: { userId: "salesperson-1" },
      },
    });
    const observedSalespeople = await db
      .select({
        externalUserId: salespeople.externalUserId,
        providerName: salespeople.providerName,
      })
      .from(salespeople)
      .where(eq(salespeople.clientId, clientId));
    expect(
      observedSalespeople
        .map((row) => [row.externalUserId, row.providerName] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ).toEqual([
      ["salesperson-1", "Salesperson One"],
      ["salesperson-2", "Salesperson Two"],
    ]);
    const globalIdentities = await db
      .select({
        externalUserId: globalSalespersonIdentities.externalUserId,
        globalSalespersonId: globalSalespersonIdentities.globalSalespersonId,
      })
      .from(globalSalespersonIdentities)
      .where(eq(globalSalespersonIdentities.provider, "ghl"));
    expect(
      globalIdentities.filter((identity) =>
        ["salesperson-1", "salesperson-2"].includes(identity.externalUserId),
      ),
    ).toHaveLength(2);
  });
});
