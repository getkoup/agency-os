import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAssignmentOptions,
  listAssignments,
  updateAssignment,
} from "~/features/assignments/server/service";
import { type UserRole } from "~/lib/roles";
import { assignmentsRouter } from "~/server/api/routers/assignments";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/assignments/server/service", () => ({
  getAssignmentOptions: vi.fn(),
  listAssignments: vi.fn(),
  updateAssignment: vi.fn(),
}));

const createCaller = createCallerFactory(assignmentsRouter);
const assignmentId = "536cb6e5-d7f5-4f77-b1a7-55fd75a6250b";

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

describe("assignments router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listAssignments).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(getAssignmentOptions).mockResolvedValue({
      statuses: [],
      tags: [],
      clients: [],
    });
    vi.mocked(updateAssignment).mockResolvedValue({
      id: assignmentId,
      updatedAt: new Date("2026-08-07T12:01:00.000Z"),
    });
  });

  it.each(["owner", "admin", "manager"] as const)(
    "allows %s to view assignments",
    async (role) => {
      await expect(
        callerFor(role).list({
          page: 1,
          pageSize: 25,
          reviewOnly: false,
          sort: "updated",
          direction: "desc",
        }),
      ).resolves.toEqual({ rows: [], total: 0 });
    },
  );

  it("blocks clients from assignment data", async () => {
    await expect(callerFor("client").options()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(getAssignmentOptions).not.toHaveBeenCalled();
  });

  it("allows staff to edit with the authenticated user audit ID", async () => {
    await callerFor("manager").update({
      id: assignmentId,
      expectedUpdatedAt: "2026-08-07T12:00:00.000Z",
      rawFilesUrl: "https://example.com/updated",
    });

    expect(updateAssignment).toHaveBeenCalledWith(
      {
        id: assignmentId,
        expectedUpdatedAt: "2026-08-07T12:00:00.000Z",
        rawFilesUrl: "https://example.com/updated",
      },
      "user-1",
    );
  });

  it("does not expose assignment deletion", () => {
    expect(Object.keys(assignmentsRouter._def.procedures).sort()).toEqual([
      "list",
      "options",
      "update",
    ]);
  });
});
