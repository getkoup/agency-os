import { describe, expect, it } from "vitest";

import {
  calculateOpportunityRevenue,
  formatUsdCents,
  parseUsdToCents,
  type RevenueRuleInput,
} from "~/features/revenue/calculations";

const rules: RevenueRuleInput[] = [
  {
    id: "qualified",
    tagName: " Qualified ",
    revenueValue: "125.50",
    serviceName: "Consultation",
    status: "active",
  },
  {
    id: "premium",
    tagName: "PREMIUM",
    revenueValue: "999.99",
    serviceName: "Premium service",
    status: "active",
  },
  {
    id: "inactive",
    tagName: "inactive-tag",
    revenueValue: "500.00",
    serviceName: "Old service",
    status: "inactive",
  },
];

describe("calculateOpportunityRevenue", () => {
  it("normalizes whitespace and case, deduplicates tags, and sums distinct rules exactly", () => {
    expect(
      calculateOpportunityRevenue({
        tags: [" qualified", "QUALIFIED ", "premium", "  "],
        rules,
      }),
    ).toEqual({
      revenueValue: "1125.49",
      matchedRuleIds: ["qualified", "premium"],
      matchedServices: ["Consultation", "Premium service"],
      matchedTags: ["qualified", "premium"],
      status: "matched",
    });
  });

  it("ignores inactive rules and reports missing only when no active rule matches", () => {
    expect(
      calculateOpportunityRevenue({ tags: ["inactive-tag", "unknown"], rules }),
    ).toMatchObject({ revenueValue: "0.00", status: "missing" });
  });

  it("does not parse provider values or numbers embedded in tags", () => {
    expect(
      calculateOpportunityRevenue({ tags: ["revenue-500", "500.00"], rules }),
    ).toMatchObject({ revenueValue: "0.00", status: "missing" });
  });
});

describe("USD decimal helpers", () => {
  it.each([
    ["0", "0.00"],
    ["12.3", "12.30"],
    ["999999999999.99", "999999999999.99"],
  ])("round-trips %s without floating-point arithmetic", (input, expected) => {
    expect(formatUsdCents(parseUsdToCents(input))).toBe(expected);
  });

  it.each(["-1", "1.001", "NaN", ""])(
    "rejects invalid USD value %s",
    (value) => {
      expect(() => parseUsdToCents(value)).toThrow();
    },
  );
});
