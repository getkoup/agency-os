import { type CampaignTrackerRow } from "~/features/campaign-tracker/server/queries";

export interface CampaignClientGroup {
  id: string;
  name: string;
  rows: CampaignTrackerRow[];
}

export function groupCampaignsByClient(
  rows: readonly CampaignTrackerRow[],
): CampaignClientGroup[] {
  const groupsById = new Map<string, CampaignClientGroup>();
  for (const row of rows) {
    const group = groupsById.get(row.clientId) ?? {
      id: row.clientId,
      name: row.clientName,
      rows: [],
    };
    group.rows.push(row);
    groupsById.set(row.clientId, group);
  }
  return [...groupsById.values()];
}
