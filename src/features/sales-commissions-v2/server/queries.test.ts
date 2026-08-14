import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSalesCommissionV2Category,
  createSalesCommissionV2MappingRule,
  saveSalesCommissionV2Settings,
} from "~/features/sales-commissions-v2/server/actions";
import {
  getSalesCommissionV2Report,
  getSalesCommissionV2Setup,
} from "~/features/sales-commissions-v2/server/queries";
import { getSalesCommissionReport } from "~/features/sales-commissions/server/queries";
import { db } from "~/server/db";
import {
  clients,
  ghlAppointments,
  ghlCalendars,
  ghlContacts,
  globalSalespeople,
  globalSalespersonIdentities,
  integrationMappings,
  salesCategories,
  salesOffers,
  salespeople,
  salespersonCommissionRates,
} from "~/server/db/schema";

const ceramicDescription = `Lead Source : Dm Lead
Category : cc
Service : cc special
Price : $499
Car : 2024 king ranch dully
Deposit status : $20 Collected Via Cash app

Drop off Friday 9:30 am
pick up Saturday 9:30 am`;

const tintDescription = `Lead Source : Lead form
Category : tint and detail
Service : tint sides and rear + headlight restoration + engine clean
Price : $339 + $80 + $50
Car : Mazda cx5
Deposit status : $20 Collected Via Zelle

Drop off Saturday 9:00 am`;

const unmatchedDescription = `Lead Source : Referral
Category : wraps
Service : full wrap
Price : $100
Car : Ford F-150
Deposit status : $50 Collected`;

let clientId = "";
let globalSalespersonId = "";
let ceramicCategoryId = "";
let tintCategoryId = "";
let v1BeforeV2: Awaited<ReturnType<typeof getSalesCommissionReport>>;
let v1AfterV2: Awaited<ReturnType<typeof getSalesCommissionReport>>;

const reportInput = {
  from: "2026-08-01",
  to: "2026-08-31",
  page: 1,
  pageSize: 25,
};

describe("Sales & Commissions v2 reporting", () => {
  beforeAll(async () => {
    const [client] = await db
      .insert(clients)
      .values({
        slug: "sales-commission-v2-query-test",
        name: "Martinez V2 Query Test",
      })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create V2 commission test client");
    clientId = client.id;

    const [mapping] = await db
      .insert(integrationMappings)
      .values({
        clientId,
        provider: "ghl",
        externalLocationId: "commission-v2-location",
        timezone: "America/New_York",
        syncFromAt: new Date(0),
      })
      .returning({ id: integrationMappings.id });
    if (!mapping) throw new Error("Could not create V2 integration mapping");

    const [[calendar], [contact], [globalSalesperson]] = await Promise.all([
      db
        .insert(ghlCalendars)
        .values({
          integrationMappingId: mapping.id,
          externalId: "commission-v2-calendar",
          name: "V2 Commission Calendar",
        })
        .returning({ id: ghlCalendars.id }),
      db
        .insert(ghlContacts)
        .values({
          integrationMappingId: mapping.id,
          externalId: "commission-v2-contact",
          fullName: "Martinez Test Customer",
          tags: [],
          providerUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
          rawPayload: {},
        })
        .returning({ id: ghlContacts.id }),
      db
        .insert(globalSalespeople)
        .values({ displayName: "Michael VA" })
        .returning({ id: globalSalespeople.id }),
    ]);
    if (!calendar || !contact || !globalSalesperson) {
      throw new Error("Could not create V2 shared fixtures");
    }
    globalSalespersonId = globalSalesperson.id;
    await db.insert(globalSalespersonIdentities).values({
      globalSalespersonId,
      provider: "ghl",
      externalUserId: "michael-va",
    });
    const [salesperson] = await db
      .insert(salespeople)
      .values({
        clientId,
        externalUserId: "michael-va",
        providerName: "Michael VA",
      })
      .returning({ id: salespeople.id });
    if (!salesperson) throw new Error("Could not create Michael VA fixture");

    const [legacyCategory] = await db
      .insert(salesCategories)
      .values({ clientId, name: "Legacy Ceramic" })
      .returning({ id: salesCategories.id });
    if (!legacyCategory)
      throw new Error("Could not create V1 category fixture");
    await db.insert(salesOffers).values({
      clientId,
      categoryId: legacyCategory.id,
      name: "Legacy CC",
      keywords: ["cc"],
      priority: 10,
      revenueValue: "999.00",
    });
    await db.insert(salespersonCommissionRates).values({
      clientId,
      salespersonId: salesperson.id,
      categoryId: legacyCategory.id,
      commissionValue: "77.00",
    });

    const appointments = [
      {
        externalId: "v2-ceramic-showed",
        status: "showed" as const,
        description: ceramicDescription,
        startsAt: new Date("2026-08-20T14:00:00.000Z"),
      },
      {
        externalId: "v2-tint-showed",
        status: "showed" as const,
        description: tintDescription,
        startsAt: new Date("2026-08-19T14:00:00.000Z"),
      },
      {
        externalId: "v2-ceramic-noshow",
        status: "noshow" as const,
        description: ceramicDescription,
        startsAt: new Date("2026-08-18T14:00:00.000Z"),
      },
      {
        externalId: "v2-legacy-showed",
        status: "showed" as const,
        description: "Customer requested the usual package",
        startsAt: new Date("2026-08-17T14:00:00.000Z"),
      },
      {
        externalId: "v2-unmatched-showed",
        status: "showed" as const,
        description: unmatchedDescription,
        startsAt: new Date("2026-08-16T14:00:00.000Z"),
      },
      {
        externalId: "v2-future-appointment-booked-in-range",
        status: "confirmed" as const,
        description: tintDescription,
        startsAt: new Date("2027-09-20T14:00:00.000Z"),
      },
    ];
    await db.insert(ghlAppointments).values(
      appointments.map((appointment) => ({
        integrationMappingId: mapping.id,
        calendarId: calendar.id,
        contactId: contact.id,
        externalId: appointment.externalId,
        status: appointment.status,
        title: "Appointment",
        description: appointment.description,
        notes: "$9,999 should never substitute for Price",
        createdByUserExternalId: "michael-va",
        createdBySource: "contactdetails_page",
        startsAt: appointment.startsAt,
        endsAt: new Date(appointment.startsAt.getTime() + 3_600_000),
        providerCreatedAt: new Date("2026-08-01T12:00:00.000Z"),
        providerUpdatedAt: new Date("2026-08-01T12:00:00.000Z"),
        rawPayload: {},
      })),
    );

    v1BeforeV2 = await getSalesCommissionReport({
      ...reportInput,
      clientId,
    });

    await saveSalesCommissionV2Settings({
      clientId,
      attributionMode: "created_by",
      commissionPercentage: "10.00",
    });
    const ceramic = await createSalesCommissionV2Category({
      clientId,
      name: "Ceramic Coating",
      sortOrder: 0,
    });
    const tint = await createSalesCommissionV2Category({
      clientId,
      name: "Tint and detail",
      sortOrder: 1,
    });
    ceramicCategoryId = ceramic.id;
    tintCategoryId = tint.id;
    await createSalesCommissionV2MappingRule({
      clientId,
      categoryId: ceramicCategoryId,
      name: "CC abbreviation",
      field: "category",
      keywords: ["cc"],
      matchMode: "any",
      priority: 100,
    });

    v1AfterV2 = await getSalesCommissionReport({
      ...reportInput,
      clientId,
    });
  });

  afterAll(async () => {
    if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
    if (globalSalespersonId) {
      await db
        .delete(globalSalespeople)
        .where(eq(globalSalespeople.id, globalSalespersonId));
    }
  });

  it("keeps the existing V1 report deeply unchanged after V2 configuration", () => {
    expect(v1AfterV2).toEqual(v1BeforeV2);
  });

  it("applies one client percentage to showed revenue across categories", async () => {
    const report = await getSalesCommissionV2Report({
      ...reportInput,
      clientId,
    });

    expect(report.summary).toMatchObject({
      appointments: 6,
      showed: 4,
      noShows: 1,
      attributedRevenue: "1068.00",
      missedRevenue: "499.00",
      commission: "106.80",
      needsReview: 2,
    });
    expect(report.rows[0]?.id).toBeDefined();
    expect(report.clientGroups[0]?.summary.commission).toBe("106.80");
    expect(report.globalSalespersonGroups[0]).toMatchObject({
      id: globalSalespersonId,
      name: "Michael VA",
      summary: { attributedRevenue: "1068.00", commission: "106.80" },
      clients: [
        {
          id: clientId,
          localSalespersonNames: ["Michael VA"],
          summary: { commission: "106.80" },
        },
      ],
    });
    expect(
      report.globalSalespersonGroups[0]?.clients[0]?.categories.map(
        (category) => ({
          name: category.name,
          appointments: category.summary.appointments,
        }),
      ),
    ).toEqual([
      { name: "Ceramic Coating", appointments: 2 },
      { name: "Tint and detail", appointments: 2 },
      { name: "Uncategorized", appointments: 2 },
    ]);
    const futureAppointment = report.rows.find(
      (row) => row.status === "confirmed",
    );
    expect(futureAppointment?.startsAt).toEqual(
      new Date("2027-09-20T14:00:00.000Z"),
    );

    expect(report.rows.map((row) => row.id)).toHaveLength(6);
    const ceramic = report.rows.find(
      (row) =>
        row.rawDescription === ceramicDescription && row.status === "showed",
    );
    expect(ceramic).toMatchObject({
      parseStatus: "structured",
      matchStatus: "matched",
      parsedPrice: "499.00",
      fields: {
        leadSource: "Dm Lead",
        category: "cc",
        service: "cc special",
        car: "2024 king ranch dully",
        depositStatus: "$20 Collected Via Cash app",
      },
      category: { id: ceramicCategoryId, name: "Ceramic Coating" },
      mapping: { matchedBy: "rule", rule: { name: "CC abbreviation" } },
      salesperson: { name: "Michael VA" },
      commissionPercentage: "10.00",
      attributedRevenue: "499.00",
      commission: "49.90",
      reviewReasons: [],
    });
    const tint = report.rows.find(
      (row) =>
        row.rawDescription === tintDescription && row.status === "showed",
    );
    expect(tint).toMatchObject({
      parsedPrice: "469.00",
      fields: { depositStatus: "$20 Collected Via Zelle" },
      category: { id: tintCategoryId, name: "Tint and detail" },
      mapping: { matchedBy: "category_exact", rule: null },
      commissionPercentage: "10.00",
      attributedRevenue: "469.00",
      commission: "46.90",
    });
    expect(report.rows.find((row) => row.status === "noshow")).toMatchObject({
      attributedRevenue: "0.00",
      missedRevenue: "499.00",
      commission: "0.00",
    });
    expect(
      report.rows.find((row) => row.parseStatus === "legacy_description"),
    ).toMatchObject({
      parsedPrice: null,
      attributedRevenue: "0.00",
      commission: "0.00",
      needsReview: true,
      reviewReasons: ["legacy_description"],
    });
    expect(
      report.rows.find((row) => row.rawDescription === unmatchedDescription),
    ).toMatchObject({
      category: null,
      attributedRevenue: "100.00",
      commissionPercentage: "10.00",
      commission: "10.00",
      reviewReasons: ["unmatched_category"],
    });
  });

  it("filters review and category states before pagination", async () => {
    const ready = await getSalesCommissionV2Report({
      ...reportInput,
      clientId,
      review: "ready",
      pageSize: 1,
    });
    expect(ready.total).toBe(4);
    expect(ready.rows).toHaveLength(1);
    expect(ready.rows[0]?.needsReview).toBe(false);

    const needsReview = await getSalesCommissionV2Report({
      ...reportInput,
      clientId,
      review: "needs_review",
    });
    expect(needsReview.total).toBe(2);
    expect(needsReview.rows.map((row) => row.reviewReasons[0]).sort()).toEqual([
      "legacy_description",
      "unmatched_category",
    ]);

    const ceramic = await getSalesCommissionV2Report({
      ...reportInput,
      clientId,
      categoryId: ceramicCategoryId,
    });
    expect(ceramic.total).toBe(2);
    expect(ceramic.summary).toMatchObject({
      attributedRevenue: "499.00",
      missedRevenue: "499.00",
      commission: "49.90",
    });
  });

  it("filters by global identity and exposes independent setup records", async () => {
    const report = await getSalesCommissionV2Report({
      ...reportInput,
      globalSalespersonId,
    });
    expect(report.total).toBe(6);
    expect(report.summary.commission).toBe("106.80");

    const setup = await getSalesCommissionV2Setup({ clientId });
    expect(setup).toMatchObject({
      selectedClientId: clientId,
      attributionMode: "created_by",
      commissionPercentage: "10.00",
    });
    expect(setup.categories).toHaveLength(2);
    expect(setup.rules).toHaveLength(1);
    expect(setup.salespeople).toEqual([
      expect.objectContaining({
        externalUserId: "michael-va",
        providerName: "Michael VA",
      }),
    ]);
  });
});
