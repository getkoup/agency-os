import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import {
  calculateAppointmentFinancials,
  classifyAppointment,
  resolveCreditedExternalUserId,
  type AppointmentClassificationStatus,
  type SalesOfferInput,
  type SalespersonAttributionMode,
} from "~/features/sales-commissions/calculations";
import {
  formatUsdCents,
  parseUsdToCents,
} from "~/features/revenue/calculations";
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
  salesCategories,
  salesCommissionSettings,
  salesOffers,
  salespeople,
  salespersonCommissionRates,
} from "~/server/db/schema";

const MAX_REPORT_APPOINTMENTS = 10_000;

type AppointmentStatus =
  "new" | "confirmed" | "showed" | "cancelled" | "noshow" | "invalid";

type ReportInput = {
  from: string;
  to: string;
  clientId?: string;
  salespersonId?: string;
  globalSalespersonId?: string;
  status?: AppointmentStatus;
  categoryId?: string;
  classificationStatus?: AppointmentClassificationStatus;
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
};

type CategoryGroup = {
  id: string;
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
};

type GlobalSalespersonGroup = {
  id: string | null;
  name: string;
  isUnnamed: boolean;
  hasCustomDisplayName: boolean;
  summary: MoneySummary;
  clients: Map<string, GlobalSalespersonClientGroup>;
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
  },
) {
  summary.appointments += 1;
  if (row.status === "showed") summary.showed += 1;
  if (row.status === "noshow") summary.noShows += 1;
  summary.attributedRevenueCents += parseUsdToCents(row.attributedRevenue);
  summary.missedRevenueCents += parseUsdToCents(row.missedRevenue);
  summary.commissionCents += parseUsdToCents(row.commission);
  if (row.needsReview) summary.needsReview += 1;
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
  };
}

function reportDateRangeIsValid(from: string, to: string): boolean {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return false;
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  return days >= 0 && days <= 366;
}

export async function getSalesCommissionReport(input: ReportInput) {
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
    offerRows,
    rateRows,
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
        notes: ghlAppointments.notes,
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
        clientId: salesCommissionSettings.clientId,
        attributionMode: salesCommissionSettings.attributionMode,
      })
      .from(salesCommissionSettings),
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
        id: salesOffers.id,
        clientId: salesOffers.clientId,
        categoryId: salesOffers.categoryId,
        categoryName: salesCategories.name,
        name: salesOffers.name,
        keywords: salesOffers.keywords,
        matchMode: salesOffers.matchMode,
        priority: salesOffers.priority,
        revenueValue: salesOffers.revenueValue,
      })
      .from(salesOffers)
      .innerJoin(
        salesCategories,
        eq(salesOffers.categoryId, salesCategories.id),
      )
      .where(
        and(
          eq(salesOffers.status, "active"),
          eq(salesCategories.status, "active"),
        ),
      )
      .orderBy(desc(salesOffers.priority), asc(salesOffers.name)),
    db
      .select({
        salespersonId: salespersonCommissionRates.salespersonId,
        categoryId: salespersonCommissionRates.categoryId,
        commissionValue: salespersonCommissionRates.commissionValue,
      })
      .from(salespersonCommissionRates),
  ]);

  const isTruncated = appointmentRows.length > MAX_REPORT_APPOINTMENTS;
  const appointments = appointmentRows.slice(0, MAX_REPORT_APPOINTMENTS);
  const settingsByClient = new Map<string, SalespersonAttributionMode>(
    settingRows.map((row) => [row.clientId, row.attributionMode]),
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
  const offersByClient = new Map<string, SalesOfferInput[]>();
  for (const offer of offerRows) {
    const values = offersByClient.get(offer.clientId) ?? [];
    values.push(offer);
    offersByClient.set(offer.clientId, values);
  }
  const rateBySalespersonCategory = new Map(
    rateRows.map((row) => [
      `${row.salespersonId}:${row.categoryId}`,
      row.commissionValue,
    ]),
  );

  const evaluatedRows = appointments
    .map((appointment) => {
      const mode = settingsByClient.get(appointment.clientId) ?? "created_by";
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
      const classification = classifyAppointment({
        description: appointment.description,
        notes: appointment.notes,
        title: appointment.title,
        offers: offersByClient.get(appointment.clientId) ?? [],
      });
      const commissionValue =
        salesperson && classification.offer
          ? (rateBySalespersonCategory.get(
              `${salesperson.id}:${classification.offer.categoryId}`,
            ) ?? null)
          : null;
      const financials = calculateAppointmentFinancials({
        appointmentStatus: appointment.status,
        offerRevenueValue: classification.offer?.revenueValue ?? null,
        commissionValue,
      });
      const missingCommissionRate =
        salesperson !== null && financials.missingCommissionRate;
      const statusNeedsReview =
        (appointment.status === "new" || appointment.status === "confirmed") &&
        appointment.startsAt < new Date();
      const needsReview =
        classification.status !== "matched" ||
        salesperson === null ||
        missingCommissionRate ||
        statusNeedsReview;
      return {
        ...appointment,
        classificationStatus: classification.status,
        classificationText: classification.classificationText,
        matchedKeyword: classification.matchedKeyword,
        offer: classification.offer
          ? {
              id: classification.offer.id,
              name: classification.offer.name,
              categoryId: classification.offer.categoryId,
              categoryName: classification.offer.categoryName,
              revenueValue: classification.offer.revenueValue,
            }
          : null,
        salesperson: salesperson
          ? {
              id: salesperson.id,
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
        missingCommissionRate,
        needsReview,
      };
    })
    .filter((row) =>
      input.salespersonId === undefined
        ? true
        : input.salespersonId === "unassigned"
          ? row.salesperson === null
          : row.salesperson?.id === input.salespersonId,
    )
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
        : row.offer?.categoryId === input.categoryId,
    )
    .filter((row) =>
      input.classificationStatus === undefined
        ? true
        : row.classificationStatus === input.classificationStatus,
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
    if (row.offer) {
      let category = person.categories.get(row.offer.categoryId);
      category ??= {
        id: row.offer.categoryId,
        name: row.offer.categoryName,
        summary: emptySummary(),
      };
      addRowToSummary(category.summary, row);
      person.categories.set(category.id, category);
    }
    client.salespeople.set(salespersonKey, person);
    clientGroups.set(client.id, client);

    const globalSalesperson = row.salesperson?.globalSalesperson ?? null;
    const globalSalespersonKey = globalSalesperson
      ? globalSalesperson.id
      : row.salesperson
        ? `local:${row.salesperson.id}`
        : "unassigned";
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
      summary: emptySummary(),
      clients: new Map<string, GlobalSalespersonClientGroup>(),
    };
    addRowToSummary(globalPerson.summary, row);
    let globalClient = globalPerson.clients.get(row.clientId);
    globalClient ??= {
      id: row.clientId,
      name: row.clientName,
      localSalespersonNames: new Set<string>(),
      summary: emptySummary(),
    };
    if (row.salesperson) {
      globalClient.localSalespersonNames.add(row.salesperson.name);
    }
    addRowToSummary(globalClient.summary, row);
    globalPerson.clients.set(globalClient.id, globalClient);
    globalSalespersonGroups.set(globalSalespersonKey, globalPerson);
  }

  const total = evaluatedRows.length;
  const start = (input.page - 1) * input.pageSize;
  const rows = evaluatedRows.slice(start, start + input.pageSize);
  const categoryOptions = offerRows
    .map((offer) => ({
      id: offer.categoryId,
      clientId: offer.clientId,
      name: offer.categoryName,
    }))
    .filter(
      (category, index, values) =>
        values.findIndex((value) => value.id === category.id) === index,
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    ...reportingContext,
    summary: presentSummary(summary),
    clientGroups: [...clientGroups.values()]
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
      .sort((left, right) => left.name.localeCompare(right.name)),
    globalSalespersonGroups: [...globalSalespersonGroups.values()]
      .map((person) => ({
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
    rows,
    total,
    isTruncated,
    options: {
      clients: clientRows,
      salespeople: salespersonRows.map((row) => ({
        id: row.id,
        clientId: row.clientId,
        name:
          row.displayName ??
          row.providerName ??
          `Unnamed • ${row.externalUserId.slice(-6)}`,
        isUnnamed: row.displayName === null && row.providerName === null,
      })),
      globalSalespeople: [...globalSalespersonById.values()]
        .map((person) => ({
          id: person.id,
          name: person.name,
          isUnnamed: person.isUnnamed,
          clientIds: [...person.clientIds],
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      categories: categoryOptions,
    },
  };
}

export async function getSalesCommissionSetup(input: { clientId?: string }) {
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
      offers: [],
      rates: [],
    };
  }

  const [settings, people, categories, offers, rates] = await Promise.all([
    db
      .select({ attributionMode: salesCommissionSettings.attributionMode })
      .from(salesCommissionSettings)
      .where(eq(salesCommissionSettings.clientId, selectedClientId))
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
        id: salesCategories.id,
        name: salesCategories.name,
        sortOrder: salesCategories.sortOrder,
        status: salesCategories.status,
      })
      .from(salesCategories)
      .where(eq(salesCategories.clientId, selectedClientId))
      .orderBy(asc(salesCategories.sortOrder), asc(salesCategories.name)),
    db
      .select({
        id: salesOffers.id,
        categoryId: salesOffers.categoryId,
        name: salesOffers.name,
        keywords: salesOffers.keywords,
        matchMode: salesOffers.matchMode,
        priority: salesOffers.priority,
        revenueValue: salesOffers.revenueValue,
        status: salesOffers.status,
      })
      .from(salesOffers)
      .where(eq(salesOffers.clientId, selectedClientId))
      .orderBy(desc(salesOffers.priority), asc(salesOffers.name)),
    db
      .select({
        id: salespersonCommissionRates.id,
        salespersonId: salespersonCommissionRates.salespersonId,
        categoryId: salespersonCommissionRates.categoryId,
        commissionValue: salespersonCommissionRates.commissionValue,
      })
      .from(salespersonCommissionRates)
      .where(eq(salespersonCommissionRates.clientId, selectedClientId)),
  ]);

  return {
    clients: clientRows,
    selectedClientId,
    attributionMode: settings[0]?.attributionMode ?? ("created_by" as const),
    salespeople: people,
    categories,
    offers,
    rates,
  };
}
