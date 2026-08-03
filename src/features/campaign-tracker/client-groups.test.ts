import { describe, expect, it } from "vitest";

import { groupCampaignsByClient } from "~/features/campaign-tracker/client-groups";
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

describe("groupCampaignsByClient", () => {
  it("groups adjacent campaign rows while preserving client and row order", () => {
    const rows = [
      campaign({ id: "campaign-b", clientId: "client-1", clientName: "One" }),
      campaign({ id: "campaign-a", clientId: "client-1", clientName: "One" }),
      campaign({ id: "campaign-c", clientId: "client-2", clientName: "Two" }),
    ];

    expect(groupCampaignsByClient(rows)).toEqual([
      { id: "client-1", name: "One", rows: [rows[0], rows[1]] },
      { id: "client-2", name: "Two", rows: [rows[2]] },
    ]);
  });
});
