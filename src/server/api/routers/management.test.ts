import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assignUnassignedSourceAccounts,
  createManagedClient,
} from "~/features/management/server/actions";
import {
  listAccountAssignments,
  listManagedClients,
} from "~/features/management/server/queries";
import { type UserRole } from "~/lib/roles";
import { managementRouter } from "~/server/api/routers/management";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/management/server/actions", () => ({
  assignManagedSourceAccount: vi.fn(),
  assignUnassignedSourceAccounts: vi.fn(),
  createManagedClient: vi.fn(),
  createManagedUser: vi.fn(),
  resetManagedUserPassword: vi.fn(),
  updateManagedClient: vi.fn(),
  updateManagedUser: vi.fn(),
}));
vi.mock("~/features/management/server/queries", () => ({
  listAccountAssignments: vi.fn(),
  listClientOptions: vi.fn(),
  listManagedClients: vi.fn(),
  listManagedUsers: vi.fn(),
}));

const createCaller = createCallerFactory(managementRouter);
const clientId = "00000000-0000-4000-8000-000000000001";
const sourceAccountId = "00000000-0000-4000-8000-000000000002";

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
          user: currentUser,
          expires: new Date(Date.now() + 60_000).toISOString(),
        }
      : null,
    currentUser,
  });
}

describe("management client and account authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listManagedClients).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(listAccountAssignments).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(createManagedClient).mockResolvedValue({ id: clientId });
    vi.mocked(assignUnassignedSourceAccounts).mockResolvedValue({
      success: true,
    });
  });

  it.each(["owner", "admin"] as const)(
    "allows %s to create clients and assign accounts",
    async (role) => {
      await expect(
        callerFor(role).createClient({
          name: "New Client",
          sourceAccountIds: [sourceAccountId],
        }),
      ).resolves.toEqual({ id: clientId });
      await expect(
        callerFor(role).assignUnassignedSourceAccounts({
          clientId,
          sourceAccountIds: [sourceAccountId],
        }),
      ).resolves.toEqual({ success: true });
    },
  );

  it.each(["manager", "client"] as const)(
    "rejects %s management access",
    async (role) => {
      await expect(
        callerFor(role).createClient({
          name: "New Client",
          sourceAccountIds: [],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        callerFor(role).accountAssignments({ page: 1, pageSize: 25 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("keeps user management owner-only", async () => {
    await expect(
      callerFor("admin").users({ page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires at least one account for bulk assignment", async () => {
    await expect(
      callerFor("owner").assignUnassignedSourceAccounts({
        clientId,
        sourceAccountIds: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(assignUnassignedSourceAccounts).not.toHaveBeenCalled();
  });
});
