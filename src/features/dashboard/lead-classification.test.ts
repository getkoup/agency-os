import { describe, expect, it } from "vitest";

import {
  classifyCampaign,
  normalizeCampaignText,
  type LeadClassificationRule,
} from "~/features/dashboard/lead-classification";

const rules: LeadClassificationRule[] = [
  {
    id: "tint",
    categoryName: "Tint",
    keywords: ["tint"],
    matchMode: "any",
    priority: 100,
  },
  {
    id: "ppf",
    categoryName: "PPF",
    keywords: ["ppf", "paint protection film"],
    matchMode: "any",
    priority: 90,
  },
  {
    id: "ceramic",
    categoryName: "Ceramic Coating",
    keywords: ["coating", "ceramic"],
    matchMode: "any",
    priority: 80,
  },
];

describe("lead campaign classification", () => {
  it.each([
    ["Tint $299", "Tint"],
    ["Ceramic Tint Special", "Tint"],
    ["PPF and Tint Package", "Tint"],
    ["Ceramic PPF Package", "PPF"],
    ["Paint Protection Film Offer", "PPF"],
    ["Ceramic Coating Offer", "Ceramic Coating"],
    ["Ceramic Special", "Ceramic Coating"],
    ["Unknown Service", "Uncategorized"],
  ])("classifies %s as %s", (campaign, expected) => {
    expect(classifyCampaign(campaign, rules)).toBe(expected);
  });

  it("supports all-keyword rules and deterministic priorities", () => {
    const combination: LeadClassificationRule = {
      id: "combination",
      categoryName: "Detailing Package",
      keywords: ["interior", "exterior"],
      matchMode: "all",
      priority: 110,
    };
    expect(
      classifyCampaign("Interior and Exterior Detail", [...rules, combination]),
    ).toBe("Detailing Package");
    expect(classifyCampaign("Interior Detail", [combination])).toBe(
      "Uncategorized",
    );
  });

  it("normalizes punctuation and matches complete words or phrases", () => {
    expect(normalizeCampaignText("  Ceramic-Tint | JULY  ")).toBe(
      "ceramic tint july",
    );
    expect(classifyCampaign("Retinting offer", rules)).toBe("Uncategorized");
  });
});
