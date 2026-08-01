import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAgencyReportingContext } from "~/features/settings/server/reporting-timezone";
import { type UserRole } from "~/lib/roles";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { retryClientSync } from "~/server/sync/retry-client-sync";
import { syncAllClients } from "~/server/sync/sync-all-clients";
import { scheduleSyncWorker } from "~/server/sync/schedule-worker";

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
vi.mock("~/server/sync/retry-client-sync", () => ({
  retryClientSync: vi.fn(),
  FailedClientSyncTargetsNotFoundError: class FailedClientSyncTargetsNotFoundError extends Error {},
}));
vi.mock("~/server/sync/sync-all-clients", () => ({
  syncAllClients: vi.fn(),
  SyncAlreadyRunningError: class SyncAlreadyRunningError extends Error {},
}));
vi.mock("~/server/sync/schedule-worker", () => ({
  scheduleSyncWorker: vi.fn(),
}));

vi.mock("~/features/synchronization/server/queries", () => ({
  getAllClientSyncRuns: vi.fn().mockResolvedValue([]),
}));

const createCaller = createCallerFactory(dashboardRouter);
const completedRun = {
  id: "00000000-0000-4000-8000-000000000001",
  requestedByUserId: "user-1",
  status: "succeeded" as const,
  startedAt: new Date(),
  heartbeatAt: new Date(),
  completedAt: new Date(),
  windsorSyncRunId: null,
  discoveredAccountCount: 0,
  performanceRowCount: 0,
  leadRowCount: 0,
  contactRowCount: 0,
  opportunityRowCount: 0,
  matchedOpportunityCount: 0,
  errorMessage: null,
  targets: [],
};

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

describe("dashboard.syncAllClients authorization", () => {
  beforeEach(() => {
    vi.mocked(syncAllClients).mockReset().mockResolvedValue(completedRun);
    vi.mocked(scheduleSyncWorker).mockReset();
  });

  it.each(["owner", "admin"] as const)("allows %s callers", async (role) => {
    await expect(callerFor(role).syncAllClients()).resolves.toEqual(
      completedRun,
    );
    expect(syncAllClients).toHaveBeenCalledWith("user-1");
    expect(scheduleSyncWorker).toHaveBeenCalledWith(completedRun.id);
  });

  it.each(["manager", "client"] as const)(
    "rejects %s callers",
    async (role) => {
      await expect(callerFor(role).syncAllClients()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(syncAllClients).not.toHaveBeenCalled();
    },
  );

  it("rejects anonymous callers", async () => {
    await expect(callerFor(null).syncAllClients()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(syncAllClients).not.toHaveBeenCalled();
  });
});

describe("dashboard.retryClientSync authorization", () => {
  const input = {
    clientId: "00000000-0000-4000-8000-000000000002",
    sourceRunId: "00000000-0000-4000-8000-000000000003",
  };

  beforeEach(() => {
    vi.mocked(retryClientSync).mockReset().mockResolvedValue(completedRun);
    vi.mocked(scheduleSyncWorker).mockReset();
  });

  it.each(["owner", "admin"] as const)("allows %s callers", async (role) => {
    await expect(callerFor(role).retryClientSync(input)).resolves.toEqual(
      completedRun,
    );
    expect(retryClientSync).toHaveBeenCalledWith({
      ...input,
      requestedByUserId: "user-1",
    });
    expect(scheduleSyncWorker).toHaveBeenCalledWith(completedRun.id);
  });

  it.each(["manager", "client"] as const)(
    "rejects %s callers",
    async (role) => {
      await expect(
        callerFor(role).retryClientSync(input),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(retryClientSync).not.toHaveBeenCalled();
    },
  );
});
