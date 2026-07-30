import { describe, expect, it, vi } from "vitest";

import { mapInBatches } from "~/server/sync/batch";

describe("mapInBatches", () => {
  it("runs each bounded batch concurrently and preserves result order", async () => {
    let active = 0;
    let maximumConcurrency = 0;
    const onBatchComplete = vi.fn(() => Promise.resolve());

    const results = await mapInBatches(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (value) => {
        active += 1;
        maximumConcurrency = Math.max(maximumConcurrency, active);
        await Promise.resolve();
        active -= 1;
        return value * 2;
      },
      onBatchComplete,
    );

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(maximumConcurrency).toBe(3);
    expect(onBatchComplete).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid batch sizes", async () => {
    await expect(mapInBatches([], 0, async () => true)).rejects.toThrow(
      "Batch size must be a positive integer",
    );
  });
});
