import { describe, expect, it } from "vitest";

import { campaignTrackerViewHref } from "~/features/campaign-tracker/view";

describe("campaign tracker view URLs", () => {
  it("keeps grouped view as the clean default", () => {
    expect(
      campaignTrackerViewHref({ date: "2026-08-03", view: "grouped" }),
    ).toBe("/dashboard/campaign-tracker?date=2026-08-03");
  });

  it("persists table view in the URL", () => {
    expect(campaignTrackerViewHref({ date: "2026-08-03", view: "table" })).toBe(
      "/dashboard/campaign-tracker?date=2026-08-03&view=table",
    );
  });

  it("preserves a trimmed search when changing views", () => {
    expect(
      campaignTrackerViewHref({
        date: "2026-08-03",
        query: "  tint  ",
        view: "table",
      }),
    ).toBe("/dashboard/campaign-tracker?date=2026-08-03&query=tint&view=table");
  });

  it("preserves non-default average days when changing views", () => {
    expect(
      campaignTrackerViewHref({
        averageDays: 37,
        date: "2026-08-03",
        view: "table",
      }),
    ).toBe(
      "/dashboard/campaign-tracker?date=2026-08-03&averageDays=37&view=table",
    );
  });
});
