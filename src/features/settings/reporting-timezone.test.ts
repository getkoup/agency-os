import { describe, expect, it } from "vitest";

import {
  getCalendarDateInTimezone,
  getReportingTimezoneOptions,
  isValidReportingTimezone,
  reportingTimezoneSchema,
} from "~/features/settings/reporting-timezone";

describe("agency reporting timezone", () => {
  it("validates IANA timezones and rejects unknown values", () => {
    expect(isValidReportingTimezone("UTC")).toBe(true);
    expect(isValidReportingTimezone("America/Los_Angeles")).toBe(true);
    expect(isValidReportingTimezone("Not/A_Timezone")).toBe(false);
    expect(reportingTimezoneSchema.safeParse("Not/A_Timezone").success).toBe(
      false,
    );
  });

  it("keeps UTC first in the selectable timezone list", () => {
    const options = getReportingTimezoneOptions();
    expect(options[0]).toBe("UTC");
    expect(options).toContain("America/Los_Angeles");
    expect(new Set(options).size).toBe(options.length);
  });

  it("resolves the same instant to the selected calendar date", () => {
    const instant = new Date("2026-07-30T03:00:00.000Z");
    expect(getCalendarDateInTimezone(instant, "UTC")).toBe("2026-07-30");
    expect(getCalendarDateInTimezone(instant, "America/Los_Angeles")).toBe(
      "2026-07-29",
    );
  });
});
