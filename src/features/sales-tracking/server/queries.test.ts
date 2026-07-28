import { describe, expect, it } from "vitest";

import {
  groupSalesDates,
  resolveSalesTrackingDates,
  salesStatus,
} from "~/features/sales-tracking/server/queries";

describe("sales tracking", () => {
  it("resolves a four-day window", () => {
    expect(resolveSalesTrackingDates("2026-07-29")).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
    ]);
  });

  it("expands the range to keep four columns for every group size", () => {
    const dates = resolveSalesTrackingDates("2026-07-29", 2);
    expect(dates).toHaveLength(8);
    expect(groupSalesDates(dates, 2)).toHaveLength(4);
    expect(dates[0]).toBe("2026-07-22");
  });

  it("groups dates without scaling the configured goal", () => {
    expect(
      groupSalesDates(
        ["2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29"],
        2,
      ),
    ).toEqual([
      ["2026-07-26", "2026-07-27"],
      ["2026-07-28", "2026-07-29"],
    ]);
  });

  it("applies the agreed severity thresholds", () => {
    expect(salesStatus(10, 10)).toBe("working_good");
    expect(salesStatus(9, 10)).toBe("needs_monitoring");
    expect(salesStatus(5, 10)).toBe("needs_attention");
    expect(salesStatus(100, null)).toBe("no_goal");
  });
});
