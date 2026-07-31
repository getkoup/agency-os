import { beforeEach, describe, expect, it, vi } from "vitest";

import { processPendingSyncTargets } from "~/server/sync/sync-worker";

vi.mock("~/env", () => ({
  env: { CRON_SECRET: "test-cron-secret-with-32-characters" },
}));
vi.mock("~/server/sync/sync-worker", () => ({
  processPendingSyncTargets: vi.fn(),
}));

import { GET } from "~/app/api/cron/synchronization/route";

describe("synchronization cron worker", () => {
  beforeEach(() => {
    vi.mocked(processPendingSyncTargets).mockReset();
  });

  it("rejects requests without the cron secret", async () => {
    const response = await GET(
      new Request("https://agency.example/api/cron/synchronization"),
    );

    expect(response.status).toBe(401);
    expect(processPendingSyncTargets).not.toHaveBeenCalled();
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
    await expect(response.json()).resolves.toEqual({ processedChunkCount: 4 });
    expect(processPendingSyncTargets).toHaveBeenCalledTimes(1);
  });
});
