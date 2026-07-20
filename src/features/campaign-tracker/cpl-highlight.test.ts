import { describe, expect, it } from "vitest";

import { getCplHighlightClass } from "~/features/campaign-tracker/cpl-highlight";

describe("campaign tracker CPL highlights", () => {
  it.each([
    [null, ""],
    ["15.00", ""],
    ["15.01", "bg-orange-500/40"],
    ["25.00", "bg-orange-500/40"],
    ["25.01", "bg-red-500/40"],
  ] as const)("maps %s to %s", (cpl, expected) => {
    expect(getCplHighlightClass(cpl)).toBe(expected);
  });
});
