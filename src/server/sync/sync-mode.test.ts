import { describe, expect, it } from "vitest";

import {
  ghlAppointmentRange,
  ghlOpportunityFloor,
  windsorLookbackDays,
} from "~/server/sync/sync-mode";

const startedAt = new Date("2026-08-03T12:00:00.000Z");

describe("synchronization ranges", () => {
  it("uses a three-day history and thirty-day future for fresh GHL appointments", () => {
    expect(ghlAppointmentRange(startedAt, "fresh")).toEqual({
      floor: new Date("2026-07-31T12:00:00.000Z"),
      through: new Date("2026-09-02T12:00:00.000Z"),
    });
  });

  it("retains the full GHL appointment reconciliation range", () => {
    expect(ghlAppointmentRange(startedAt, "full")).toEqual({
      floor: new Date("2026-05-05T12:00:00.000Z"),
      through: new Date("2027-01-30T12:00:00.000Z"),
    });
  });

  it("limits fresh opportunities to three days and replays full opportunities from the mapping floor", () => {
    const syncFromAt = new Date("2020-01-01T00:00:00.000Z");
    expect(
      ghlOpportunityFloor({
        mode: "fresh",
        runStartedAt: startedAt,
        syncFromAt,
      }),
    ).toEqual(new Date("2026-07-31T12:00:00.000Z"));
    expect(
      ghlOpportunityFloor({
        mode: "full",
        runStartedAt: startedAt,
        syncFromAt,
      }),
    ).toEqual(syncFromAt);
  });

  it("never reads before the configured mapping floor", () => {
    const syncFromAt = new Date("2026-08-02T00:00:00.000Z");
    expect(
      ghlOpportunityFloor({
        mode: "fresh",
        runStartedAt: startedAt,
        syncFromAt,
      }),
    ).toEqual(syncFromAt);
  });

  it("uses three Windsor lookback days for fresh and the existing eight for full", () => {
    expect(windsorLookbackDays("fresh")).toBe(3);
    expect(windsorLookbackDays("full")).toBe(8);
  });
});
