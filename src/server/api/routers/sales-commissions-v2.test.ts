import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSalesCommissionV2Category,
  createSalesCommissionV2MappingRule,
  removeSalespersonCommissionV2Rate,
  saveSalesCommissionV2Settings,
  updateSalesCommissionV2Category,
  updateSalesCommissionV2MappingRule,
  upsertSalespersonCommissionV2Rate,
} from "~/features/sales-commissions-v2/server/actions";
import {
  getSalesCommissionV2Report,
  getSalesCommissionV2Setup,
} from "~/features/sales-commissions-v2/server/queries";
import { type UserRole } from "~/lib/roles";
import { salesCommissionsV2Router } from "~/server/api/routers/sales-commissions-v2";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/sales-commissions-v2/server/queries", () => ({
  getSalesCommissionV2Report: vi.fn(),
  getSalesCommissionV2Setup: vi.fn(),
}));
vi.mock("~/features/sales-commissions-v2/server/actions", () => ({
  createSalesCommissionV2Category: vi.fn(),
  createSalesCommissionV2MappingRule: vi.fn(),
  removeSalespersonCommissionV2Rate: vi.fn(),
  saveSalesCommissionV2Settings: vi.fn(),
  updateSalesCommissionV2Category: vi.fn(),
  updateSalesCommissionV2MappingRule: vi.fn(),
  upsertSalespersonCommissionV2Rate: vi.fn(),
}));

const createCaller = createCallerFactory(salesCommissionsV2Router);
const clientId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";
const ruleId = "00000000-0000-4000-8000-000000000003";

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

describe("Sales & Commissions v2 router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSalesCommissionV2Report).mockResolvedValue({} as never);
    vi.mocked(getSalesCommissionV2Setup).mockResolvedValue({} as never);
    vi.mocked(createSalesCommissionV2Category).mockResolvedValue({
      id: categoryId,
    });
    vi.mocked(createSalesCommissionV2MappingRule).mockResolvedValue({
      id: ruleId,
    });
    vi.mocked(saveSalesCommissionV2Settings).mockResolvedValue({
      success: true,
    });
    vi.mocked(updateSalesCommissionV2Category).mockResolvedValue({
      success: true,
    });
    vi.mocked(updateSalesCommissionV2MappingRule).mockResolvedValue({
      success: true,
    });
    vi.mocked(upsertSalespersonCommissionV2Rate).mockResolvedValue({
      success: true,
    });
    vi.mocked(removeSalespersonCommissionV2Rate).mockResolvedValue({
      success: true,
    });
  });

  it.each(["owner", "admin", "manager"] as const)(
    "allows %s to view V2 reports",
    async (role) => {
      await callerFor(role).report({
        from: "2026-08-01",
        to: "2026-08-31",
        page: 1,
        pageSize: 25,
      });
      expect(getSalesCommissionV2Report).toHaveBeenCalledOnce();
    },
  );

  it("denies V2 report access to client users", async () => {
    await expect(
      callerFor("client").report({
        from: "2026-08-01",
        to: "2026-08-31",
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["owner", "admin"] as const)(
    "allows %s to configure V2 commissions",
    async (role) => {
      const caller = callerFor(role);
      await caller.setup({ clientId });
      await caller.saveSettings({
        clientId,
        attributionMode: "created_by",
      });
      await caller.createCategory({ clientId, name: "Ceramic", sortOrder: 0 });
      await caller.createMappingRule({
        clientId,
        categoryId,
        name: "CC abbreviation",
        field: "category",
        keywords: ["cc"],
        matchMode: "any",
        priority: 100,
      });
      await caller.upsertCommissionRate({
        clientId,
        salespersonExternalUserId: "michael-va",
        categoryId,
        commissionValue: "30.00",
      });
      expect(getSalesCommissionV2Setup).toHaveBeenCalledWith({ clientId });
      expect(saveSalesCommissionV2Settings).toHaveBeenCalledOnce();
      expect(createSalesCommissionV2Category).toHaveBeenCalledOnce();
      expect(createSalesCommissionV2MappingRule).toHaveBeenCalledOnce();
      expect(upsertSalespersonCommissionV2Rate).toHaveBeenCalledOnce();
    },
  );

  it("keeps every V2 configuration procedure unavailable to managers", async () => {
    const caller = callerFor("manager");
    await expect(caller.setup({ clientId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.saveSettings({ clientId, attributionMode: "created_by" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.createCategory({ clientId, name: "Ceramic", sortOrder: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.createMappingRule({
        clientId,
        categoryId,
        name: "CC abbreviation",
        field: "category",
        keywords: ["cc"],
        matchMode: "any",
        priority: 100,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.upsertCommissionRate({
        clientId,
        salespersonExternalUserId: "michael-va",
        categoryId,
        commissionValue: "30.00",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
