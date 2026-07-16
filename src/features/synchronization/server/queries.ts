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
    .select()
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
