import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { parseSalesCommissionV2PercentageToBasisPoints } from "~/features/sales-commissions-v2/calculations";
import { normalizeAppointmentText } from "~/features/sales-commissions/calculations";
import { db } from "~/server/db";
import {
  clients,
  salesCommissionV2Categories,
  salesCommissionV2MappingRules,
  salesCommissionV2Settings,
} from "~/server/db/schema";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}

function requiredName(value: string, label: string): string {
  const name = value.trim();
  if (!name) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} is required`,
    });
  }
  return name;
}

function normalizedPercentage(value: string): string {
  try {
    const basisPoints = parseSalesCommissionV2PercentageToBasisPoints(value);
    return `${basisPoints / 100n}.${String(basisPoints % 100n).padStart(2, "0")}`;
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Commission percentage must be between 0 and 100",
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
      message: "At least one mapping keyword is required",
    });
  }
  return [...keywords.values()];
}

async function requireClient(clientId: string) {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) throw new TRPCError({ code: "NOT_FOUND" });
}

async function requireCategory(clientId: string, categoryId: string) {
  const [category] = await db
    .select({ id: salesCommissionV2Categories.id })
    .from(salesCommissionV2Categories)
    .where(
      and(
        eq(salesCommissionV2Categories.id, categoryId),
        eq(salesCommissionV2Categories.clientId, clientId),
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

async function requireMappingRule(clientId: string, ruleId: string) {
  const [rule] = await db
    .select({ id: salesCommissionV2MappingRules.id })
    .from(salesCommissionV2MappingRules)
    .where(
      and(
        eq(salesCommissionV2MappingRules.id, ruleId),
        eq(salesCommissionV2MappingRules.clientId, clientId),
      ),
    )
    .limit(1);
  if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
}

export async function saveSalesCommissionV2Settings(input: {
  clientId: string;
  attributionMode: "created_by" | "assigned_user" | "created_by_then_assigned";
  commissionPercentage: string;
}) {
  await requireClient(input.clientId);
  const commissionPercentage = normalizedPercentage(input.commissionPercentage);
  await db
    .insert(salesCommissionV2Settings)
    .values({
      clientId: input.clientId,
      attributionMode: input.attributionMode,
      commissionPercentage,
    })
    .onConflictDoUpdate({
      target: salesCommissionV2Settings.clientId,
      set: {
        attributionMode: input.attributionMode,
        commissionPercentage,
        updatedAt: new Date(),
      },
    });
  return { success: true as const };
}

export async function createSalesCommissionV2Category(input: {
  clientId: string;
  name: string;
  sortOrder: number;
}) {
  await requireClient(input.clientId);
  const name = requiredName(input.name, "Category name");
  const normalizedName = normalizeAppointmentText(name);
  if (!normalizedName) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Category name must contain letters or numbers",
    });
  }
  try {
    const [row] = await db
      .insert(salesCommissionV2Categories)
      .values({
        clientId: input.clientId,
        name,
        normalizedName,
        sortOrder: input.sortOrder,
      })
      .returning({ id: salesCommissionV2Categories.id });
    if (!row) throw new Error("V2 sales category insert returned no row");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has a category with that normalized name",
        cause: error,
      });
    }
    throw error;
  }
}

export async function updateSalesCommissionV2Category(input: {
  categoryId: string;
  clientId: string;
  name: string;
  sortOrder: number;
  status: "active" | "inactive";
}) {
  const name = requiredName(input.name, "Category name");
  const normalizedName = normalizeAppointmentText(name);
  if (!normalizedName) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Category name must contain letters or numbers",
    });
  }
  try {
    const rows = await db
      .update(salesCommissionV2Categories)
      .set({
        name,
        normalizedName,
        sortOrder: input.sortOrder,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesCommissionV2Categories.id, input.categoryId),
          eq(salesCommissionV2Categories.clientId, input.clientId),
        ),
      )
      .returning({ id: salesCommissionV2Categories.id });
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    return { success: true as const };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has a category with that normalized name",
        cause: error,
      });
    }
    throw error;
  }
}

export async function createSalesCommissionV2MappingRule(input: {
  clientId: string;
  categoryId: string;
  name: string;
  field: "category" | "service";
  keywords: string[];
  matchMode: "any" | "all";
  priority: number;
}) {
  await requireCategory(input.clientId, input.categoryId);
  try {
    const [row] = await db
      .insert(salesCommissionV2MappingRules)
      .values({
        clientId: input.clientId,
        categoryId: input.categoryId,
        name: requiredName(input.name, "Mapping rule name"),
        field: input.field,
        keywords: normalizedKeywords(input.keywords),
        matchMode: input.matchMode,
        priority: input.priority,
      })
      .returning({ id: salesCommissionV2MappingRules.id });
    if (!row) throw new Error("V2 mapping rule insert returned no row");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has a mapping rule with that name",
        cause: error,
      });
    }
    throw error;
  }
}

export async function updateSalesCommissionV2MappingRule(input: {
  ruleId: string;
  clientId: string;
  categoryId: string;
  name: string;
  field: "category" | "service";
  keywords: string[];
  matchMode: "any" | "all";
  priority: number;
  status: "active" | "inactive";
}) {
  await Promise.all([
    requireMappingRule(input.clientId, input.ruleId),
    requireCategory(input.clientId, input.categoryId),
  ]);
  try {
    await db
      .update(salesCommissionV2MappingRules)
      .set({
        categoryId: input.categoryId,
        name: requiredName(input.name, "Mapping rule name"),
        field: input.field,
        keywords: normalizedKeywords(input.keywords),
        matchMode: input.matchMode,
        priority: input.priority,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesCommissionV2MappingRules.id, input.ruleId),
          eq(salesCommissionV2MappingRules.clientId, input.clientId),
        ),
      );
    return { success: true as const };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has a mapping rule with that name",
        cause: error,
      });
    }
    throw error;
  }
}
