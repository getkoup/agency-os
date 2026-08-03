import { describe, expect, it } from "vitest";

import {
  filterCampaignClientGroups,
  groupCampaignsByClient,
} from "~/features/campaign-tracker/client-groups";
import { type CampaignTrackerRow } from "~/features/campaign-tracker/server/queries";

function campaign(input: {
  id: string;
  clientId: string;
  clientName: string;
}): CampaignTrackerRow {
  return {
    ...input,
    campaignName: input.id,
    campaignType: "Uncategorized",
    remark: "",
    daily: [],
  };
}

const rows = [
  campaign({
    id: "Spring Leads",
    clientId: "client-1",
    clientName: "Alpha Auto",
  }),
  campaign({
    id: "Retargeting",
    clientId: "client-1",
    clientName: "Alpha Auto",
  }),
  campaign({
    id: "Spring Leads",
    clientId: "client-2",
    clientName: "Beta Dental",
  }),
];

describe("campaign client groups", () => {
  it("groups campaign rows while preserving client and row order", () => {
    expect(groupCampaignsByClient(rows)).toEqual([
      { id: "client-1", name: "Alpha Auto", rows: [rows[0], rows[1]] },
      { id: "client-2", name: "Beta Dental", rows: [rows[2]] },
    ]);
  });

  it("keeps every campaign when the client name matches", () => {
    const groups = groupCampaignsByClient(rows);
    expect(filterCampaignClientGroups(groups, "ALPHA")).toEqual([groups[0]]);
  });

  it("keeps only matching campaigns when the client does not match", () => {
    const groups = groupCampaignsByClient(rows);
    expect(filterCampaignClientGroups(groups, "spring")).toEqual([
      { ...groups[0]!, rows: [rows[0]!] },
      { ...groups[1]!, rows: [rows[2]!] },
    ]);
  });

  it("returns no groups when neither client nor campaign matches", () => {
    expect(
      filterCampaignClientGroups(groupCampaignsByClient(rows), "missing"),
    ).toEqual([]);
  });
});
