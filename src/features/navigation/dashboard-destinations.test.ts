import { describe, expect, it } from "vitest";

import {
  DASHBOARD_DESTINATIONS,
  isDestinationActive,
} from "~/features/navigation/dashboard-destinations";

const v1 = "/dashboard/sales-commissions";
const v2 = "/dashboard/sales-commissions-v2";

describe("dashboard sales commission destinations", () => {
  it("activates V1 report and setup only for V1", () => {
    expect(isDestinationActive(v1, v1)).toBe(true);
    expect(isDestinationActive(`${v1}/setup`, v1)).toBe(true);
    expect(isDestinationActive(v1, v2)).toBe(false);
    expect(isDestinationActive(`${v1}/setup`, v2)).toBe(false);
  });

  it("activates V2 report and setup only for V2", () => {
    expect(isDestinationActive(v2, v2)).toBe(true);
    expect(isDestinationActive(`${v2}/setup`, v2)).toBe(true);
    expect(isDestinationActive(v2, v1)).toBe(false);
    expect(isDestinationActive(`${v2}/setup`, v1)).toBe(false);
  });

  it("does not activate sibling prefixes", () => {
    expect(isDestinationActive("/dashboard/sales-commissions-old", v1)).toBe(
      false,
    );
    expect(isDestinationActive("/dashboard/sales-commissions-v20", v2)).toBe(
      false,
    );
    expect(isDestinationActive("/dashboarding", "/dashboard")).toBe(false);
  });

  it("registers V2 immediately after V1 with staff-only roles", () => {
    const v1Index = DASHBOARD_DESTINATIONS.findIndex(
      (destination) => destination.href === v1,
    );
    const destination = DASHBOARD_DESTINATIONS[v1Index + 1];
    expect(destination).toMatchObject({
      href: v2,
      label: "Sales & Commissions v2",
      roles: ["owner", "admin", "manager"],
      group: "Workspace",
    });
  });
});
