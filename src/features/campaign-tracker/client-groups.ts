import { type CampaignTrackerRow } from "~/features/campaign-tracker/server/queries";

export interface CampaignClientGroup {
  id: string;
  name: string;
  highestAverageCpl: number | null;
  rows: CampaignTrackerRow[];
}

function compareClientRank(
  left: CampaignClientGroup,
  right: CampaignClientGroup,
): number {
  const leftCpl = left.highestAverageCpl;
  const rightCpl = right.highestAverageCpl;
  if (leftCpl === null && rightCpl !== null) return 1;
  if (leftCpl !== null && rightCpl === null) return -1;
  if (leftCpl !== null && rightCpl !== null && leftCpl !== rightCpl) {
    return rightCpl - leftCpl;
  }
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
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
      highestAverageCpl: null,
    };
    group.rows.push(row);
    if (row.averageCpl !== null) {
      const averageCpl = Number(row.averageCpl);
      if (
        group.highestAverageCpl === null ||
        averageCpl > group.highestAverageCpl
      ) {
        group.highestAverageCpl = averageCpl;
      }
    }
    groupsById.set(row.clientId, group);
  }
  return [...groupsById.values()].sort(compareClientRank);
}

export function filterCampaignClientGroups(
  groups: readonly CampaignClientGroup[],
  query: string,
): CampaignClientGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...groups];
  return groups.flatMap((group) => {
    if (group.name.toLocaleLowerCase().includes(normalizedQuery)) {
      return [group];
    }
    const matchingRows = group.rows.filter((row) =>
      row.campaignName.toLocaleLowerCase().includes(normalizedQuery),
    );
    return matchingRows.length ? [{ ...group, rows: matchingRows }] : [];
  });
}
