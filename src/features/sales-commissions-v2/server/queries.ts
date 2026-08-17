import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import {
  calculateSalesCommissionV2Financials,
  matchSalesCommissionV2Category,
  parseSalesCommissionV2Description,
  parseSalesCommissionV2Price,
  type SalesCommissionV2CategoryInput,
  type SalesCommissionV2MappingRuleInput,
  type SalesCommissionV2ReviewReason,
} from "~/features/sales-commissions-v2/calculations";
import {
  formatUsdCents,
  parseUsdToCents,
} from "~/features/revenue/calculations";
import {
  resolveCreditedExternalUserId,
  type SalespersonAttributionMode,
} from "~/features/sales-commissions/calculations";
import {
  agencyReportingTimezoneSql,
  getAgencyReportingContext,
} from "~/features/settings/server/reporting-timezone";
import { db } from "~/server/db";
import {
  clients,
  ghlAppointments,
  ghlContacts,
  globalSalespeople,
  globalSalespersonIdentities,
  integrationMappings,
  salesCommissionV2Categories,
  salesCommissionV2MappingRules,
  salesCommissionV2Settings,
  salespeople,
} from "~/server/db/schema";

const MAX_REPORT_APPOINTMENTS = 10_000;

export type AppointmentStatus =
  "new" | "confirmed" | "showed" | "cancelled" | "noshow" | "invalid";

export type SalesCommissionV2ReportInput = {
  from: string;
  to: string;
  clientId?: string;
  globalSalespersonId?: string;
  attentionView?: "salesperson" | "client";
  selectedGlobalSalespersonKey?: string;
  selectedClientId?: string;
  status?: AppointmentStatus;
  categoryId?: string;
  review?: "ready" | "needs_review";
  page: number;
  pageSize: number;
};

type MoneySummary = {
  appointments: number;
  showed: number;
  noShows: number;
  attributedRevenueCents: bigint;
  missedRevenueCents: bigint;
  commissionCents: bigint;
  needsReview: number;
  needsAttention: number;
  eligibleBookings: number;
  eligibleByStatus: Record<AppointmentStatus, number>;
};

type CategoryGroup = {
  id: string | null;
  name: string;
  summary: MoneySummary;
};

type SalespersonGroup = {
  id: string | null;
  name: string;
  isUnnamed: boolean;
  hasCustomDisplayName: boolean;
  summary: MoneySummary;
  categories: Map<string, CategoryGroup>;
};

type ClientGroup = {
  id: string;
  name: string;
  summary: MoneySummary;
  salespeople: Map<string, SalespersonGroup>;
};

type GlobalSalespersonClientGroup = {
  id: string;
  name: string;
  localSalespersonNames: Set<string>;
  summary: MoneySummary;
  categories: Map<string, CategoryGroup>;
};

type GlobalSalespersonGroup = {
  id: string | null;
  name: string;
  isUnnamed: boolean;
  hasCustomDisplayName: boolean;
  summary: MoneySummary;
  clients: Map<string, GlobalSalespersonClientGroup>;
  key: string;
};

function emptySummary(): MoneySummary {
  return {
    appointments: 0,
    showed: 0,
    noShows: 0,
    attributedRevenueCents: 0n,
    missedRevenueCents: 0n,
    commissionCents: 0n,
    needsReview: 0,
    needsAttention: 0,
    eligibleBookings: 0,
    eligibleByStatus: {
      new: 0,
      confirmed: 0,
      showed: 0,
      cancelled: 0,
      noshow: 0,
      invalid: 0,
    },
  };
}

function addRowToSummary(
  summary: MoneySummary,
  row: {
    status: AppointmentStatus;
    attributedRevenue: string;
    missedRevenue: string;
    commission: string;
    needsReview: boolean;
    needsAttention: boolean;
  },
) {
  summary.appointments += 1;
  if (row.status === "showed") summary.showed += 1;
  if (row.status === "noshow") summary.noShows += 1;
  summary.attributedRevenueCents += parseUsdToCents(row.attributedRevenue);
  summary.missedRevenueCents += parseUsdToCents(row.missedRevenue);
  summary.commissionCents += parseUsdToCents(row.commission);
  if (row.needsReview) summary.needsReview += 1;
  if (row.needsAttention) summary.needsAttention += 1;
  if (!row.needsAttention) {
    summary.eligibleBookings += 1;
    summary.eligibleByStatus[row.status] += 1;
  }
}

function presentSummary(summary: MoneySummary) {
  return {
    appointments: summary.appointments,
    showed: summary.showed,
    noShows: summary.noShows,
    showRate:
      summary.appointments === 0 ? 0 : summary.showed / summary.appointments,
    attributedRevenue: formatUsdCents(summary.attributedRevenueCents),
    missedRevenue: formatUsdCents(summary.missedRevenueCents),
    commission: formatUsdCents(summary.commissionCents),
    needsReview: summary.needsReview,
    needsAttention: summary.needsAttention,
    eligibleBookings: summary.eligibleBookings,
    eligibleByStatus: summary.eligibleByStatus,
  };
}

function reportDateRangeIsValid(from: string, to: string): boolean {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  return days >= 0 && days <= 366;
}

function addReviewReason(
  reviewReasons: SalesCommissionV2ReviewReason[],
  reason: SalesCommissionV2ReviewReason,
) {
  if (!reviewReasons.includes(reason)) reviewReasons.push(reason);
}

export async function getSalesCommissionV2Report(
  input: SalesCommissionV2ReportInput,
) {
  if (!reportDateRangeIsValid(input.from, input.to)) {
    throw new Error(
      "Sales commission date range must be between 1 and 367 days",
    );
  }

  const appointmentCreatedDate = sql<string>`timezone(${agencyReportingTimezoneSql}, ${ghlAppointments.providerCreatedAt})::date`;
  const appointmentConditions = and(
    eq(ghlAppointments.deleted, false),
    eq(clients.status, "active"),
    gte(appointmentCreatedDate, input.from),
    lte(appointmentCreatedDate, input.to),
    input.clientId ? eq(clients.id, input.clientId) : undefined,
    input.status ? eq(ghlAppointments.status, input.status) : undefined,
  );

  const [
    reportingContext,
    appointmentRows,
    clientRows,
    settingRows,
    salespersonRows,
    categoryRows,
    ruleRows,
  ] = await Promise.all([
    getAgencyReportingContext(),
    db
      .select({
        id: ghlAppointments.id,
        clientId: clients.id,
        clientName: clients.name,
        timezone: agencyReportingTimezoneSql,
        contactName: ghlContacts.fullName,
        status: ghlAppointments.status,
        title: ghlAppointments.title,
        description: ghlAppointments.description,
        assignedUserExternalId: ghlAppointments.assignedUserExternalId,
        createdByUserExternalId: ghlAppointments.createdByUserExternalId,
        createdBySource: ghlAppointments.createdBySource,
        startsAt: ghlAppointments.startsAt,
        bookedAt: ghlAppointments.providerCreatedAt,
      })
      .from(ghlAppointments)
      .innerJoin(
        integrationMappings,
        eq(ghlAppointments.integrationMappingId, integrationMappings.id),
      )
      .innerJoin(clients, eq(integrationMappings.clientId, clients.id))
      .innerJoin(ghlContacts, eq(ghlAppointments.contactId, ghlContacts.id))
      .where(appointmentConditions)
      .orderBy(
        desc(ghlAppointments.providerCreatedAt),
        desc(ghlAppointments.id),
      )
      .limit(MAX_REPORT_APPOINTMENTS + 1),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.status, "active"))
      .orderBy(asc(clients.name)),
    db
      .select({
        clientId: salesCommissionV2Settings.clientId,
        attributionMode: salesCommissionV2Settings.attributionMode,
        commissionPercentage: salesCommissionV2Settings.commissionPercentage,
      })
      .from(salesCommissionV2Settings),
    db
      .select({
        id: salespeople.id,
        clientId: salespeople.clientId,
        externalUserId: salespeople.externalUserId,
        providerName: salespeople.providerName,
        displayName: salespeople.displayName,
        status: salespeople.status,
        globalSalespersonId: globalSalespersonIdentities.globalSalespersonId,
        globalDisplayName: globalSalespeople.displayName,
      })
      .from(salespeople)
      .leftJoin(
        globalSalespersonIdentities,
        and(
          eq(globalSalespersonIdentities.provider, "ghl"),
          eq(
            globalSalespersonIdentities.externalUserId,
            salespeople.externalUserId,
          ),
        ),
      )
      .leftJoin(
        globalSalespeople,
        eq(
          globalSalespersonIdentities.globalSalespersonId,
          globalSalespeople.id,
        ),
      )
      .orderBy(
        asc(
          sql`coalesce(${salespeople.displayName}, ${salespeople.providerName}, ${salespeople.externalUserId})`,
        ),
        asc(salespeople.id),
      ),
    db
      .select({
        id: salesCommissionV2Categories.id,
        clientId: salesCommissionV2Categories.clientId,
        name: salesCommissionV2Categories.name,
        normalizedName: salesCommissionV2Categories.normalizedName,
      })
      .from(salesCommissionV2Categories)
      .where(eq(salesCommissionV2Categories.status, "active"))
      .orderBy(
        asc(salesCommissionV2Categories.sortOrder),
        asc(salesCommissionV2Categories.name),
      ),
    db
      .select({
        id: salesCommissionV2MappingRules.id,
        clientId: salesCommissionV2MappingRules.clientId,
        categoryId: salesCommissionV2MappingRules.categoryId,
        categoryName: salesCommissionV2Categories.name,
        name: salesCommissionV2MappingRules.name,
        field: salesCommissionV2MappingRules.field,
        keywords: salesCommissionV2MappingRules.keywords,
        matchMode: salesCommissionV2MappingRules.matchMode,
        priority: salesCommissionV2MappingRules.priority,
      })
      .from(salesCommissionV2MappingRules)
      .innerJoin(
        salesCommissionV2Categories,
        eq(
          salesCommissionV2MappingRules.categoryId,
          salesCommissionV2Categories.id,
        ),
      )
      .where(
        and(
          eq(salesCommissionV2MappingRules.status, "active"),
          eq(salesCommissionV2Categories.status, "active"),
        ),
      )
      .orderBy(
        desc(salesCommissionV2MappingRules.priority),
        asc(salesCommissionV2MappingRules.name),
      ),
  ]);

  const isTruncated = appointmentRows.length > MAX_REPORT_APPOINTMENTS;
  const appointments = appointmentRows.slice(0, MAX_REPORT_APPOINTMENTS);
  const settingsByClient = new Map(
    settingRows.map((row) => [row.clientId, row]),
  );
  const salespersonByExternalId = new Map(
    salespersonRows.map((row) => [
      `${row.clientId}:${row.externalUserId}`,
      row,
    ]),
  );
  const salespersonRowsByGlobalId = new Map<string, typeof salespersonRows>();
  for (const salesperson of salespersonRows) {
    if (!salesperson.globalSalespersonId) continue;
    const values =
      salespersonRowsByGlobalId.get(salesperson.globalSalespersonId) ?? [];
    values.push(salesperson);
    salespersonRowsByGlobalId.set(salesperson.globalSalespersonId, values);
  }
  const globalSalespersonById = new Map(
    [...salespersonRowsByGlobalId].map(([id, rows]) => {
      const globalDisplayName = rows.find(
        (row) => row.globalDisplayName,
      )?.globalDisplayName;
      const providerName = rows.find((row) => row.providerName)?.providerName;
      const localDisplayName = rows.find((row) => row.displayName)?.displayName;
      return [
        id,
        {
          id,
          name:
            globalDisplayName ??
            providerName ??
            localDisplayName ??
            `Unnamed • ${id.slice(-6)}`,
          isUnnamed: !globalDisplayName && !providerName && !localDisplayName,
          hasCustomDisplayName: Boolean(globalDisplayName),
          clientIds: new Set(rows.map((row) => row.clientId)),
        },
      ] as const;
    }),
  );

  const categoriesByClient = new Map<
    string,
    SalesCommissionV2CategoryInput[]
  >();
  for (const category of categoryRows) {
    const values = categoriesByClient.get(category.clientId) ?? [];
    values.push(category);
    categoriesByClient.set(category.clientId, values);
  }
  const rulesByClient = new Map<string, SalesCommissionV2MappingRuleInput[]>();
  for (const rule of ruleRows) {
    const values = rulesByClient.get(rule.clientId) ?? [];
    values.push(rule);
    rulesByClient.set(rule.clientId, values);
  }

  const evaluatedRows = appointments
    .map((appointment) => {
      const clientSettings = settingsByClient.get(appointment.clientId);
      const mode: SalespersonAttributionMode =
        clientSettings?.attributionMode ?? "created_by";
      const externalUserId = resolveCreditedExternalUserId({
        mode,
        createdByUserExternalId: appointment.createdByUserExternalId,
        assignedUserExternalId: appointment.assignedUserExternalId,
      });
      const salesperson = externalUserId
        ? (salespersonByExternalId.get(
            `${appointment.clientId}:${externalUserId}`,
          ) ?? null)
        : null;
      const parsed = parseSalesCommissionV2Description(appointment.description);
      const categoryMatch = matchSalesCommissionV2Category({
        parsed,
        categories: categoriesByClient.get(appointment.clientId) ?? [],
        rules: rulesByClient.get(appointment.clientId) ?? [],
      });
      const duplicatedPrice = parsed.duplicateFields.includes("price");
      const parsedPrice = duplicatedPrice
        ? { status: "invalid" as const, cents: null, formatted: null }
        : parseSalesCommissionV2Price(parsed.fields.price);
      const needsAttention = parsed.status !== "structured";
      const financiallyEligible = parsed.status === "structured";
      const commissionPercentage = clientSettings?.commissionPercentage ?? null;
      const financials = calculateSalesCommissionV2Financials({
        appointmentStatus: appointment.status,
        priceCents: financiallyEligible ? parsedPrice.cents : null,
        commissionEligible: financiallyEligible && salesperson !== null,
        commissionPercentage,
      });
      const reviewReasons = [...parsed.reviewReasons];
      if (categoryMatch.status === "unmatched") {
        addReviewReason(reviewReasons, "unmatched_category");
      }
      if (categoryMatch.status === "ambiguous") {
        addReviewReason(reviewReasons, "ambiguous_category");
      }
      if (!salesperson) addReviewReason(reviewReasons, "missing_salesperson");
      if (financials.missingCommissionPercentage) {
        addReviewReason(reviewReasons, "missing_commission_percentage");
      }
      if (
        (appointment.status === "new" || appointment.status === "confirmed") &&
        appointment.startsAt < new Date()
      ) {
        addReviewReason(reviewReasons, "past_unresolved_status");
      }

      return {
        ...appointment,
        rawDescription: appointment.description,
        parseStatus: parsed.status,
        matchStatus: categoryMatch.status,
        fields: parsed.fields,
        parsedPrice: parsedPrice.formatted,
        globalSalespersonKey:
          salesperson?.globalSalespersonId ??
          (salesperson ? `local:${salesperson.id}` : "unassigned"),
        commissionPercentage,
        category: categoryMatch.category,
        mapping: {
          matchedBy: categoryMatch.matchedBy,
          matchedKeyword: categoryMatch.matchedKeyword,
          rule: categoryMatch.rule
            ? { id: categoryMatch.rule.id, name: categoryMatch.rule.name }
            : null,
          competingCategoryIds: categoryMatch.competingCategoryIds,
        },
        salesperson: salesperson
          ? {
              id: salesperson.id,
              externalUserId: salesperson.externalUserId,
              name:
                salesperson.displayName ??
                salesperson.providerName ??
                `Unnamed • ${salesperson.externalUserId.slice(-6)}`,
              providerName: salesperson.providerName,
              displayName: salesperson.displayName,
              isUnnamed:
                salesperson.displayName === null &&
                salesperson.providerName === null,
              hasCustomDisplayName: salesperson.displayName !== null,
              globalSalesperson: salesperson.globalSalespersonId
                ? (globalSalespersonById.get(salesperson.globalSalespersonId) ??
                  null)
                : null,
            }
          : null,
        ...financials,
        reviewReasons,
        needsAttention,
        needsReview: reviewReasons.length > 0,
      };
    })
    .filter((row) =>
      input.globalSalespersonId === undefined
        ? true
        : input.globalSalespersonId === "unassigned"
          ? row.salesperson === null
          : row.salesperson?.globalSalesperson?.id ===
            input.globalSalespersonId,
    )
    .filter((row) =>
      input.categoryId === undefined
        ? true
        : row.category?.id === input.categoryId,
    )
    .filter((row) =>
      input.review === undefined
        ? true
        : input.review === "needs_review"
          ? row.needsReview
          : !row.needsReview,
    );

  const summary = emptySummary();
  const clientGroups = new Map<string, ClientGroup>();
  const globalSalespersonGroups = new Map<string, GlobalSalespersonGroup>();
  for (const row of evaluatedRows) {
    addRowToSummary(summary, row);
    let client = clientGroups.get(row.clientId);
    client ??= {
      id: row.clientId,
      name: row.clientName,
      summary: emptySummary(),
      salespeople: new Map<string, SalespersonGroup>(),
    };
    addRowToSummary(client.summary, row);
    const salespersonKey = row.salesperson?.id ?? "unassigned";
    let person = client.salespeople.get(salespersonKey);
    person ??= {
      id: row.salesperson?.id ?? null,
      name: row.salesperson?.name ?? "Unassigned / Booking widget",
      isUnnamed: row.salesperson?.isUnnamed ?? false,
      hasCustomDisplayName: row.salesperson?.hasCustomDisplayName ?? false,
      summary: emptySummary(),
      categories: new Map<string, CategoryGroup>(),
    };
    addRowToSummary(person.summary, row);
    const categoryKey = row.category?.id ?? "uncategorized";
    let category = person.categories.get(categoryKey);
    category ??= {
      id: row.category?.id ?? null,
      name: row.category?.name ?? "Uncategorized",
      summary: emptySummary(),
    };
    addRowToSummary(category.summary, row);
    person.categories.set(categoryKey, category);
    client.salespeople.set(salespersonKey, person);
    clientGroups.set(client.id, client);

    const globalSalesperson = row.salesperson?.globalSalesperson ?? null;
    const globalSalespersonKey = row.globalSalespersonKey;
    let globalPerson = globalSalespersonGroups.get(globalSalespersonKey);
    globalPerson ??= {
      id: globalSalesperson?.id ?? null,
      name:
        globalSalesperson?.name ??
        row.salesperson?.name ??
        "Unassigned / Booking widget",
      isUnnamed:
        globalSalesperson?.isUnnamed ?? row.salesperson?.isUnnamed ?? false,
      hasCustomDisplayName:
        globalSalesperson?.hasCustomDisplayName ??
        row.salesperson?.hasCustomDisplayName ??
        false,
      key: globalSalespersonKey,
      summary: emptySummary(),
      clients: new Map<string, GlobalSalespersonClientGroup>(),
    };
    addRowToSummary(globalPerson.summary, row);
    let globalClient = globalPerson.clients.get(row.clientId);
    globalClient ??= {
      id: row.clientId,
      name: row.clientName,
      localSalespersonNames: new Set<string>(),
      categories: new Map<string, CategoryGroup>(),
      summary: emptySummary(),
    };
    if (row.salesperson) {
      globalClient.localSalespersonNames.add(row.salesperson.name);
    }
    addRowToSummary(globalClient.summary, row);
    let globalCategory = globalClient.categories.get(categoryKey);
    globalCategory ??= {
      id: row.category?.id ?? null,
      name: row.category?.name ?? "Uncategorized",
      summary: emptySummary(),
    };
    addRowToSummary(globalCategory.summary, row);
    globalClient.categories.set(categoryKey, globalCategory);
    globalPerson.clients.set(globalClient.id, globalClient);
    globalSalespersonGroups.set(globalSalespersonKey, globalPerson);
  }

  const presentedClientGroups = [...clientGroups.values()]
    .map((client) => ({
      id: client.id,
      name: client.name,
      summary: presentSummary(client.summary),
      salespeople: [...client.salespeople.values()]
        .map((person) => ({
          id: person.id,
          name: person.name,
          isUnnamed: person.isUnnamed,
          hasCustomDisplayName: person.hasCustomDisplayName,
          summary: presentSummary(person.summary),
          categories: [...person.categories.values()]
            .map((category) => ({
              id: category.id,
              name: category.name,
              summary: presentSummary(category.summary),
            }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        }))
        .sort((left, right) => {
          const leftCommission = parseUsdToCents(left.summary.commission);
          const rightCommission = parseUsdToCents(right.summary.commission);
          if (rightCommission > leftCommission) return 1;
          if (rightCommission < leftCommission) return -1;
          return left.name.localeCompare(right.name);
        }),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const presentedGlobalSalespersonGroups = [...globalSalespersonGroups.values()]
    .map((person) => ({
      key: person.key,
      id: person.id,
      name: person.name,
      isUnnamed: person.isUnnamed,
      hasCustomDisplayName: person.hasCustomDisplayName,
      summary: presentSummary(person.summary),
      clients: [...person.clients.values()]
        .map((client) => ({
          id: client.id,
          name: client.name,
          localSalespersonNames: [...client.localSalespersonNames].sort(
            (left, right) => left.localeCompare(right),
          ),
          summary: presentSummary(client.summary),
          categories: [...client.categories.values()]
            .map((category) => ({
              id: category.id,
              name: category.name,
              summary: presentSummary(category.summary),
            }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => {
      const leftCommission = parseUsdToCents(left.summary.commission);
      const rightCommission = parseUsdToCents(right.summary.commission);
      if (rightCommission > leftCommission) return 1;
      if (rightCommission < leftCommission) return -1;
      return left.name.localeCompare(right.name);
    });
  const attentionSelectionKey =
    input.attentionView === "salesperson"
      ? (presentedGlobalSalespersonGroups.find(
          (person) => person.key === input.selectedGlobalSalespersonKey,
        )?.key ??
        presentedGlobalSalespersonGroups[0]?.key ??
        null)
      : input.attentionView === "client"
        ? (presentedClientGroups.find(
            (client) => client.id === input.selectedClientId,
          )?.id ??
          presentedClientGroups[0]?.id ??
          null)
        : null;
  const attentionRowsByScope = new Map<string, typeof evaluatedRows>();
  for (const row of evaluatedRows) {
    if (!row.needsAttention) continue;
    const scopeKey =
      input.attentionView === "salesperson"
        ? row.globalSalespersonKey
        : input.attentionView === "client"
          ? row.clientId
          : "all";
    const scopeRows = attentionRowsByScope.get(scopeKey) ?? [];
    scopeRows.push(row);
    attentionRowsByScope.set(scopeKey, scopeRows);
  }
  const attentionScopeKeys =
    input.attentionView === "salesperson"
      ? presentedGlobalSalespersonGroups.map((person) => person.key)
      : input.attentionView === "client"
        ? presentedClientGroups.map((client) => client.id)
        : ["all"];
  const selectedAttentionRows =
    attentionRowsByScope.get(attentionSelectionKey ?? "all") ?? [];
  const attentionScopes = attentionScopeKeys.map((key) => {
    const scopeRows = attentionRowsByScope.get(key) ?? [];
    return {
      key,
      total: scopeRows.length,
      rows: scopeRows.slice(0, input.pageSize),
    };
  });
  const total = evaluatedRows.length;
  const start = (input.page - 1) * input.pageSize;
  const rows = evaluatedRows.slice(start, start + input.pageSize);
  const attentionTotal = selectedAttentionRows.length;
  const paginatedAttentionRows = selectedAttentionRows.slice(
    start,
    start + input.pageSize,
  );

  return {
    ...reportingContext,
    summary: presentSummary(summary),
    clientGroups: presentedClientGroups,
    globalSalespersonGroups: presentedGlobalSalespersonGroups,
    rows,
    total,
    attentionRows: paginatedAttentionRows,
    attentionTotal,
    attentionSelectionKey,
    attentionScopes,
    isTruncated,
    options: {
      clients: clientRows,
      globalSalespeople: [...globalSalespersonById.values()]
        .map((person) => ({
          id: person.id,
          name: person.name,
          isUnnamed: person.isUnnamed,
          clientIds: [...person.clientIds],
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      categories: categoryRows.map((category) => ({
        id: category.id,
        clientId: category.clientId,
        name: category.name,
      })),
    },
  };
}

export async function getSalesCommissionV2Setup(input: { clientId?: string }) {
  const clientRows = await db
    .select({ id: clients.id, name: clients.name, status: clients.status })
    .from(clients)
    .orderBy(asc(clients.name));
  const selectedClientId =
    input.clientId ?? clientRows.find((row) => row.status === "active")?.id;
  if (!selectedClientId) {
    return {
      clients: clientRows,
      selectedClientId: null,
      attributionMode: "created_by" as const,
      salespeople: [],
      categories: [],
      rules: [],
      commissionPercentage: null,
    };
  }

  const [settings, people, categories, rules] = await Promise.all([
    db
      .select({
        attributionMode: salesCommissionV2Settings.attributionMode,
        commissionPercentage: salesCommissionV2Settings.commissionPercentage,
      })
      .from(salesCommissionV2Settings)
      .where(eq(salesCommissionV2Settings.clientId, selectedClientId))
      .limit(1),
    db
      .select({
        id: salespeople.id,
        externalUserId: salespeople.externalUserId,
        providerName: salespeople.providerName,
        displayName: salespeople.displayName,
        status: salespeople.status,
        lastSeenAt: salespeople.lastSeenAt,
      })
      .from(salespeople)
      .where(eq(salespeople.clientId, selectedClientId))
      .orderBy(
        asc(
          sql`coalesce(${salespeople.displayName}, ${salespeople.providerName}, ${salespeople.externalUserId})`,
        ),
        asc(salespeople.id),
      ),
    db
      .select({
        id: salesCommissionV2Categories.id,
        name: salesCommissionV2Categories.name,
        normalizedName: salesCommissionV2Categories.normalizedName,
        sortOrder: salesCommissionV2Categories.sortOrder,
        status: salesCommissionV2Categories.status,
      })
      .from(salesCommissionV2Categories)
      .where(eq(salesCommissionV2Categories.clientId, selectedClientId))
      .orderBy(
        asc(salesCommissionV2Categories.sortOrder),
        asc(salesCommissionV2Categories.name),
      ),
    db
      .select({
        id: salesCommissionV2MappingRules.id,
        categoryId: salesCommissionV2MappingRules.categoryId,
        name: salesCommissionV2MappingRules.name,
        field: salesCommissionV2MappingRules.field,
        keywords: salesCommissionV2MappingRules.keywords,
        matchMode: salesCommissionV2MappingRules.matchMode,
        priority: salesCommissionV2MappingRules.priority,
        status: salesCommissionV2MappingRules.status,
      })
      .from(salesCommissionV2MappingRules)
      .where(eq(salesCommissionV2MappingRules.clientId, selectedClientId))
      .orderBy(
        desc(salesCommissionV2MappingRules.priority),
        asc(salesCommissionV2MappingRules.name),
      ),
  ]);

  return {
    clients: clientRows,
    selectedClientId,
    attributionMode: settings[0]?.attributionMode ?? ("created_by" as const),
    commissionPercentage: settings[0]?.commissionPercentage ?? null,
    salespeople: people,
    categories,
    rules,
  };
}
