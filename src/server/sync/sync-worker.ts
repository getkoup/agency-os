import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, lte, or } from "drizzle-orm";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clientSynchronizationStates,
  syncRuns,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import { loadStoredGhlConfig } from "~/server/ghl/configuration";
import type { GhlConfig } from "~/server/ghl/env";
import {
  type GhlSyncCheckpoint,
  processGhlLocationSyncChunk,
} from "~/server/ghl/sync";
import { type SynchronizationMode } from "~/server/sync/sync-mode";
import { recoverExpiredTargetLeases } from "~/server/sync/sync-run";
import { WindsorClient } from "~/server/windsor/client";
import { syncWindsorData, WindsorDataSyncError } from "~/server/windsor/sync";

const TARGET_LEASE_MS = 6 * 60 * 1000;
const DEFAULT_WORKER_BUDGET_MS = 4 * 60 * 1000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_CHUNKS = 1_000;
const MAX_TARGET_FAILURES = 3;
const RETRY_BASE_DELAY_MS = 30 * 1000;

type WorkerDependencies = {
  ghlClient?: GhlClient;
  ghlConfig?: GhlConfig;
  now?: () => Date;
  windsorClient?: WindsorClient;
};

type ClaimedTarget = Awaited<ReturnType<typeof claimTargets>>[number];

type TargetLease = Pick<ClaimedTarget, "id" | "leaseToken" | "runId">;

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}

function isPermanentProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /status (403|404|409|422)\b/.test(error.message);
}

async function claimTargets(input: {
  limit: number;
  now: Date;
  runId?: string;
}) {
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: allClientSyncTargets.id })
      .from(allClientSyncTargets)
      .innerJoin(
        allClientSyncRuns,
        eq(allClientSyncRuns.id, allClientSyncTargets.runId),
      )
      .where(
        and(
          eq(allClientSyncRuns.status, "running"),
          input.runId ? eq(allClientSyncRuns.id, input.runId) : undefined,
          or(
            and(
              eq(allClientSyncTargets.status, "pending"),
              lte(allClientSyncTargets.availableAt, input.now),
            ),
            and(
              eq(allClientSyncTargets.status, "running"),
              isNotNull(allClientSyncTargets.leaseExpiresAt),
              lte(allClientSyncTargets.leaseExpiresAt, input.now),
            ),
          ),
        ),
      )
      .orderBy(
        desc(allClientSyncTargets.priority),
        asc(allClientSyncTargets.availableAt),
        asc(allClientSyncTargets.startedAt),
        asc(allClientSyncTargets.clientName),
      )
      .limit(input.limit)
      .for("update", { of: allClientSyncTargets, skipLocked: true });
    if (candidates.length === 0) return [];

    const leaseToken = crypto.randomUUID();
    const claimed = await tx
      .update(allClientSyncTargets)
      .set({
        status: "running",
        heartbeatAt: input.now,
        leaseExpiresAt: new Date(input.now.getTime() + TARGET_LEASE_MS),
        leaseToken,
        errorMessage: null,
      })
      .where(
        inArray(
          allClientSyncTargets.id,
          candidates.map(({ id }) => id),
        ),
      )
      .returning({
        id: allClientSyncTargets.id,
        runId: allClientSyncTargets.runId,
        clientId: allClientSyncTargets.clientId,
        clientSlug: allClientSyncTargets.clientSlug,
        clientName: allClientSyncTargets.clientName,
        provider: allClientSyncTargets.provider,
        checkpoint: allClientSyncTargets.checkpoint,
        failureCount: allClientSyncTargets.failureCount,
        leaseToken: allClientSyncTargets.leaseToken,
        sourceAccountCount: allClientSyncTargets.sourceAccountCount,
      });
    return claimed.map((target) => {
      if (!target.leaseToken)
        throw new Error("Target lease token was not stored");
      return { ...target, leaseToken: target.leaseToken };
    });
  });
}

function targetLeaseCondition(target: TargetLease) {
  return and(
    eq(allClientSyncTargets.id, target.id),
    eq(allClientSyncTargets.status, "running"),
    eq(allClientSyncTargets.leaseToken, target.leaseToken),
  );
}

async function heartbeatTarget(target: TargetLease, now: Date) {
  await db.transaction(async (tx) => {
    const [heartbeated] = await tx
      .update(allClientSyncTargets)
      .set({
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + TARGET_LEASE_MS),
      })
      .where(targetLeaseCondition(target))
      .returning({ id: allClientSyncTargets.id });
    if (!heartbeated) throw new Error("Synchronization target lease was lost");
    await tx
      .update(allClientSyncRuns)
      .set({ heartbeatAt: now, workerLeaseExpiresAt: null })
      .where(
        and(
          eq(allClientSyncRuns.id, target.runId),
          eq(allClientSyncRuns.status, "running"),
        ),
      );
  });
}

function checkpointTargetProgress(
  checkpoint: GhlSyncCheckpoint,
): Partial<typeof allClientSyncTargets.$inferInsert> {
  if (checkpoint.phase === "initialize") return {};
  return {
    contactRowCount: checkpoint.progress.contactRowCount,
    opportunityRowCount: checkpoint.progress.appointmentRowCount,
    matchedOpportunityCount: checkpoint.progress.matchedAppointmentCount,
  };
}

async function recordTargetAttempt(target: ClaimedTarget, now: Date) {
  if (!target.clientId) return;
  await db
    .insert(clientSynchronizationStates)
    .values({
      clientId: target.clientId,
      provider: target.provider,
      lastAttemptAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        clientSynchronizationStates.clientId,
        clientSynchronizationStates.provider,
      ],
      set: { lastAttemptAt: now, updatedAt: now },
    });
}

async function requeueTarget(input: {
  target: ClaimedTarget;
  checkpoint: GhlSyncCheckpoint;
  now: Date;
}) {
  await db.transaction(async (tx) => {
    const [requeued] = await tx
      .update(allClientSyncTargets)
      .set({
        status: "pending",
        heartbeatAt: input.now,
        availableAt: input.now,
        leaseExpiresAt: null,
        leaseToken: null,
        failureCount: 0,
        checkpoint: input.checkpoint,
        ...checkpointTargetProgress(input.checkpoint),
        errorMessage: null,
      })
      .where(targetLeaseCondition(input.target))
      .returning({ id: allClientSyncTargets.id });
    if (!requeued) return;
    await tx
      .update(allClientSyncRuns)
      .set({ heartbeatAt: input.now, workerLeaseExpiresAt: null })
      .where(eq(allClientSyncRuns.id, input.target.runId));
  });
}

async function finishTarget(input: {
  target: ClaimedTarget;
  now: Date;
  values: Partial<typeof allClientSyncTargets.$inferInsert>;
}) {
  await db.transaction(async (tx) => {
    const [finished] = await tx
      .update(allClientSyncTargets)
      .set({
        ...input.values,
        status: "succeeded",
        completedAt: input.now,
        heartbeatAt: input.now,
        leaseExpiresAt: null,
        leaseToken: null,
        failureCount: 0,
        errorMessage: null,
      })
      .where(targetLeaseCondition(input.target))
      .returning({ id: allClientSyncTargets.id });
    if (!finished) return;
    await tx
      .update(allClientSyncRuns)
      .set({ heartbeatAt: input.now, workerLeaseExpiresAt: null })
      .where(eq(allClientSyncRuns.id, input.target.runId));
    if (input.target.clientId) {
      await tx
        .insert(clientSynchronizationStates)
        .values({
          clientId: input.target.clientId,
          provider: input.target.provider,
          lastAttemptAt: input.now,
          lastSucceededAt: input.now,
          lastErrorMessage: null,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [
            clientSynchronizationStates.clientId,
            clientSynchronizationStates.provider,
          ],
          set: {
            lastAttemptAt: input.now,
            lastSucceededAt: input.now,
            lastErrorMessage: null,
            updatedAt: input.now,
          },
        });
    }
  });
}

async function recordTargetFailure(input: {
  target: ClaimedTarget;
  error: unknown;
  now: Date;
}) {
  const failureCount = input.target.failureCount + 1;
  const errorMessage = safeError(input.error);
  const failedPermanently =
    failureCount >= MAX_TARGET_FAILURES ||
    isPermanentProviderError(input.error);
  const retryDelayMs = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, failureCount - 1);
  await db.transaction(async (tx) => {
    const [recorded] = await tx
      .update(allClientSyncTargets)
      .set(
        failedPermanently
          ? {
              status: "failed",
              completedAt: input.now,
              heartbeatAt: input.now,
              leaseExpiresAt: null,
              leaseToken: null,
              failureCount,
              errorMessage,
            }
          : {
              status: "pending",
              heartbeatAt: input.now,
              availableAt: new Date(input.now.getTime() + retryDelayMs),
              leaseExpiresAt: null,
              leaseToken: null,
              failureCount,
              errorMessage: `Retry ${failureCount}/${MAX_TARGET_FAILURES}: ${errorMessage}`,
            },
      )
      .where(targetLeaseCondition(input.target))
      .returning({ id: allClientSyncTargets.id });
    if (!recorded) return;
    await tx
      .update(allClientSyncRuns)
      .set({ heartbeatAt: input.now, workerLeaseExpiresAt: null })
      .where(eq(allClientSyncRuns.id, input.target.runId));
    if (failedPermanently && input.target.clientId) {
      await tx
        .insert(clientSynchronizationStates)
        .values({
          clientId: input.target.clientId,
          provider: input.target.provider,
          lastAttemptAt: input.now,
          lastFailedAt: input.now,
          lastErrorMessage: errorMessage,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [
            clientSynchronizationStates.clientId,
            clientSynchronizationStates.provider,
          ],
          set: {
            lastAttemptAt: input.now,
            lastFailedAt: input.now,
            lastErrorMessage: errorMessage,
            updatedAt: input.now,
          },
        });
    }
  });
}

async function processWindsorTarget(input: {
  target: ClaimedTarget;
  client: WindsorClient;
  mode: SynchronizationMode;
  now: Date;
}) {
  if (!input.target.clientId) {
    throw new Error("Windsor synchronization target has no client");
  }
  try {
    const summary = await syncWindsorData(
      input.client,
      {
        kind: "client",
        clientId: input.target.clientId,
      },
      input.mode,
    );
    await finishTarget({
      target: input.target,
      now: input.now,
      values: {
        sourceAccountCount: input.target.sourceAccountCount,
        ...summary,
      },
    });
  } catch (error) {
    if (error instanceof WindsorDataSyncError) {
      await db
        .update(allClientSyncTargets)
        .set(error.summary)
        .where(targetLeaseCondition(input.target));
    }
    throw error;
  }
}

async function processGhlTarget(input: {
  target: ClaimedTarget;
  client: GhlClient;
  config: GhlConfig;
  mode: SynchronizationMode;
  runStartedAt: Date;
  now: () => Date;
}) {
  if (!input.target.clientId) {
    throw new Error("GHL synchronization target has no client");
  }
  const mapping = input.config.mappings.find(
    ({ clientSlug }) => clientSlug === input.target.clientSlug,
  );
  if (!mapping) throw new Error("GHL configuration is no longer available");
  const result = await processGhlLocationSyncChunk({
    client: input.client,
    clientId: input.target.clientId,
    locationId: mapping.locationId,
    mode: input.mode,
    token: mapping.token,
    runStartedAt: input.runStartedAt,
    checkpoint: input.target.checkpoint,
    onProgress: () => heartbeatTarget(input.target, input.now()),
  });
  const now = input.now();
  if (!result.done) {
    await requeueTarget({
      target: input.target,
      checkpoint: result.checkpoint,
      now,
    });
    return;
  }
  await finishTarget({
    target: input.target,
    now,
    values: {
      integrationMappingId: result.summary.mappingId,
      contactRowCount: result.summary.contactRowCount,
      opportunityRowCount: result.summary.appointmentRowCount,
      matchedOpportunityCount: result.summary.matchedAppointmentCount,
      checkpoint: null,
    },
  });
}

async function processTarget(input: {
  target: ClaimedTarget;
  ghlClient: GhlClient;
  ghlConfig: GhlConfig;
  now: () => Date;
  windsorClient: WindsorClient;
}) {
  try {
    const [run] = await db
      .select({
        mode: allClientSyncRuns.mode,
        startedAt: allClientSyncRuns.startedAt,
      })
      .from(allClientSyncRuns)
      .where(eq(allClientSyncRuns.id, input.target.runId));
    if (!run) throw new Error("Synchronization run disappeared");
    await recordTargetAttempt(input.target, input.now());
    if (input.target.provider === "windsor") {
      await processWindsorTarget({
        target: input.target,
        client: input.windsorClient,
        mode: run.mode,
        now: input.now(),
      });
      return;
    }
    if (input.target.provider !== "ghl") {
      throw new Error(
        `Unsupported synchronization provider: ${input.target.provider}`,
      );
    }
    await processGhlTarget({
      target: input.target,
      client: input.ghlClient,
      config: input.ghlConfig,
      mode: run.mode,
      runStartedAt: run.startedAt,
      now: input.now,
    });
  } catch (error) {
    await recordTargetFailure({
      target: input.target,
      error,
      now: input.now(),
    });
  }
}

async function finalizeRunIfReady(runId: string, now: Date) {
  const [run] = await db
    .select()
    .from(allClientSyncRuns)
    .where(eq(allClientSyncRuns.id, runId));
  if (run?.status !== "running") return false;
  const targets = await db
    .select()
    .from(allClientSyncTargets)
    .where(eq(allClientSyncTargets.runId, runId));
  if (
    targets.some(({ status }) => status === "pending" || status === "running")
  ) {
    return false;
  }

  const totals = targets.reduce(
    (sum, target) => ({
      performanceRowCount: sum.performanceRowCount + target.performanceRowCount,
      leadRowCount: sum.leadRowCount + target.leadRowCount,
      contactRowCount: sum.contactRowCount + target.contactRowCount,
      opportunityRowCount: sum.opportunityRowCount + target.opportunityRowCount,
      matchedOpportunityCount:
        sum.matchedOpportunityCount + target.matchedOpportunityCount,
    }),
    {
      performanceRowCount: 0,
      leadRowCount: 0,
      contactRowCount: 0,
      opportunityRowCount: 0,
      matchedOpportunityCount: 0,
    },
  );
  const failed = targets.some(({ status }) => status === "failed");
  const windsorFailed = targets.some(
    ({ provider, status }) => provider === "windsor" && status === "failed",
  );
  await db.transaction(async (tx) => {
    if (run.windsorSyncRunId) {
      await tx
        .update(syncRuns)
        .set({
          status: windsorFailed ? "failed" : "succeeded",
          completedAt: now,
          discoveredAccountCount: run.discoveredAccountCount,
          performanceRowCount: totals.performanceRowCount,
          leadRowCount: totals.leadRowCount,
          errorMessage: windsorFailed
            ? "One or more Windsor targets failed"
            : null,
        })
        .where(eq(syncRuns.id, run.windsorSyncRunId));
    }
    await tx
      .update(allClientSyncRuns)
      .set({
        status: failed ? "failed" : "succeeded",
        completedAt: now,
        heartbeatAt: now,
        workerLeaseExpiresAt: null,
        ...totals,
        errorMessage: failed
          ? "One or more synchronization targets failed"
          : null,
      })
      .where(eq(allClientSyncRuns.id, runId));
  });
  return true;
}

async function finalizeReadyRuns(runId: string | undefined, now: Date) {
  const runs = await db
    .select({ id: allClientSyncRuns.id })
    .from(allClientSyncRuns)
    .where(
      and(
        eq(allClientSyncRuns.status, "running"),
        runId ? eq(allClientSyncRuns.id, runId) : undefined,
      ),
    );
  for (const run of runs) await finalizeRunIfReady(run.id, now);
}

export async function processPendingSyncTargets(
  input: {
    concurrency?: number;
    maxChunks?: number;
    runId?: string;
    timeBudgetMs?: number;
  } = {},
  dependencies: WorkerDependencies = {},
): Promise<{ processedChunkCount: number }> {
  const now = dependencies.now ?? (() => new Date());
  const concurrency = input.concurrency ?? DEFAULT_CONCURRENCY;
  const maxChunks = input.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const timeBudgetMs = input.timeBudgetMs ?? DEFAULT_WORKER_BUDGET_MS;

  await recoverExpiredTargetLeases(now());
  await finalizeReadyRuns(input.runId, now());

  const startedAt = now();
  let processedChunkCount = 0;
  let windsorClient: WindsorClient | null = null;
  let ghlConfig: GhlConfig | null = null;
  let ghlClient: GhlClient | null = null;

  while (
    processedChunkCount < maxChunks &&
    now().getTime() - startedAt.getTime() < timeBudgetMs
  ) {
    const remainingChunks = maxChunks - processedChunkCount;
    const targets = await claimTargets({
      limit: Math.min(concurrency, remainingChunks),
      now: now(),
      runId: input.runId,
    });
    if (targets.length === 0) break;
    const activeWindsorClient = (windsorClient ??=
      dependencies.windsorClient ?? new WindsorClient());
    const activeGhlConfig = (ghlConfig ??=
      dependencies.ghlConfig ?? (await loadStoredGhlConfig()));
    const activeGhlClient = (ghlClient ??=
      dependencies.ghlClient ?? new GhlClient(activeGhlConfig.baseUrl));
    await Promise.all(
      targets.map((target) =>
        processTarget({
          target,
          ghlClient: activeGhlClient,
          ghlConfig: activeGhlConfig,
          now,
          windsorClient: activeWindsorClient,
        }),
      ),
    );
    processedChunkCount += targets.length;
    for (const runId of new Set(targets.map(({ runId }) => runId))) {
      await finalizeRunIfReady(runId, now());
    }
  }
  if (input.runId) await finalizeRunIfReady(input.runId, now());
  return { processedChunkCount };
}
