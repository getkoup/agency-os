import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import {
  clients,
  ghlContacts,
  ghlOpportunities,
  ghlOpportunityMatches,
  integrationMappings,
  leads,
  sourceAccounts,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import { syncGhlLocation } from "~/server/ghl/sync";

const clientSlug = "ghl-sync-test-client";
let clientId = "";

function opportunity(input: { id: string; wonAt: string }) {
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
    lastStatusChangeAt: input.wonAt,
    updatedAt: input.wonAt,
    contact: {
      id: "contact-1",
      name: "Matched Customer",
      email: "matched@example.com",
      phone: null,
    },
  };
}

function clientReturning(rows: unknown[]) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(() =>
      Promise.resolve(Response.json({ opportunities: rows, meta: {} })),
    );
  return {
    client: new GhlClient(new URL("https://ghl.example"), fetcher),
    fetcher,
  };
}

describe("syncGhlLocation", () => {
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

  it("establishes a no-backfill cutoff, then idempotently matches later wins", async () => {
    const firstStartedAt = new Date("2026-07-15T10:02:00.000Z");
    const first = clientReturning([
      opportunity({ id: "historical-win", wonAt: "2026-07-15T09:00:00.000Z" }),
    ]);
    const firstSummary = await syncGhlLocation({
      client: first.client,
      clientId,
      locationId: "test-location",
      token: "test-token",
      runStartedAt: firstStartedAt,
    });
    expect(first.fetcher).toHaveBeenCalledOnce();
    expect(firstSummary.opportunityRowCount).toBe(0);

    const secondStartedAt = new Date("2026-07-15T10:10:00.000Z");
    const second = clientReturning([
      opportunity({ id: "new-win", wonAt: "2026-07-15T10:05:00.000Z" }),
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
    expect(counts).toEqual({ contacts: 1, opportunities: 1, matches: 1 });

    const [mapping] = await db
      .select({
        syncFromAt: integrationMappings.syncFromAt,
        lastSuccessfulSyncAt: integrationMappings.lastSuccessfulSyncAt,
      })
      .from(integrationMappings)
      .where(eq(integrationMappings.clientId, clientId));
    expect(mapping?.syncFromAt).toEqual(firstStartedAt);
    expect(mapping?.lastSuccessfulSyncAt).toEqual(secondStartedAt);
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
});
