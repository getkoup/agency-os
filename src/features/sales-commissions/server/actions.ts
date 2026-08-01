import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { normalizeAppointmentText } from "~/features/sales-commissions/calculations";
import {
  formatUsdCents,
  parseUsdToCents,
} from "~/features/revenue/calculations";
import { db } from "~/server/db";
import {
  clients,
  salesCategories,
  salesCommissionSettings,
  salesOffers,
  salespeople,
  salespersonCommissionRates,
} from "~/server/db/schema";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}

async function requireClient(clientId: string) {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) throw new TRPCError({ code: "NOT_FOUND" });
}

function normalizedName(value: string, label: string): string {
  const name = value.trim();
  if (!name) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} is required`,
    });
  }
  return name;
}

function normalizedMoney(value: string, label: string): string {
  try {
    return formatUsdCents(parseUsdToCents(value));
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} must be a non-negative USD value with at most two decimals`,
      cause: error,
    });
  }
}

function normalizedKeywords(values: readonly string[]): string[] {
  const keywords = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    const normalized = normalizeAppointmentText(trimmed);
    if (trimmed && normalized && !keywords.has(normalized)) {
      keywords.set(normalized, trimmed);
    }
  }
  if (keywords.size === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "At least one offer keyword is required",
    });
  }
  return [...keywords.values()];
}

export async function saveSalesCommissionSettings(input: {
  clientId: string;
  attributionMode: "created_by" | "assigned_user" | "created_by_then_assigned";
}) {
  await requireClient(input.clientId);
  await db
    .insert(salesCommissionSettings)
    .values(input)
    .onConflictDoUpdate({
      target: salesCommissionSettings.clientId,
      set: { attributionMode: input.attributionMode, updatedAt: new Date() },
    });
  return { success: true as const };
}

export async function createSalesCategory(input: {
  clientId: string;
  name: string;
  sortOrder: number;
}) {
  await requireClient(input.clientId);
  try {
    const [row] = await db
      .insert(salesCategories)
      .values({
        clientId: input.clientId,
        name: normalizedName(input.name, "Category name"),
        sortOrder: input.sortOrder,
      })
      .returning({ id: salesCategories.id });
    if (!row) throw new Error("Sales category insert returned no row");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has a category with that name",
        cause: error,
      });
    }
    throw error;
  }
}

export async function updateSalesCategory(input: {
  categoryId: string;
  clientId: string;
  name: string;
  sortOrder: number;
  status: "active" | "inactive";
}) {
  try {
    const rows = await db
      .update(salesCategories)
      .set({
        name: normalizedName(input.name, "Category name"),
        sortOrder: input.sortOrder,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesCategories.id, input.categoryId),
          eq(salesCategories.clientId, input.clientId),
        ),
      )
      .returning({ id: salesCategories.id });
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    return { success: true as const };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has a category with that name",
        cause: error,
      });
    }
    throw error;
  }
}

async function requireCategory(clientId: string, categoryId: string) {
  const [category] = await db
    .select({ id: salesCategories.id })
    .from(salesCategories)
    .where(
      and(
        eq(salesCategories.id, categoryId),
        eq(salesCategories.clientId, clientId),
      ),
    )
    .limit(1);
  if (!category) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Category does not belong to this client",
    });
  }
}

export async function createSalesOffer(input: {
  clientId: string;
  categoryId: string;
  name: string;
  keywords: string[];
  matchMode: "any" | "all";
  priority: number;
  revenueValue: string;
}) {
  await requireCategory(input.clientId, input.categoryId);
  try {
    const [row] = await db
      .insert(salesOffers)
      .values({
        clientId: input.clientId,
        categoryId: input.categoryId,
        name: normalizedName(input.name, "Offer name"),
        keywords: normalizedKeywords(input.keywords),
        matchMode: input.matchMode,
        priority: input.priority,
        revenueValue: normalizedMoney(input.revenueValue, "Attributed revenue"),
      })
      .returning({ id: salesOffers.id });
    if (!row) throw new Error("Sales offer insert returned no row");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has an offer with that name",
        cause: error,
      });
    }
    throw error;
  }
}

export async function updateSalesOffer(input: {
  offerId: string;
  clientId: string;
  categoryId: string;
  name: string;
  keywords: string[];
  matchMode: "any" | "all";
  priority: number;
  revenueValue: string;
  status: "active" | "inactive";
}) {
  await requireCategory(input.clientId, input.categoryId);
  try {
    const rows = await db
      .update(salesOffers)
      .set({
        categoryId: input.categoryId,
        name: normalizedName(input.name, "Offer name"),
        keywords: normalizedKeywords(input.keywords),
        matchMode: input.matchMode,
        priority: input.priority,
        revenueValue: normalizedMoney(input.revenueValue, "Attributed revenue"),
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesOffers.id, input.offerId),
          eq(salesOffers.clientId, input.clientId),
        ),
      )
      .returning({ id: salesOffers.id });
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    return { success: true as const };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has an offer with that name",
        cause: error,
      });
    }
    throw error;
  }
}

export async function updateSalesperson(input: {
  clientId: string;
  salespersonId: string;
  displayName: string;
  status: "active" | "inactive";
}) {
  const rows = await db
    .update(salespeople)
    .set({
      displayName: normalizedName(input.displayName, "Salesperson name"),
      nameIsPlaceholder: false,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(salespeople.id, input.salespersonId),
        eq(salespeople.clientId, input.clientId),
      ),
    )
    .returning({ id: salespeople.id });
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
  return { success: true as const };
}

export async function upsertSalespersonCommissionRate(input: {
  clientId: string;
  salespersonId: string;
  categoryId: string;
  commissionValue: string;
}) {
  const [[person], [category]] = await Promise.all([
    db
      .select({ id: salespeople.id })
      .from(salespeople)
      .where(
        and(
          eq(salespeople.id, input.salespersonId),
          eq(salespeople.clientId, input.clientId),
        ),
      )
      .limit(1),
    db
      .select({ id: salesCategories.id })
      .from(salesCategories)
      .where(
        and(
          eq(salesCategories.id, input.categoryId),
          eq(salesCategories.clientId, input.clientId),
        ),
      )
      .limit(1),
  ]);
  if (!person || !category) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Salesperson and category must belong to the selected client",
    });
  }
  const commissionValue = normalizedMoney(input.commissionValue, "Commission");
  await db
    .insert(salespersonCommissionRates)
    .values({ ...input, commissionValue })
    .onConflictDoUpdate({
      target: [
        salespersonCommissionRates.salespersonId,
        salespersonCommissionRates.categoryId,
      ],
      set: { commissionValue, updatedAt: new Date() },
    });
  return { success: true as const };
}

export async function removeSalespersonCommissionRate(input: {
  clientId: string;
  salespersonId: string;
  categoryId: string;
}) {
  await db
    .delete(salespersonCommissionRates)
    .where(
      and(
        eq(salespersonCommissionRates.clientId, input.clientId),
        eq(salespersonCommissionRates.salespersonId, input.salespersonId),
        eq(salespersonCommissionRates.categoryId, input.categoryId),
      ),
    );
  return { success: true as const };
}
