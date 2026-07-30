import { describe, expect, it, vi } from "vitest";

import { GhlRateLimiter } from "~/server/ghl/rate-limiter";

describe("GhlRateLimiter", () => {
  it("caps each location independently inside the configured window", async () => {
    let currentTime = 0;
    const wait = vi.fn(async (delayMs: number) => {
      currentTime += delayMs;
    });
    const limiter = new GhlRateLimiter({
      maxRequests: 2,
      intervalMs: 10_000,
      now: () => currentTime,
      wait,
    });

    await Promise.all([
      limiter.acquire("location-1"),
      limiter.acquire("location-1"),
      limiter.acquire("location-1"),
    ]);
    await Promise.all([
      limiter.acquire("location-2"),
      limiter.acquire("location-2"),
    ]);

    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(10_000);
  });

  it("blocks queued requests until a provider window resets", async () => {
    let currentTime = 2_000;
    const wait = vi.fn(async (delayMs: number) => {
      currentTime += delayMs;
    });
    const limiter = new GhlRateLimiter({
      maxRequests: 80,
      intervalMs: 10_000,
      now: () => currentTime,
      wait,
    });

    limiter.blockFor("location-1", 10_000);
    await limiter.acquire("location-1");

    expect(wait).toHaveBeenCalledWith(10_000);
  });
});
