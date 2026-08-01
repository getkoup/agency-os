import { beforeEach, describe, expect, it, vi } from "vitest";

import { type UserRole } from "~/lib/roles";
import {
  createSalesCategory,
  saveSalesCommissionSettings,
} from "~/features/sales-commissions/server/actions";
import {
  getSalesCommissionReport,
  getSalesCommissionSetup,
} from "~/features/sales-commissions/server/queries";
import { salesCommissionsRouter } from "~/server/api/routers/sales-commissions";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/sales-commissions/server/queries", () => ({
  getSalesCommissionReport: vi.fn(),
  getSalesCommissionSetup: vi.fn(),
}));
vi.mock("~/features/sales-commissions/server/actions", () => ({
  createSalesCategory: vi.fn(),
  createSalesOffer: vi.fn(),
  removeSalespersonCommissionRate: vi.fn(),
  saveSalesCommissionSettings: vi.fn(),
  updateSalesCategory: vi.fn(),
  updateSalesOffer: vi.fn(),
  updateSalesperson: vi.fn(),
  upsertSalespersonCommissionRate: vi.fn(),
}));

const createCaller = createCallerFactory(salesCommissionsRouter);
const clientId = "00000000-0000-4000-8000-000000000001";

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

describe("sales commissions router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSalesCommissionReport).mockResolvedValue({} as never);
    vi.mocked(getSalesCommissionSetup).mockResolvedValue({} as never);
    vi.mocked(createSalesCategory).mockResolvedValue({ id: "category-1" });
    vi.mocked(saveSalesCommissionSettings).mockResolvedValue({ success: true });
  });

  it.each(["owner", "admin", "manager"] as const)(
    "allows %s to view reports",
    async (role) => {
      await callerFor(role).report({
        from: "2026-07-01",
        to: "2026-07-31",
        page: 1,
        pageSize: 25,
      });
      expect(getSalesCommissionReport).toHaveBeenCalledOnce();
    },
  );

  it("denies report access to client users", async () => {
    await expect(
      callerFor("client").report({
        from: "2026-07-01",
        to: "2026-07-31",
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["owner", "admin"] as const)(
    "allows %s to configure commissions",
    async (role) => {
      await callerFor(role).setup({ clientId });
      await callerFor(role).saveSettings({
        clientId,
        attributionMode: "created_by",
      });
      await callerFor(role).createCategory({
        clientId,
        name: "Ceramic",
        sortOrder: 0,
      });
      expect(getSalesCommissionSetup).toHaveBeenCalledWith({ clientId });
      expect(saveSalesCommissionSettings).toHaveBeenCalledOnce();
      expect(createSalesCategory).toHaveBeenCalledOnce();
    },
  );

  it("keeps configuration unavailable to managers", async () => {
    await expect(
      callerFor("manager").setup({ clientId }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      callerFor("manager").createCategory({
        clientId,
        name: "Ceramic",
        sortOrder: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
