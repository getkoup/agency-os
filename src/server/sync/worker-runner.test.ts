import { describe, expect, it, vi } from "vitest";

import {
  parseSyncWorkerConfig,
  runSyncWorker,
  type SyncWorkerConfig,
} from "~/server/sync/worker-runner";

const config: SyncWorkerConfig = {
  concurrency: 4,
  errorRetryMs: 30_000,
  idlePollMs: 5_000,
  maxChunks: 1_000,
  timeBudgetMs: 240_000,
};

describe("parseSyncWorkerConfig", () => {
  it("uses bounded production defaults", () => {
    expect(parseSyncWorkerConfig({})).toEqual(config);
  });

  it("accepts explicit worker limits", () => {
    expect(
      parseSyncWorkerConfig({
        SYNC_WORKER_CONCURRENCY: "8",
        SYNC_WORKER_ERROR_RETRY_MS: "10000",
        SYNC_WORKER_IDLE_POLL_MS: "2000",
        SYNC_WORKER_MAX_CHUNKS: "2000",
        SYNC_WORKER_TIME_BUDGET_MS: "300000",
      }),
    ).toEqual({
      concurrency: 8,
      errorRetryMs: 10_000,
      idlePollMs: 2_000,
      maxChunks: 2_000,
      timeBudgetMs: 300_000,
    });
  });

  it("rejects unsafe worker limits", () => {
    expect(() =>
      parseSyncWorkerConfig({ SYNC_WORKER_CONCURRENCY: "0" }),
    ).toThrow();
    expect(() =>
      parseSyncWorkerConfig({ SYNC_WORKER_CONCURRENCY: "17" }),
    ).toThrow();
  });
});

describe("runSyncWorker", () => {
  it("continues immediately while chunks are being processed", async () => {
    const controller = new AbortController();
    const wait =
      vi.fn<(delayMs: number, signal: AbortSignal) => Promise<void>>();
    const processTargets = vi.fn(async () => {
      if (processTargets.mock.calls.length === 2) controller.abort();
      return {
        processedChunkCount: processTargets.mock.calls.length === 1 ? 3 : 0,
      };
    });

    await runSyncWorker({
      config,
      signal: controller.signal,
      dependencies: { log: vi.fn(), processTargets, wait },
    });

    expect(processTargets).toHaveBeenCalledTimes(2);
    expect(wait).not.toHaveBeenCalled();
  });

  it("waits between idle polls", async () => {
    const controller = new AbortController();
    const wait = vi.fn(async () => controller.abort());
    const processTargets = vi
      .fn()
      .mockResolvedValue({ processedChunkCount: 0 });

    await runSyncWorker({
      config,
      signal: controller.signal,
      dependencies: { log: vi.fn(), processTargets, wait },
    });

    expect(processTargets).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(config.idlePollMs, controller.signal);
  });

  it("logs failures and backs off without exiting", async () => {
    const controller = new AbortController();
    const log = vi.fn();
    const wait = vi.fn(async () => controller.abort());
    const processTargets = vi
      .fn()
      .mockRejectedValue(new Error("DB unavailable"));

    await runSyncWorker({
      config,
      signal: controller.signal,
      dependencies: { log, processTargets, wait },
    });

    expect(wait).toHaveBeenCalledWith(config.errorRetryMs, controller.signal);
    expect(log).toHaveBeenCalledWith({
      event: "sync_worker_iteration_failed",
      errorMessage: "DB unavailable",
      errorName: "Error",
    });
  });
});
