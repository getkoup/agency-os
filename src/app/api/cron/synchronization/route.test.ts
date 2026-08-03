import { beforeEach, describe, expect, it, vi } from "vitest";

import { processPendingSyncTargets } from "~/server/sync/sync-worker";
import { queueHourlyFreshSynchronization } from "~/server/sync/synchronization-queue";

vi.mock("~/env", () => ({
  env: { CRON_SECRET: "test-cron-secret-with-32-characters" },
}));
vi.mock("~/server/sync/sync-worker", () => ({
  processPendingSyncTargets: vi.fn(),
}));
vi.mock("~/server/sync/synchronization-queue", () => ({
  queueHourlyFreshSynchronization: vi.fn(),
}));

import { GET } from "~/app/api/cron/synchronization/route";

describe("synchronization cron worker", () => {
  beforeEach(() => {
    vi.mocked(processPendingSyncTargets).mockReset();
    vi.mocked(queueHourlyFreshSynchronization)
      .mockReset()
      .mockResolvedValue(null);
  });

  it("rejects requests without the cron secret", async () => {
    const response = await GET(
      new Request("https://agency.example/api/cron/synchronization"),
    );

    expect(response.status).toBe(401);
    expect(processPendingSyncTargets).not.toHaveBeenCalled();
    expect(queueHourlyFreshSynchronization).not.toHaveBeenCalled();
  });

  it("processes queued targets even when hourly scheduling fails", async () => {
    vi.mocked(queueHourlyFreshSynchronization).mockRejectedValue(
      new Error("Scheduler unavailable"),
    );
    vi.mocked(processPendingSyncTargets).mockResolvedValue({
      processedChunkCount: 2,
    });

    const response = await GET(
      new Request("https://agency.example/api/cron/synchronization", {
        headers: {
          Authorization: "Bearer test-cron-secret-with-32-characters",
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Hourly synchronization scheduling failed",
      processedChunkCount: 2,
    });
    expect(processPendingSyncTargets).toHaveBeenCalledTimes(1);
  });

  it("processes queued targets for an authorized cron request", async () => {
    vi.mocked(processPendingSyncTargets).mockResolvedValue({
      processedChunkCount: 4,
    });
    const response = await GET(
      new Request("https://agency.example/api/cron/synchronization", {
        headers: {
          Authorization: "Bearer test-cron-secret-with-32-characters",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      queuedRunId: null,
      processedChunkCount: 4,
    });
    expect(queueHourlyFreshSynchronization).toHaveBeenCalledTimes(1);
    expect(processPendingSyncTargets).toHaveBeenCalledTimes(1);
  });
});
