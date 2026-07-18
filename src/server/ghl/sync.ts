import "server-only";

import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { integrationMappings } from "~/server/db/schema";
import type { GhlClient } from "~/server/ghl/client";
import { upsertGhlOpportunityPage } from "~/server/ghl/persistence";

const REPLAY_OVERLAP_MS = 5 * 60 * 1000;

export interface GhlSyncSummary {
  contactRowCount: number;
  opportunityRowCount: number;
  matchedOpportunityCount: number;
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
    const pageSummary = await upsertGhlOpportunityPage({
      mappingId: mapping.id,
      clientId: input.clientId,
      rows: page,
    });
    summary.contactRowCount += pageSummary.contactRowCount;
    summary.opportunityRowCount += pageSummary.opportunityRowCount;
    summary.matchedOpportunityCount += pageSummary.matchedOpportunityCount;
  }
  await db
    .update(integrationMappings)
    .set({ lastSuccessfulSyncAt: input.runStartedAt, updatedAt: new Date() })
    .where(eq(integrationMappings.id, mapping.id));
  return { mappingId: mapping.id, ...summary };
}
