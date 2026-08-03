import { z } from "zod";

export interface SyncWorkerConfig {
  concurrency: number;
  errorRetryMs: number;
  idlePollMs: number;
  maxChunks: number;
  scheduleIntervalMs: number;
  timeBudgetMs: number;
}

interface ProcessTargetsInput {
  concurrency: number;
  maxChunks: number;
  timeBudgetMs: number;
}

interface SyncWorkerDependencies {
  log: (entry: Record<string, number | string>) => void;
  now?: () => Date;
  processTargets: (
    input: ProcessTargetsInput,
  ) => Promise<{ processedChunkCount: number }>;
  scheduleHourlySync?: () => Promise<{ id: string } | null>;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

const DEFAULT_CONFIG: SyncWorkerConfig = {
  concurrency: 4,
  errorRetryMs: 30_000,
  idlePollMs: 5_000,
  maxChunks: 1_000,
  scheduleIntervalMs: 5 * 60_000,
  timeBudgetMs: 4 * 60 * 1_000,
};

function integerEnvironmentValue(input: {
  defaultValue: number;
  maximum: number;
  minimum: number;
}) {
  return z.preprocess(
    (value) =>
      value === undefined || value === "" ? input.defaultValue : value,
    z.coerce.number().int().min(input.minimum).max(input.maximum),
  );
}

const workerEnvironmentSchema = z.object({
  SYNC_WORKER_CONCURRENCY: integerEnvironmentValue({
    defaultValue: DEFAULT_CONFIG.concurrency,
    minimum: 1,
    maximum: 16,
  }),
  SYNC_WORKER_ERROR_RETRY_MS: integerEnvironmentValue({
    defaultValue: DEFAULT_CONFIG.errorRetryMs,
    minimum: 1_000,
    maximum: 10 * 60 * 1_000,
  }),
  SYNC_WORKER_IDLE_POLL_MS: integerEnvironmentValue({
    defaultValue: DEFAULT_CONFIG.idlePollMs,
    minimum: 1_000,
    maximum: 10 * 60 * 1_000,
  }),
  SYNC_WORKER_MAX_CHUNKS: integerEnvironmentValue({
    defaultValue: DEFAULT_CONFIG.maxChunks,
    minimum: 1,
    maximum: 10_000,
  }),
  SYNC_WORKER_SCHEDULE_INTERVAL_MS: integerEnvironmentValue({
    defaultValue: DEFAULT_CONFIG.scheduleIntervalMs,
    minimum: 10_000,
    maximum: 10 * 60 * 1_000,
  }),
  SYNC_WORKER_TIME_BUDGET_MS: integerEnvironmentValue({
    defaultValue: DEFAULT_CONFIG.timeBudgetMs,
    minimum: 1_000,
    maximum: 10 * 60 * 1_000,
  }),
});

export function parseSyncWorkerConfig(
  environment: Record<string, string | undefined>,
): SyncWorkerConfig {
  const parsed = workerEnvironmentSchema.parse(environment);
  return {
    concurrency: parsed.SYNC_WORKER_CONCURRENCY,
    errorRetryMs: parsed.SYNC_WORKER_ERROR_RETRY_MS,
    idlePollMs: parsed.SYNC_WORKER_IDLE_POLL_MS,
    maxChunks: parsed.SYNC_WORKER_MAX_CHUNKS,
    scheduleIntervalMs: parsed.SYNC_WORKER_SCHEDULE_INTERVAL_MS,
    timeBudgetMs: parsed.SYNC_WORKER_TIME_BUDGET_MS,
  };
}

function errorDetails(error: unknown): {
  errorMessage: string;
  errorName: string;
} {
  return error instanceof Error
    ? { errorMessage: error.message.slice(0, 500), errorName: error.name }
    : {
        errorMessage: "Unknown synchronization error",
        errorName: "UnknownError",
      };
}

function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function runSyncWorker(input: {
  config: SyncWorkerConfig;
  dependencies: SyncWorkerDependencies;
  signal: AbortSignal;
}): Promise<void> {
  const now = input.dependencies.now ?? (() => new Date());
  const wait = input.dependencies.wait ?? waitForDelay;
  input.dependencies.log({
    event: "sync_worker_started",
    concurrency: input.config.concurrency,
    maxChunks: input.config.maxChunks,
    scheduleIntervalMs: input.config.scheduleIntervalMs,
    timeBudgetMs: input.config.timeBudgetMs,
  });

  let lastScheduleAt: Date | null = null;
  while (!input.signal.aborted) {
    const startedAt = now();
    if (
      input.dependencies.scheduleHourlySync &&
      (!lastScheduleAt ||
        startedAt.getTime() - lastScheduleAt.getTime() >=
          input.config.scheduleIntervalMs)
    ) {
      lastScheduleAt = startedAt;
      try {
        const queued = await input.dependencies.scheduleHourlySync();
        if (queued) {
          input.dependencies.log({
            event: "sync_worker_hourly_sync_queued",
            runId: queued.id,
          });
        }
      } catch (error) {
        input.dependencies.log({
          event: "sync_worker_hourly_schedule_failed",
          ...errorDetails(error),
        });
      }
    }
    try {
      const result = await input.dependencies.processTargets({
        concurrency: input.config.concurrency,
        maxChunks: input.config.maxChunks,
        timeBudgetMs: input.config.timeBudgetMs,
      });
      if (result.processedChunkCount > 0) {
        input.dependencies.log({
          event: "sync_worker_processed",
          durationMs: Math.max(0, now().getTime() - startedAt.getTime()),
          processedChunkCount: result.processedChunkCount,
        });
      }
      if (result.processedChunkCount === 0 && !input.signal.aborted) {
        await wait(input.config.idlePollMs, input.signal);
      }
    } catch (error) {
      input.dependencies.log({
        event: "sync_worker_iteration_failed",
        ...errorDetails(error),
      });
      if (!input.signal.aborted) {
        await wait(input.config.errorRetryMs, input.signal);
      }
    }
  }

  input.dependencies.log({ event: "sync_worker_stopped" });
}
