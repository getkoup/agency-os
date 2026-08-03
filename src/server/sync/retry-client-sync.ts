import "server-only";

import { and, eq, gt, ne } from "drizzle-orm";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clients,
  syncRuns,
} from "~/server/db/schema";
import { getSyncRun } from "~/server/sync/sync-run";
import { SyncAlreadyRunningError } from "~/server/sync/synchronization-queue";

export class FailedClientSyncTargetsNotFoundError extends Error {
  constructor() {
    super("No failed synchronization targets were found for this client");
    this.name = "FailedClientSyncTargetsNotFoundError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function retryClientSync(input: {
  clientId: string;
  requestedByUserId: string;
  sourceRunId: string;
}) {
  const [sourceRun] = await db
    .select({
      mode: allClientSyncRuns.mode,
      startedAt: allClientSyncRuns.startedAt,
    })
    .from(allClientSyncRuns)
    .where(eq(allClientSyncRuns.id, input.sourceRunId));
  if (!sourceRun) throw new FailedClientSyncTargetsNotFoundError();

  const [failedTargets, newerTargets] = await Promise.all([
    db
      .select({
        checkpoint: allClientSyncTargets.checkpoint,
        clientId: allClientSyncTargets.clientId,
        clientName: allClientSyncTargets.clientName,
        clientSlug: allClientSyncTargets.clientSlug,
        contactRowCount: allClientSyncTargets.contactRowCount,
        integrationMappingId: allClientSyncTargets.integrationMappingId,
        matchedOpportunityCount: allClientSyncTargets.matchedOpportunityCount,
        opportunityRowCount: allClientSyncTargets.opportunityRowCount,
        provider: allClientSyncTargets.provider,
        sourceAccountCount: allClientSyncTargets.sourceAccountCount,
      })
      .from(allClientSyncTargets)
      .innerJoin(
        clients,
        and(
          eq(clients.id, allClientSyncTargets.clientId),
          eq(clients.status, "active"),
        ),
      )
      .where(
        and(
          eq(allClientSyncTargets.runId, input.sourceRunId),
          eq(allClientSyncTargets.clientId, input.clientId),
          eq(allClientSyncTargets.status, "failed"),
        ),
      ),
    db
      .select({ id: allClientSyncTargets.id })
      .from(allClientSyncTargets)
      .innerJoin(
        allClientSyncRuns,
        eq(allClientSyncRuns.id, allClientSyncTargets.runId),
      )
      .where(
        and(
          eq(allClientSyncTargets.clientId, input.clientId),
          ne(allClientSyncRuns.id, input.sourceRunId),
          gt(allClientSyncRuns.startedAt, sourceRun.startedAt),
        ),
      )
      .limit(1),
  ]);
  if (failedTargets.length === 0 || newerTargets.length > 0) {
    throw new FailedClientSyncTargetsNotFoundError();
  }

  const startedAt = new Date();

  let runId: string;
  try {
    runId = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(allClientSyncRuns)
        .values({
          requestedByUserId: input.requestedByUserId,
          requestedClientId: input.clientId,
          mode: sourceRun.mode,
          scope: "client",
          trigger: "retry",
          startedAt,
          heartbeatAt: startedAt,
          discoveredAccountCount: failedTargets.reduce(
            (sum, target) => sum + target.sourceAccountCount,
            0,
          ),
        })
        .returning({ id: allClientSyncRuns.id });
      if (!run) throw new Error("Could not create client retry run");

      if (failedTargets.some(({ provider }) => provider === "windsor")) {
        const [windsorRun] = await tx
          .insert(syncRuns)
          .values({ dataProvider: "windsor", startedAt })
          .returning({ id: syncRuns.id });
        if (!windsorRun) {
          throw new Error("Could not create Windsor client retry run");
        }
        await tx
          .update(allClientSyncRuns)
          .set({ windsorSyncRunId: windsorRun.id })
          .where(eq(allClientSyncRuns.id, run.id));
      }

      await tx.insert(allClientSyncTargets).values(
        failedTargets.map((target) => ({
          runId: run.id,
          clientId: target.clientId,
          integrationMappingId: target.integrationMappingId,
          clientSlug: target.clientSlug,
          clientName: target.clientName,
          provider: target.provider,
          priority: 20,
          status: "pending" as const,
          startedAt,
          heartbeatAt: startedAt,
          availableAt: startedAt,
          checkpoint: target.checkpoint,
          sourceAccountCount: target.sourceAccountCount,
          contactRowCount: target.checkpoint ? target.contactRowCount : 0,
          opportunityRowCount: target.checkpoint
            ? target.opportunityRowCount
            : 0,
          matchedOpportunityCount: target.checkpoint
            ? target.matchedOpportunityCount
            : 0,
        })),
      );
      return run.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new SyncAlreadyRunningError();
    throw error;
  }

  return getSyncRun(runId);
}
