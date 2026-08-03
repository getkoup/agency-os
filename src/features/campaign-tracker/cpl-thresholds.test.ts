import { describe, expect, it } from "vitest";

import {
  campaignCplThresholdsSchema,
  formatCplThresholdLabel,
} from "~/features/campaign-tracker/cpl-thresholds";

describe("campaign CPL thresholds", () => {
  it("normalizes valid USD thresholds", () => {
    expect(
      campaignCplThresholdsSchema.parse({
        warningThreshold: " 20 ",
        criticalThreshold: "30.5",
      }),
    ).toEqual({
      warningThreshold: "20.00",
      criticalThreshold: "30.50",
    });
  });

  it.each([
    { warningThreshold: "-1", criticalThreshold: "25" },
    { warningThreshold: "20", criticalThreshold: "20" },
    { warningThreshold: "25", criticalThreshold: "20" },
    { warningThreshold: "10.001", criticalThreshold: "25" },
    { warningThreshold: "20", criticalThreshold: "1000000.01" },
  ])("rejects invalid threshold pair %#", (thresholds) => {
    expect(campaignCplThresholdsSchema.safeParse(thresholds).success).toBe(
      false,
    );
  });

  it("formats whole-dollar and decimal threshold labels", () => {
    expect(formatCplThresholdLabel("15.00")).toBe("$15");
    expect(formatCplThresholdLabel("15.50")).toBe("$15.50");
  });
});
