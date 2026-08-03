import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAgencyReportingContext } from "~/features/settings/server/reporting-timezone";
import { type UserRole } from "~/lib/roles";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/settings/server/reporting-timezone", () => ({
  getAgencyReportingContext: vi.fn(),
}));
vi.mock("~/features/dashboard/server/client-scope", () => ({
  resolveAccessibleClientScope: vi.fn(),
}));
vi.mock("~/features/dashboard/server/queries", () => ({
  getAccountSummary: vi.fn(),
  getClientAnalytics: vi.fn(),
  getDashboardOverview: vi.fn(),
  getFilterOptions: vi.fn(),
  getLeadRows: vi.fn(),
  getMonitoringCampaigns: vi.fn(),
  getPerformanceRows: vi.fn(),
  getSourceAccountRows: vi.fn(),
  getSyncRuns: vi.fn(),
  getTopCampaigns: vi.fn(),
  getTrend: vi.fn(),
}));

const createCaller = createCallerFactory(dashboardRouter);

function callerFor(role: UserRole | null) {
  const currentUser = role
    ? {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        role,
        status: "active" as const,
      }
    : null;
  return createCaller({
    db,
    headers: new Headers(),
    session: currentUser
      ? {
          user: {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            role: currentUser.role,
          },
          expires: new Date(Date.now() + 60_000).toISOString(),
        }
      : null,
    currentUser,
  });
}

describe("dashboard reporting context authorization", () => {
  beforeEach(() => {
    vi.mocked(getAgencyReportingContext).mockResolvedValue({
      reportingTimezone: "UTC",
      today: "2026-07-30",
    });
  });

  it.each(["owner", "admin", "manager", "client"] as const)(
    "allows %s callers",
    async (role) => {
      await expect(callerFor(role).reportingContext()).resolves.toEqual({
        reportingTimezone: "UTC",
        today: "2026-07-30",
      });
    },
  );

  it("rejects anonymous callers", async () => {
    await expect(callerFor(null).reportingContext()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
