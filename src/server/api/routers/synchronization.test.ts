import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveAccessibleClientScope } from "~/features/dashboard/server/client-scope";
import { type UserRole } from "~/lib/roles";
import { synchronizationRouter } from "~/server/api/routers/synchronization";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { scheduleSyncWorker } from "~/server/sync/schedule-worker";
import { queueSynchronization } from "~/server/sync/synchronization-queue";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/dashboard/server/client-scope", () => ({
  resolveAccessibleClientScope: vi.fn(),
}));
vi.mock("~/features/synchronization/server/queries", () => ({
  getAllClientSyncRuns: vi.fn().mockResolvedValue([]),
  getSynchronizationClientStatuses: vi.fn().mockResolvedValue([]),
}));
vi.mock("~/server/sync/retry-client-sync", () => ({
  retryClientSync: vi.fn(),
  FailedClientSyncTargetsNotFoundError: class FailedClientSyncTargetsNotFoundError extends Error {},
}));
vi.mock("~/server/sync/schedule-worker", () => ({
  scheduleSyncWorker: vi.fn(),
}));
vi.mock("~/server/sync/synchronization-queue", () => ({
  queueSynchronization: vi.fn(),
  SyncAlreadyRunningError: class SyncAlreadyRunningError extends Error {},
  SyncCooldownError: class SyncCooldownError extends Error {},
  SynchronizationClientNotFoundError: class SynchronizationClientNotFoundError extends Error {},
}));

const createCaller = createCallerFactory(synchronizationRouter);
const clientId = "00000000-0000-4000-8000-000000000002";
const queuedRun = {
  id: "00000000-0000-4000-8000-000000000001",
  requestedByUserId: "user-1",
  requestedClientId: clientId,
  mode: "fresh" as const,
  scope: "client" as const,
  trigger: "manual" as const,
  status: "running" as const,
  startedAt: new Date("2026-08-03T12:00:00.000Z"),
  heartbeatAt: new Date("2026-08-03T12:00:00.000Z"),
  completedAt: null,
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

describe("synchronization authorization", () => {
  beforeEach(() => {
    vi.mocked(queueSynchronization).mockReset().mockResolvedValue(queuedRun);
    vi.mocked(scheduleSyncWorker).mockReset();
    vi.mocked(resolveAccessibleClientScope)
      .mockReset()
      .mockResolvedValue({
        clientIds: [clientId],
        includeUnassigned: false,
      });
  });

  it("allows protected status access but keeps detailed history agency-only", async () => {
    await expect(callerFor("client").clientStatuses()).resolves.toEqual([]);
    await expect(callerFor("manager").clientStatuses()).resolves.toEqual([]);
    await expect(callerFor("owner").history()).resolves.toEqual([]);
    await expect(callerFor("admin").history()).resolves.toEqual([]);
    await expect(callerFor("client").history()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(null).clientStatuses()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it.each(["owner", "admin"] as const)(
    "allows %s to request Fresh Sync for all clients",
    async (role) => {
      await expect(callerFor(role).requestFresh({})).resolves.toEqual(
        queuedRun,
      );
      expect(queueSynchronization).toHaveBeenCalledWith({
        minimumIntervalMs: undefined,
        mode: "fresh",
        requestedByUserId: "user-1",
        scope: { kind: "all" },
        trigger: "manual",
      });
      expect(scheduleSyncWorker).toHaveBeenCalledWith(queuedRun.id);
    },
  );

  it("allows a client to request only a membership-scoped Fresh Sync", async () => {
    await expect(
      callerFor("client").requestFresh({ clientId }),
    ).resolves.toEqual(queuedRun);

    expect(resolveAccessibleClientScope).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", role: "client" }),
      clientId,
    );
    expect(queueSynchronization).toHaveBeenCalledWith(
      expect.objectContaining({
        minimumIntervalMs: 15 * 60 * 1_000,
        mode: "fresh",
        scope: { kind: "client", clientId },
      }),
    );
  });

  it("requires client users to choose one membership-scoped client", async () => {
    await expect(callerFor("client").requestFresh({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(queueSynchronization).not.toHaveBeenCalled();
  });

  it("fails closed when a client requests another client", async () => {
    vi.mocked(resolveAccessibleClientScope).mockRejectedValue(
      new TRPCError({ code: "NOT_FOUND" }),
    );

    await expect(
      callerFor("client").requestFresh({ clientId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(queueSynchronization).not.toHaveBeenCalled();
  });

  it("rejects manager and anonymous Fresh Sync requests", async () => {
    await expect(callerFor("manager").requestFresh({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(null).requestFresh({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("allows only the owner to request Full Sync", async () => {
    await expect(callerFor("owner").requestFull({ clientId })).resolves.toEqual(
      queuedRun,
    );
    expect(queueSynchronization).toHaveBeenCalledWith({
      mode: "full",
      requestedByUserId: "user-1",
      scope: { kind: "client", clientId },
      trigger: "manual",
    });

    for (const role of ["admin", "manager", "client"] as const) {
      await expect(
        callerFor(role).requestFull({ clientId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
