import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type UserRole } from "~/lib/roles";
import {
  createLeadClassificationRule,
  createRevenueRule,
  removeGhlClientConfiguration,
  saveGhlClientConfiguration,
  updateLeadClassificationRule,
  updateRevenueRule,
} from "~/features/settings/server/actions";
import {
  getGhlConfigurationStatus,
  listLeadClassificationRules,
  listRevenueRules,
} from "~/features/settings/server/queries";
import { settingsRouter } from "~/server/api/routers/settings";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/settings/server/actions", () => ({
  createLeadClassificationRule: vi.fn(),
  createRevenueRule: vi.fn(),
  removeGhlClientConfiguration: vi.fn(),
  saveGhlClientConfiguration: vi.fn(),
  updateLeadClassificationRule: vi.fn(),
  updateRevenueRule: vi.fn(),
}));
vi.mock("~/features/settings/server/queries", () => ({
  listLeadClassificationRules: vi.fn(),
  listRevenueRules: vi.fn(),
  getGhlConfigurationStatus: vi.fn(),
}));

const createCaller = createCallerFactory(settingsRouter);

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

const clientId = "00000000-0000-4000-8000-000000000001";

describe("settings router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listLeadClassificationRules).mockResolvedValue({
      rows: [],
      clientOptions: [],
      preview: [],
    });
    vi.mocked(listRevenueRules).mockResolvedValue({
      rows: [],
      total: 0,
      clientOptions: [],
    });
    vi.mocked(getGhlConfigurationStatus).mockResolvedValue([
      {
        clientId,
        clientSlug: "tint-lab",
        clientName: "Tint Lab",
        clientStatus: "active",
        mappingState: "active",
        configured: true,
        locationId: "location-1",
        timezone: "America/New_York",
        tokenHint: "••••oken",
        configurationUpdatedAt: new Date(),
        lastSuccessfulSyncAt: null,
      },
    ]);
    vi.mocked(createLeadClassificationRule).mockResolvedValue({
      id: "classification-rule-1",
    });
    vi.mocked(createRevenueRule).mockResolvedValue({ id: "rule-1" });
    vi.mocked(saveGhlClientConfiguration).mockResolvedValue({
      success: true,
      timezone: "America/New_York",
    });
    vi.mocked(removeGhlClientConfiguration).mockResolvedValue({
      success: true,
    });
  });

  it.each(["owner", "admin"] as const)(
    "allows %s revenue/settings access",
    async (role) => {
      await expect(
        callerFor(role).revenueRules({ page: 1, pageSize: 25 }),
      ).resolves.toMatchObject({ total: 0 });
      await expect(
        callerFor(role).leadClassificationRules({ limit: 100 }),
      ).resolves.toMatchObject({ rows: [] });
    },
  );

  it("keeps GHL credential management owner-only", async () => {
    const status = await callerFor("owner").ghlConfigurationStatus();
    expect(status).toHaveLength(1);
    expect(JSON.stringify(status)).not.toMatch(
      /encryptedToken|tokenIv|tokenAuthTag/i,
    );
    await callerFor("owner").saveGhlConfiguration({
      clientId,
      locationId: "location-1",
      token: "pit-private-token",
    });
    expect(saveGhlClientConfiguration).toHaveBeenCalledWith({
      clientId,
      locationId: "location-1",
      token: "pit-private-token",
      userId: "user-1",
    });
    await expect(
      callerFor("admin").ghlConfigurationStatus(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerFor("admin").saveGhlConfiguration({
        clientId,
        locationId: "location-1",
        token: "pit-private-token",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["manager", "client"] as const)("rejects %s access", async (role) => {
    await expect(
      callerFor(role).revenueRules({ page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows owners to manage classification rules", async () => {
    await callerFor("owner").createLeadClassificationRule({
      clientId,
      categoryName: "Tint",
      keywords: ["tint"],
      matchMode: "any",
      priority: 100,
    });
    expect(createLeadClassificationRule).toHaveBeenCalledWith({
      clientId,
      categoryName: "Tint",
      keywords: ["tint"],
      matchMode: "any",
      priority: 100,
    });
  });

  it("prevents admins from changing classification rules", async () => {
    await expect(
      callerFor("admin").updateLeadClassificationRule({
        ruleId: "00000000-0000-4000-8000-000000000002",
        clientId,
        categoryName: "Tint",
        keywords: ["tint"],
        matchMode: "any",
        priority: 100,
        status: "active",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateLeadClassificationRule).not.toHaveBeenCalled();
  });

  it("validates classification keywords before the action", async () => {
    await expect(
      callerFor("owner").createLeadClassificationRule({
        clientId,
        categoryName: "Tint",
        keywords: [],
        matchMode: "any",
        priority: 100,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createLeadClassificationRule).not.toHaveBeenCalled();
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
