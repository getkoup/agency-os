import "server-only";

import { loadStoredGhlConfig } from "~/server/ghl/configuration";
import { WindsorClient } from "~/server/windsor/client";
import { processPendingSyncTargets } from "~/server/sync/sync-worker";
import { queueHourlyFreshSynchronization } from "~/server/sync/synchronization-queue";
import {
  parseSyncWorkerConfig,
  runSyncWorker,
} from "~/server/sync/worker-runner";

function writeLog(entry: Record<string, number | string>): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      ...entry,
    }),
  );
}

function collectGarbage(): void {
  const runtime = globalThis as typeof globalThis & {
    Bun?: { gc: (force?: boolean) => void };
  };
  runtime.Bun?.gc(true);
}

async function processTargets(
  input: Parameters<typeof processPendingSyncTargets>[0],
): ReturnType<typeof processPendingSyncTargets> {
  try {
    return await processPendingSyncTargets(input);
  } finally {
    collectGarbage();
  }
}

function safeError(error: unknown): Record<string, string> {
  return error instanceof Error
    ? { errorName: error.name, errorMessage: error.message.slice(0, 500) }
    : {
        errorName: "UnknownError",
        errorMessage: "Unknown synchronization worker error",
      };
}

async function checkWorkerConfiguration(): Promise<void> {
  const ghlConfig = await loadStoredGhlConfig();
  void new WindsorClient();
  writeLog({
    event: "sync_worker_check_succeeded",
    configuredGhlLocationCount: ghlConfig.mappings.length,
  });
}

async function main(): Promise<void> {
  const config = parseSyncWorkerConfig(process.env);
  if (process.argv.includes("--check")) {
    await checkWorkerConfiguration();
    return;
  }

  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      writeLog({ event: "sync_worker_shutdown_requested", signal });
      controller.abort();
    });
  }

  await runSyncWorker({
    config,
    signal: controller.signal,
    dependencies: {
      log: writeLog,
      processTargets,
      scheduleHourlySync: async () => {
        const run = await queueHourlyFreshSynchronization();
        return run ? { id: run.id } : null;
      },
    },
  });
}

try {
  await main();
  process.exit(0);
} catch (error) {
  writeLog({ event: "sync_worker_fatal", ...safeError(error) });
  process.exit(1);
}
