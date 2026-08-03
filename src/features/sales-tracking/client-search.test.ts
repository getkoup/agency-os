import { describe, expect, it } from "vitest";

import { filterRankedClients } from "~/features/sales-tracking/client-search";

describe("filterRankedClients", () => {
  const clients = [
    { id: "alpha", name: "Alpha Auto" },
    { id: "beta", name: "Beta Dental" },
    { id: "gamma", name: "Gamma Auto" },
  ];

  it("matches client names without case sensitivity", () => {
    expect(filterRankedClients(clients, "AUTO")).toEqual([
      { rank: 1, row: clients[0] },
      { rank: 3, row: clients[2] },
    ]);
  });

  it("preserves original table ranks after filtering", () => {
    expect(filterRankedClients(clients, "beta")).toEqual([
      { rank: 2, row: clients[1] },
    ]);
  });

  it("returns every row for a blank query", () => {
    expect(filterRankedClients(clients, "  ")).toHaveLength(3);
  });
});
