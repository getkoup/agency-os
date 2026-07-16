import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import {
  formatUsdCents,
  parseUsdToCents,
} from "~/features/revenue/calculations";
import { db } from "~/server/db";
import { clients, revenueRules } from "~/server/db/schema";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}

function normalizedRule(input: {
  clientId: string;
  tagName: string;
  revenueValue: string;
  serviceName?: string;
}) {
  const tagName = input.tagName.trim();
  let serviceName: string | null = input.serviceName?.trim() ?? null;
  if (serviceName === "") serviceName = null;
  if (!tagName) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tag is required" });
  }
  let revenueValue: string;
  try {
    revenueValue = formatUsdCents(parseUsdToCents(input.revenueValue));
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Revenue must be a non-negative USD value with at most two decimals",
      cause: error,
    });
  }
  return { clientId: input.clientId, tagName, revenueValue, serviceName };
}

async function requireClient(clientId: string) {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, clientId));
  if (!client) throw new TRPCError({ code: "NOT_FOUND" });
}

export async function createRevenueRule(input: {
  clientId: string;
  tagName: string;
  revenueValue: string;
  serviceName?: string;
}) {
  const value = normalizedRule(input);
  await requireClient(value.clientId);
  try {
    const [rule] = await db
      .insert(revenueRules)
      .values(value)
      .returning({ id: revenueRules.id });
    if (!rule) throw new Error("Revenue rule insert returned no row");
    return rule;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has a revenue rule for that tag",
        cause: error,
      });
    }
    throw error;
  }
}

export async function updateRevenueRule(input: {
  ruleId: string;
  clientId: string;
  tagName: string;
  revenueValue: string;
  serviceName?: string;
  status: "active" | "inactive";
}) {
  const value = normalizedRule(input);
  await requireClient(value.clientId);
  try {
    const rows = await db
      .update(revenueRules)
      .set({ ...value, status: input.status, updatedAt: new Date() })
      .where(and(eq(revenueRules.id, input.ruleId)))
      .returning({ id: revenueRules.id });
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    return { success: true as const };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This client already has a revenue rule for that tag",
        cause: error,
      });
    }
    throw error;
  }
}
