import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  syncRuns,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import { loadStoredGhlConfig } from "~/server/ghl/configuration";
import type { GhlConfig } from "~/server/ghl/env";
import {
  type GhlSyncCheckpoint,
  processGhlLocationSyncChunk,
} from "~/server/ghl/sync";
import { WindsorClient } from "~/server/windsor/client";
import { syncWindsorData, WindsorDataSyncError } from "~/server/windsor/sync";

const TARGET_LEASE_MS = 6 * 60 * 1000;
const WORKER_LEASE_MS = 6 * 60 * 1000;
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

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}

function isPermanentProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /status (400|401|403|404|409|422)\b/.test(error.message);
}

async function acquireWorkerLease(input: {
  now: Date;
  runId?: string;
}): Promise<string | null> {
  const [candidate] = await db
    .select({ id: allClientSyncRuns.id })
    .from(allClientSyncRuns)
    .innerJoin(
      allClientSyncTargets,
      eq(allClientSyncTargets.runId, allClientSyncRuns.id),
    )
    .where(
      and(
        eq(allClientSyncRuns.status, "running"),
        input.runId ? eq(allClientSyncRuns.id, input.runId) : undefined,
        or(
          isNull(allClientSyncRuns.workerLeaseExpiresAt),
          lte(allClientSyncRuns.workerLeaseExpiresAt, input.now),
        ),
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
    .orderBy(asc(allClientSyncRuns.startedAt))
    .limit(1);
  if (!candidate) return null;

  const [leased] = await db
    .update(allClientSyncRuns)
    .set({
      heartbeatAt: input.now,
      workerLeaseExpiresAt: new Date(input.now.getTime() + WORKER_LEASE_MS),
    })
    .where(
      and(
        eq(allClientSyncRuns.id, candidate.id),
        eq(allClientSyncRuns.status, "running"),
        or(
          isNull(allClientSyncRuns.workerLeaseExpiresAt),
          lte(allClientSyncRuns.workerLeaseExpiresAt, input.now),
        ),
      ),
    )
    .returning({ id: allClientSyncRuns.id });
  return leased?.id ?? null;
}

async function releaseWorkerLease(runId: string) {
  await db
    .update(allClientSyncRuns)
    .set({ workerLeaseExpiresAt: null })
    .where(eq(allClientSyncRuns.id, runId));
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
        asc(allClientSyncTargets.availableAt),
        asc(allClientSyncTargets.startedAt),
        asc(allClientSyncTargets.clientName),
      )
      .limit(input.limit)
      .for("update", { of: allClientSyncTargets, skipLocked: true });
    if (candidates.length === 0) return [];

    return tx
      .update(allClientSyncTargets)
      .set({
        status: "running",
        heartbeatAt: input.now,
        leaseExpiresAt: new Date(input.now.getTime() + TARGET_LEASE_MS),
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
        sourceAccountCount: allClientSyncTargets.sourceAccountCount,
      });
  });
}

async function heartbeatTarget(
  target: Pick<ClaimedTarget, "id" | "runId">,
  now: Date,
) {
  await db.transaction(async (tx) => {
    await tx
      .update(allClientSyncTargets)
      .set({
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + TARGET_LEASE_MS),
      })
      .where(
        and(
          eq(allClientSyncTargets.id, target.id),
          eq(allClientSyncTargets.status, "running"),
        ),
      );
    await tx
      .update(allClientSyncRuns)
      .set({
        heartbeatAt: now,
        workerLeaseExpiresAt: new Date(now.getTime() + WORKER_LEASE_MS),
      })
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

async function requeueTarget(input: {
  target: ClaimedTarget;
  checkpoint: GhlSyncCheckpoint;
  now: Date;
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(allClientSyncTargets)
      .set({
        status: "pending",
        heartbeatAt: input.now,
        availableAt: input.now,
        leaseExpiresAt: null,
        failureCount: 0,
        checkpoint: input.checkpoint,
        ...checkpointTargetProgress(input.checkpoint),
        errorMessage: null,
      })
      .where(eq(allClientSyncTargets.id, input.target.id));
    await tx
      .update(allClientSyncRuns)
      .set({
        heartbeatAt: input.now,
        workerLeaseExpiresAt: new Date(input.now.getTime() + WORKER_LEASE_MS),
      })
      .where(eq(allClientSyncRuns.id, input.target.runId));
  });
}

async function finishTarget(input: {
  target: ClaimedTarget;
  now: Date;
  values: Partial<typeof allClientSyncTargets.$inferInsert>;
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(allClientSyncTargets)
      .set({
        ...input.values,
        status: "succeeded",
        completedAt: input.now,
        heartbeatAt: input.now,
        leaseExpiresAt: null,
        failureCount: 0,
        errorMessage: null,
      })
      .where(eq(allClientSyncTargets.id, input.target.id));
    await tx
      .update(allClientSyncRuns)
      .set({
        heartbeatAt: input.now,
        workerLeaseExpiresAt: new Date(input.now.getTime() + WORKER_LEASE_MS),
      })
      .where(eq(allClientSyncRuns.id, input.target.runId));
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
    await tx
      .update(allClientSyncTargets)
      .set(
        failedPermanently
          ? {
              status: "failed",
              completedAt: input.now,
              heartbeatAt: input.now,
              leaseExpiresAt: null,
              failureCount,
              errorMessage,
            }
          : {
              status: "pending",
              heartbeatAt: input.now,
              availableAt: new Date(input.now.getTime() + retryDelayMs),
              leaseExpiresAt: null,
              failureCount,
              errorMessage: `Retry ${failureCount}/${MAX_TARGET_FAILURES}: ${errorMessage}`,
            },
      )
      .where(eq(allClientSyncTargets.id, input.target.id));
    await tx
      .update(allClientSyncRuns)
      .set({
        heartbeatAt: input.now,
        workerLeaseExpiresAt: new Date(input.now.getTime() + WORKER_LEASE_MS),
      })
      .where(eq(allClientSyncRuns.id, input.target.runId));
  });
}

async function processWindsorTarget(input: {
  target: ClaimedTarget;
  client: WindsorClient;
  now: Date;
}) {
  if (!input.target.clientId) {
    throw new Error("Windsor synchronization target has no client");
  }
  try {
    const summary = await syncWindsorData(input.client, {
      kind: "client",
      clientId: input.target.clientId,
    });
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
        .where(eq(allClientSyncTargets.id, input.target.id));
    }
    throw error;
  }
}

async function processGhlTarget(input: {
  target: ClaimedTarget;
  client: GhlClient;
  config: GhlConfig;
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
      .select({ startedAt: allClientSyncRuns.startedAt })
      .from(allClientSyncRuns)
      .where(eq(allClientSyncRuns.id, input.target.runId));
    if (!run) throw new Error("Synchronization run disappeared");
    if (input.target.provider === "windsor") {
      await processWindsorTarget({
        target: input.target,
        client: input.windsorClient,
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

  await finalizeReadyRuns(input.runId, now());
  const leasedRunId = await acquireWorkerLease({
    now: now(),
    runId: input.runId,
  });
  if (!leasedRunId) return { processedChunkCount: 0 };

  let processedChunkCount = 0;
  try {
    const startedAt = now();
    const windsorClient = dependencies.windsorClient ?? new WindsorClient();
    const ghlConfig = dependencies.ghlConfig ?? (await loadStoredGhlConfig());
    const ghlClient =
      dependencies.ghlClient ?? new GhlClient(ghlConfig.baseUrl);

    while (
      processedChunkCount < maxChunks &&
      now().getTime() - startedAt.getTime() < timeBudgetMs
    ) {
      const remainingChunks = maxChunks - processedChunkCount;
      const targets = await claimTargets({
        limit: Math.min(concurrency, remainingChunks),
        now: now(),
        runId: leasedRunId,
      });
      if (targets.length === 0) break;
      await Promise.all(
        targets.map((target) =>
          processTarget({
            target,
            ghlClient,
            ghlConfig,
            now,
            windsorClient,
          }),
        ),
      );
      processedChunkCount += targets.length;
      await finalizeRunIfReady(leasedRunId, now());
    }
    await finalizeRunIfReady(leasedRunId, now());
    return { processedChunkCount };
  } finally {
    await releaseWorkerLease(leasedRunId);
  }
}
