export const CLIENT_MAPPINGS = [
  {
    slug: "tint-lab",
    name: "Tint Lab",
    connectorAccountIds: [
      "facebook__947049041046274",
      "facebook_leads__1084237868095826",
    ],
  },
  {
    slug: "719-auto-customs",
    name: "719 Auto Customs",
    connectorAccountIds: [
      "facebook__2298991543451560",
      "facebook_leads__1749361305140569",
    ],
  },
  {
    slug: "diamond-auto-restoration",
    name: "Diamond Auto Restoration",
    connectorAccountIds: [
      "facebook__3936585339919458",
      "facebook_leads__454302567777196",
    ],
  },
] as const;

export function findClientMapping(connectorAccountId: string) {
  return CLIENT_MAPPINGS.find((mapping) =>
    mapping.connectorAccountIds.some((id) => id === connectorAccountId),
  );
}
