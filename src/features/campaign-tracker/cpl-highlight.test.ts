import { describe, expect, it } from "vitest";

import { getCplHighlightClass } from "~/features/campaign-tracker/cpl-highlight";

const thresholds = {
  warningThreshold: "20.00",
  criticalThreshold: "30.00",
};

describe("campaign tracker CPL highlights", () => {
  it.each([
    [null, ""],
    ["20.00", ""],
    ["20.01", "bg-orange-500/40"],
    ["30.00", "bg-orange-500/40"],
    ["30.01", "bg-red-500/40"],
    ["invalid", ""],
  ] as const)("maps %s to %s using configured thresholds", (cpl, expected) => {
    expect(getCplHighlightClass(cpl, thresholds)).toBe(expected);
  });
});
