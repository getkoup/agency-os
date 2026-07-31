import "server-only";

import { after } from "next/server";

import { processPendingSyncTargets } from "~/server/sync/sync-worker";

export function scheduleSyncWorker(runId: string): void {
  after(async () => {
    try {
      await processPendingSyncTargets({ runId });
    } catch (error) {
      console.error("Scheduled synchronization worker failed", {
        runId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unknown synchronization error",
      });
    }
  });
}
