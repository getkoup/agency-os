import { describe, expect, it } from "vitest";

import {
  ALL_CLIENT_SYNC_STALE_AFTER_MS,
  isAllClientSyncRunActive,
} from "~/server/sync/run-status";

describe("isAllClientSyncRunActive", () => {
  const now = new Date("2026-07-30T20:00:00.000Z");

  it("keeps a recent running heartbeat active", () => {
    expect(
      isAllClientSyncRunActive(
        {
          status: "running",
          heartbeatAt: new Date(now.getTime() - ALL_CLIENT_SYNC_STALE_AFTER_MS),
        },
        now,
      ),
    ).toBe(true);
  });

  it("does not let a stale running row lock synchronization", () => {
    expect(
      isAllClientSyncRunActive(
        {
          status: "running",
          heartbeatAt: new Date(
            now.getTime() - ALL_CLIENT_SYNC_STALE_AFTER_MS - 1,
          ),
        },
        now,
      ),
    ).toBe(false);
  });

  it("does not treat completed runs as active", () => {
    expect(
      isAllClientSyncRunActive({ status: "succeeded", heartbeatAt: now }, now),
    ).toBe(false);
  });
});
