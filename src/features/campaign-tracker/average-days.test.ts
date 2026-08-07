import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMPAIGN_AVERAGE_DAYS,
  parseCampaignAverageDays,
} from "~/features/campaign-tracker/average-days";

describe("campaign average days", () => {
  it("accepts arbitrary positive whole-day periods", () => {
    expect(parseCampaignAverageDays("37")).toBe(37);
  });

  it.each([undefined, "", "0", "-1", "1.5", "invalid"])(
    "defaults invalid periods from %j",
    (value) => {
      expect(parseCampaignAverageDays(value)).toBe(
        DEFAULT_CAMPAIGN_AVERAGE_DAYS,
      );
    },
  );
});
