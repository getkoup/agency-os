import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRevenueRule,
  updateRevenueRule,
} from "~/features/settings/server/actions";
import {
  getGhlConfigurationStatus,
  listRevenueRules,
} from "~/features/settings/server/queries";
import { settingsRouter } from "~/server/api/routers/settings";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/settings/server/actions", () => ({
  createRevenueRule: vi.fn(),
  updateRevenueRule: vi.fn(),
}));
vi.mock("~/features/settings/server/queries", () => ({
  listRevenueRules: vi.fn(),
  getGhlConfigurationStatus: vi.fn(),
}));

const createCaller = createCallerFactory(settingsRouter);

function callerFor(role: "owner" | "admin" | "client" | null) {
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

const clientId = "00000000-0000-4000-8000-000000000001";

describe("settings router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listRevenueRules).mockResolvedValue({
      rows: [],
      total: 0,
      clientOptions: [],
    });
    vi.mocked(getGhlConfigurationStatus).mockResolvedValue([
      {
        clientSlug: "tint-lab",
        clientName: "Tint Lab",
        mappingState: "active",
        locationConfigured: true,
        tokenConfigured: true,
        lastSuccessfulSyncAt: null,
      },
      {
        clientSlug: "diamond-auto-restoration",
        clientName: "Diamond Auto Restoration",
        mappingState: "missing_mapping",
        locationConfigured: false,
        tokenConfigured: false,
        lastSuccessfulSyncAt: null,
      },
    ]);
    vi.mocked(createRevenueRule).mockResolvedValue({ id: "rule-1" });
  });

  it.each(["owner", "admin"] as const)(
    "allows %s revenue/settings access",
    async (role) => {
      await expect(
        callerFor(role).revenueRules({ page: 1, pageSize: 25 }),
      ).resolves.toMatchObject({ total: 0 });
      const status = await callerFor(role).ghlConfigurationStatus();
      expect(status).toHaveLength(2);
      expect(JSON.stringify(status)).not.toMatch(/locationId|token\"|private/i);
    },
  );

  it("rejects client access", async () => {
    await expect(
      callerFor("client").revenueRules({ page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates non-negative exact USD input before the action", async () => {
    await expect(
      callerFor("admin").createRevenueRule({
        clientId,
        tagName: "Qualified",
        revenueValue: "-1",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createRevenueRule).not.toHaveBeenCalled();
  });

  it("preserves safe duplicate-rule conflicts", async () => {
    vi.mocked(createRevenueRule).mockRejectedValue(
      new TRPCError({
        code: "CONFLICT",
        message: "This client already has a revenue rule for that tag",
      }),
    );
    await expect(
      callerFor("owner").createRevenueRule({
        clientId,
        tagName: "Qualified",
        revenueValue: "125.50",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This client already has a revenue rule for that tag",
    });
  });

  it("validates update identifiers and status", async () => {
    await expect(
      callerFor("admin").updateRevenueRule({
        ruleId: "not-a-uuid",
        clientId,
        tagName: "Qualified",
        revenueValue: "125.50",
        status: "active",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRevenueRule).not.toHaveBeenCalled();
  });
});
