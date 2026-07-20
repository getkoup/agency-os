import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { normalizeCampaignText } from "~/features/dashboard/lead-classification";
import {
  formatUsdCents,
  parseUsdToCents,
} from "~/features/revenue/calculations";
import { db } from "~/server/db";
import {
  clients,
  ghlClientConfigurations,
  integrationMappings,
  leadClassificationRules,
  revenueRules,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import { encryptGhlToken } from "~/server/ghl/credentials";
import { parseGhlBaseUrl } from "~/server/ghl/env";

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

function normalizedClassificationRule(input: {
  clientId: string;
  categoryName: string;
  keywords: string[];
  matchMode: "any" | "all";
  priority: number;
}) {
  const categoryName = input.categoryName.trim();
  if (!categoryName || categoryName.toLowerCase() === "uncategorized") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use a category name other than Uncategorized",
    });
  }
  const keywords = [
    ...new Set(
      input.keywords
        .map(normalizeCampaignText)
        .filter((keyword) => keyword.length > 0),
    ),
  ];
  if (keywords.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "At least one keyword is required",
    });
  }
  return {
    clientId: input.clientId,
    categoryName,
    keywords,
    matchMode: input.matchMode,
    priority: input.priority,
  };
}

export async function createLeadClassificationRule(input: {
  clientId: string;
  categoryName: string;
  keywords: string[];
  matchMode: "any" | "all";
  priority: number;
}) {
  const value = normalizedClassificationRule(input);
  await requireClient(value.clientId);
  try {
    const [rule] = await db
      .insert(leadClassificationRules)
      .values(value)
      .returning({ id: leadClassificationRules.id });
    if (!rule)
      throw new Error("Lead classification rule insert returned no row");
    return rule;
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

export async function updateLeadClassificationRule(input: {
  ruleId: string;
  clientId: string;
  categoryName: string;
  keywords: string[];
  matchMode: "any" | "all";
  priority: number;
  status: "active" | "inactive";
}) {
  const value = normalizedClassificationRule(input);
  await requireClient(value.clientId);
  try {
    const rows = await db
      .update(leadClassificationRules)
      .set({ ...value, status: input.status, updatedAt: new Date() })
      .where(eq(leadClassificationRules.id, input.ruleId))
      .returning({ id: leadClassificationRules.id });
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

export async function saveGhlClientConfiguration(input: {
  clientId: string;
  locationId: string;
  token: string;
  userId: string | null;
}) {
  const locationId = input.locationId.trim();
  const token = input.token.trim();
  const [[client], [mapping]] = await Promise.all([
    db
      .select({ status: clients.status })
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1),
    db
      .select({ locationId: integrationMappings.externalLocationId })
      .from(integrationMappings)
      .where(
        and(
          eq(integrationMappings.clientId, input.clientId),
          eq(integrationMappings.provider, "ghl"),
        ),
      )
      .limit(1),
  ]);
  if (client?.status !== "active") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "GHL can only be configured for an active client",
    });
  }
  if (mapping && mapping.locationId !== locationId) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This client already has synchronized GHL history for a different Location ID",
    });
  }
  let timezone: string;
  try {
    timezone = await new GhlClient(parseGhlBaseUrl()).locationTimezone({
      locationId,
      token,
    });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "GHL Location ID and token could not be verified",
      cause: error,
    });
  }
  const encrypted = encryptGhlToken({
    clientId: input.clientId,
    locationId,
    token,
  });
  try {
    await db
      .insert(ghlClientConfigurations)
      .values({
        clientId: input.clientId,
        locationId,
        timezone,
        ...encrypted,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
      })
      .onConflictDoUpdate({
        target: ghlClientConfigurations.clientId,
        set: {
          locationId,
          timezone,
          ...encrypted,
          updatedByUserId: input.userId,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This GHL Location ID is already assigned to another client",
        cause: error,
      });
    }
    throw error;
  }
  return { success: true as const, timezone };
}

export async function removeGhlClientConfiguration(clientId: string) {
  await db
    .delete(ghlClientConfigurations)
    .where(eq(ghlClientConfigurations.clientId, clientId));
  return { success: true as const };
}
