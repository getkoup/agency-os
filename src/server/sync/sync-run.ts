import "server-only";

import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";

import { db } from "~/server/db";
import { allClientSyncRuns, allClientSyncTargets } from "~/server/db/schema";

export async function recoverExpiredTargetLeases(now: Date): Promise<number> {
  const recovered = await db
    .update(allClientSyncTargets)
    .set({
      status: "pending",
      heartbeatAt: now,
      availableAt: now,
      leaseExpiresAt: null,
      leaseToken: null,
      errorMessage: "Worker lease expired; synchronization resumed",
    })
    .where(
      and(
        eq(allClientSyncTargets.status, "running"),
        isNotNull(allClientSyncTargets.leaseExpiresAt),
        lte(allClientSyncTargets.leaseExpiresAt, now),
      ),
    )
    .returning({ runId: allClientSyncTargets.runId });
  if (recovered.length === 0) return 0;
  await db
    .update(allClientSyncRuns)
    .set({ heartbeatAt: now, workerLeaseExpiresAt: null })
    .where(
      inArray(allClientSyncRuns.id, [
        ...new Set(recovered.map(({ runId }) => runId)),
      ]),
    );
  return recovered.length;
}

export async function getSyncRun(runId: string) {
  const [run] = await db
    .select({
      id: allClientSyncRuns.id,
      requestedByUserId: allClientSyncRuns.requestedByUserId,
      requestedClientId: allClientSyncRuns.requestedClientId,
      mode: allClientSyncRuns.mode,
      scope: allClientSyncRuns.scope,
      trigger: allClientSyncRuns.trigger,
      status: allClientSyncRuns.status,
      startedAt: allClientSyncRuns.startedAt,
      heartbeatAt: allClientSyncRuns.heartbeatAt,
      completedAt: allClientSyncRuns.completedAt,
      windsorSyncRunId: allClientSyncRuns.windsorSyncRunId,
      discoveredAccountCount: allClientSyncRuns.discoveredAccountCount,
      performanceRowCount: allClientSyncRuns.performanceRowCount,
      leadRowCount: allClientSyncRuns.leadRowCount,
      contactRowCount: allClientSyncRuns.contactRowCount,
      opportunityRowCount: allClientSyncRuns.opportunityRowCount,
      matchedOpportunityCount: allClientSyncRuns.matchedOpportunityCount,
      errorMessage: allClientSyncRuns.errorMessage,
    })
    .from(allClientSyncRuns)
    .where(eq(allClientSyncRuns.id, runId));
  if (!run) throw new Error("Queued synchronization run disappeared");
  const targets = await db
    .select({
      id: allClientSyncTargets.id,
      runId: allClientSyncTargets.runId,
      clientId: allClientSyncTargets.clientId,
      integrationMappingId: allClientSyncTargets.integrationMappingId,
      clientSlug: allClientSyncTargets.clientSlug,
      clientName: allClientSyncTargets.clientName,
      provider: allClientSyncTargets.provider,
      priority: allClientSyncTargets.priority,
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
    .where(eq(allClientSyncTargets.runId, runId))
    .orderBy(
      asc(allClientSyncTargets.startedAt),
      asc(allClientSyncTargets.clientName),
    );
  return { ...run, targets };
}
