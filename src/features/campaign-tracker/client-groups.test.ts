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
  averageCpl?: string | null;
}): CampaignTrackerRow {
  return {
    ...input,
    campaignName: input.id,
    campaignType: "Uncategorized",
    averageCpl: input.averageCpl ?? null,
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
  it("groups campaign rows while preserving row order", () => {
    expect(groupCampaignsByClient(rows)).toEqual([
      {
        id: "client-1",
        name: "Alpha Auto",
        highestAverageCpl: null,
        rows: [rows[0], rows[1]],
      },
      {
        id: "client-2",
        name: "Beta Dental",
        highestAverageCpl: null,
        rows: [rows[2]],
      },
    ]);
  });

  it("ranks clients by their highest campaign average CPL", () => {
    const ranked = groupCampaignsByClient([
      campaign({
        id: "Alpha Retargeting",
        clientId: "client-alpha",
        clientName: "Alpha Auto",
        averageCpl: "80.00",
      }),
      campaign({
        id: "Alpha Prospecting",
        clientId: "client-alpha",
        clientName: "Alpha Auto",
        averageCpl: "20.00",
      }),
      campaign({
        id: "Beta Prospecting",
        clientId: "client-beta",
        clientName: "Beta Dental",
        averageCpl: "95.50",
      }),
      campaign({
        id: "No Leads",
        clientId: "client-none",
        clientName: "No CPL Client",
      }),
    ]);

    expect(
      ranked.map(({ id, highestAverageCpl }) => ({
        id,
        highestAverageCpl,
      })),
    ).toEqual([
      { id: "client-beta", highestAverageCpl: 95.5 },
      { id: "client-alpha", highestAverageCpl: 80 },
      { id: "client-none", highestAverageCpl: null },
    ]);
    expect(ranked[1]?.rows.map(({ id }) => id)).toEqual([
      "Alpha Retargeting",
      "Alpha Prospecting",
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
