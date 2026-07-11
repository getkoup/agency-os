import { describe, expect, it } from "vitest";

import { resolveDashboardPageSearch } from "./page-search";

describe("dashboard page search", () => {
  it("defaults to the latest seven UTC dates and independent first pages", () => {
    expect(
      resolveDashboardPageSearch({}, new Date("2026-07-12T23:59:00.000Z")),
    ).toMatchObject({
      from: "2026-07-06",
      to: "2026-07-12",
      performancePage: 1,
      leadPage: 1,
    });
  });

  it("coerces independent pagination without changing filters", () => {
    expect(
      resolveDashboardPageSearch({
        from: "2026-07-01",
        to: "2026-07-07",
        performancePage: "3",
        leadPage: "2",
        clientId: "unassigned",
      }),
    ).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-07",
      performancePage: 3,
      leadPage: 2,
      clientId: "unassigned",
    });
  });

  it("rejects invalid and reversed ranges", () => {
    expect(() =>
      resolveDashboardPageSearch({ from: "2026-07-10", to: "2026-07-01" }),
    ).toThrow();
    expect(() =>
      resolveDashboardPageSearch({ performancePage: "0" }),
    ).toThrow();
  });
});
