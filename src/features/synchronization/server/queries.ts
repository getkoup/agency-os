import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  users,
} from "~/server/db/schema";

export async function getAllClientSyncRuns() {
  const runs = await db
    .select({
      id: allClientSyncRuns.id,
      status: allClientSyncRuns.status,
      startedAt: allClientSyncRuns.startedAt,
      heartbeatAt: allClientSyncRuns.heartbeatAt,
      completedAt: allClientSyncRuns.completedAt,
      requesterName: users.name,
      requesterEmail: users.email,
      discoveredAccountCount: allClientSyncRuns.discoveredAccountCount,
      performanceRowCount: allClientSyncRuns.performanceRowCount,
      leadRowCount: allClientSyncRuns.leadRowCount,
      contactRowCount: allClientSyncRuns.contactRowCount,
      opportunityRowCount: allClientSyncRuns.opportunityRowCount,
      matchedOpportunityCount: allClientSyncRuns.matchedOpportunityCount,
      errorMessage: allClientSyncRuns.errorMessage,
    })
    .from(allClientSyncRuns)
    .innerJoin(users, eq(users.id, allClientSyncRuns.requestedByUserId))
    .orderBy(desc(allClientSyncRuns.startedAt))
    .limit(25);
  if (runs.length === 0) return [];
  const targets = await db
    .select({
      id: allClientSyncTargets.id,
      runId: allClientSyncTargets.runId,
      clientId: allClientSyncTargets.clientId,
      integrationMappingId: allClientSyncTargets.integrationMappingId,
      clientSlug: allClientSyncTargets.clientSlug,
      clientName: allClientSyncTargets.clientName,
      provider: allClientSyncTargets.provider,
      status: allClientSyncTargets.status,
      startedAt: allClientSyncTargets.startedAt,
      completedAt: allClientSyncTargets.completedAt,
      sourceAccountCount: allClientSyncTargets.sourceAccountCount,
      performanceRowCount: allClientSyncTargets.performanceRowCount,
      leadRowCount: allClientSyncTargets.leadRowCount,
      contactRowCount: allClientSyncTargets.contactRowCount,
      opportunityRowCount: allClientSyncTargets.opportunityRowCount,
      matchedOpportunityCount: allClientSyncTargets.matchedOpportunityCount,
      errorMessage: allClientSyncTargets.errorMessage,
    })
    .from(allClientSyncTargets)
    .where(
      inArray(
        allClientSyncTargets.runId,
        runs.map(({ id }) => id),
      ),
    )
    .orderBy(allClientSyncTargets.startedAt, allClientSyncTargets.clientName);
  return runs.map((run) => ({
    ...run,
    targets: targets.filter((target) => target.runId === run.id),
  }));
}
