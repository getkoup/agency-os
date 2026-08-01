import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { updateSalesperson } from "~/features/sales-commissions/server/actions";
import { updateGlobalSalesperson } from "~/features/sales-commissions/server/global-salespeople";
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

let clientId = "";
let salespersonId = "";
let secondClientId = "";
let globalSalespersonId = "";

describe("sales commission reporting", () => {
  beforeAll(async () => {
    const [client] = await db
      .insert(clients)
      .values({
        slug: "sales-commission-query-test",
        name: "Sales Commission Query Test",
      })
      .returning({ id: clients.id });
    if (!client) throw new Error("Could not create commission test client");
    clientId = client.id;
    const [mapping] = await db
      .insert(integrationMappings)
      .values({
        clientId,
        provider: "ghl",
        externalLocationId: "commission-location",
        timezone: "America/New_York",
        syncFromAt: new Date(0),
      })
      .returning({ id: integrationMappings.id });
    if (!mapping) throw new Error("Could not create commission test mapping");
    const [calendar] = await db
      .insert(ghlCalendars)
      .values({
        integrationMappingId: mapping.id,
        externalId: "commission-calendar",
        name: "Commission Calendar",
      })
      .returning({ id: ghlCalendars.id });
    const [contact] = await db
      .insert(ghlContacts)
      .values({
        integrationMappingId: mapping.id,
        externalId: "commission-contact",
        fullName: "Commission Customer",
        tags: [],
        providerUpdatedAt: new Date("2026-07-01T00:00:00.000Z"),
        rawPayload: {},
      })
      .returning({ id: ghlContacts.id });
    if (!calendar || !contact) throw new Error("Could not create GHL fixtures");
    const [globalSalesperson] = await db
      .insert(globalSalespeople)
      .values({})
      .returning({ id: globalSalespeople.id });
    if (!globalSalesperson) {
      throw new Error("Could not create global salesperson fixture");
    }
    globalSalespersonId = globalSalesperson.id;
    await db.insert(globalSalespersonIdentities).values({
      globalSalespersonId,
      provider: "ghl",
      externalUserId: "salesperson-a",
    });
    const [salesperson] = await db
      .insert(salespeople)
      .values({
        clientId,
        externalUserId: "salesperson-a",
        providerName: "Salesperson A",
        displayName: null,
      })
      .returning({ id: salespeople.id });
    if (!salesperson) throw new Error("Could not create test salesperson");
    salespersonId = salesperson.id;
    const [tint, ceramic] = await db
      .insert(salesCategories)
      .values([
        { clientId, name: "Tint", sortOrder: 0 },
        { clientId, name: "Ceramic", sortOrder: 1 },
      ])
      .returning({ id: salesCategories.id, name: salesCategories.name });
    if (!tint || !ceramic) throw new Error("Could not create test categories");
    const categoryByName = new Map(
      [tint, ceramic].map((category) => [category.name, category.id]),
    );
    const tintId = categoryByName.get("Tint");
    const ceramicId = categoryByName.get("Ceramic");
    if (!tintId || !ceramicId) throw new Error("Test category IDs missing");
    await db.insert(salesOffers).values([
      {
        clientId,
        categoryId: tintId,
        name: "Tint package",
        keywords: ["tint"],
        priority: 10,
        revenueValue: "200.00",
      },
      {
        clientId,
        categoryId: ceramicId,
        name: "Ceramic $299",
        keywords: ["299"],
        priority: 10,
        revenueValue: "299.00",
      },
    ]);
    await db.insert(salespersonCommissionRates).values([
      {
        clientId,
        salespersonId: salesperson.id,
        categoryId: tintId,
        commissionValue: "10.00",
      },
      {
        clientId,
        salespersonId: salesperson.id,
        categoryId: ceramicId,
        commissionValue: "20.00",
      },
    ]);
    const appointmentValues = [
      ...Array.from({ length: 3 }, (_, index) => ({
        externalId: `tint-showed-${index}`,
        status: "showed" as const,
        description: "Tint package",
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        externalId: `ceramic-showed-${index}`,
        status: "showed" as const,
        description: "NC299 ceramic package",
      })),
      {
        externalId: "ceramic-noshow",
        status: "noshow" as const,
        description: "NC299 ceramic package",
      },
    ];
    await db.insert(ghlAppointments).values(
      appointmentValues.map((appointment, index) => ({
        integrationMappingId: mapping.id,
        calendarId: calendar.id,
        contactId: contact.id,
        externalId: appointment.externalId,
        status: appointment.status,
        title: "Appointment",
        description: appointment.description,
        createdByUserExternalId: "salesperson-a",
        createdBySource: "contactdetails_page",
        startsAt: new Date(
          `2026-07-${String(index + 10).padStart(2, "0")}T14:00:00.000Z`,
        ),
        endsAt: new Date(
          `2026-07-${String(index + 10).padStart(2, "0")}T15:00:00.000Z`,
        ),
        providerCreatedAt: new Date("2026-07-01T12:00:00.000Z"),
        providerUpdatedAt: new Date("2026-07-01T12:00:00.000Z"),
        rawPayload: {},
      })),
    );

    const [secondClient] = await db
      .insert(clients)
      .values({
        slug: "sales-commission-query-second-test",
        name: "Sales Commission Second Client",
      })
      .returning({ id: clients.id });
    if (!secondClient) throw new Error("Could not create second test client");
    secondClientId = secondClient.id;
    const [secondMapping] = await db
      .insert(integrationMappings)
      .values({
        clientId: secondClientId,
        provider: "ghl",
        externalLocationId: "commission-second-location",
        timezone: "UTC",
        syncFromAt: new Date(0),
      })
      .returning({ id: integrationMappings.id });
    if (!secondMapping) throw new Error("Second mapping is missing");
    const [secondCalendar] = await db
      .insert(ghlCalendars)
      .values({
        integrationMappingId: secondMapping.id,
        externalId: "commission-second-calendar",
        name: "Second Commission Calendar",
      })
      .returning({ id: ghlCalendars.id });
    const [secondContact] = await db
      .insert(ghlContacts)
      .values({
        integrationMappingId: secondMapping.id,
        externalId: "commission-second-contact",
        fullName: "Second Commission Customer",
        tags: [],
        providerUpdatedAt: new Date("2026-07-01T00:00:00.000Z"),
        rawPayload: {},
      })
      .returning({ id: ghlContacts.id });
    const [secondSalesperson] = await db
      .insert(salespeople)
      .values({
        clientId: secondClientId,
        externalUserId: "salesperson-a",
        providerName: null,
        displayName: null,
      })
      .returning({ id: salespeople.id });
    const [secondCategory] = await db
      .insert(salesCategories)
      .values({ clientId: secondClientId, name: "Tint", sortOrder: 0 })
      .returning({ id: salesCategories.id });
    if (
      !secondCalendar ||
      !secondContact ||
      !secondSalesperson ||
      !secondCategory
    ) {
      throw new Error("Second client sales fixtures are missing");
    }
    await db.insert(salesOffers).values({
      clientId: secondClientId,
      categoryId: secondCategory.id,
      name: "Second tint package",
      keywords: ["tint"],
      priority: 10,
      revenueValue: "100.00",
    });
    await db.insert(salespersonCommissionRates).values({
      clientId: secondClientId,
      salespersonId: secondSalesperson.id,
      categoryId: secondCategory.id,
      commissionValue: "5.00",
    });
    await db.insert(ghlAppointments).values({
      integrationMappingId: secondMapping.id,
      calendarId: secondCalendar.id,
      contactId: secondContact.id,
      externalId: "second-client-tint-showed",
      status: "showed",
      title: "Appointment",
      description: "Tint package",
      createdByUserExternalId: "salesperson-a",
      createdBySource: "contactdetails_page",
      startsAt: new Date("2026-07-20T14:00:00.000Z"),
      endsAt: new Date("2026-07-20T15:00:00.000Z"),
      providerCreatedAt: new Date("2026-07-01T12:00:00.000Z"),
      providerUpdatedAt: new Date("2026-07-01T12:00:00.000Z"),
      rawPayload: {},
    });
  });

  afterAll(async () => {
    const storedClientIds = [clientId, secondClientId].filter(Boolean);
    if (storedClientIds.length) {
      await db.delete(clients).where(inArray(clients.id, storedClientIds));
    }
    if (globalSalespersonId) {
      await db
        .delete(globalSalespeople)
        .where(eq(globalSalespeople.id, globalSalespersonId));
    }
  });

  it("calculates the requested category commissions and no-show loss", async () => {
    const report = await getSalesCommissionReport({
      from: "2026-07-01",
      to: "2026-07-31",
      clientId,
      page: 1,
      pageSize: 25,
    });

    expect(report.summary).toMatchObject({
      appointments: 6,
      showed: 5,
      noShows: 1,
      attributedRevenue: "1198.00",
      missedRevenue: "299.00",
      commission: "70.00",
      needsReview: 0,
    });
    expect(report.clientGroups[0]?.salespeople[0]?.summary.commission).toBe(
      "70.00",
    );
    expect(report.globalSalespersonGroups[0]).toMatchObject({
      id: globalSalespersonId,
      name: "Salesperson A",
      summary: { commission: "70.00" },
      clients: [
        {
          id: clientId,
          localSalespersonNames: ["Salesperson A"],
          summary: { commission: "70.00" },
        },
      ],
    });
    expect(report.rows.find((row) => row.status === "noshow")).toMatchObject({
      attributedRevenue: "0.00",
      missedRevenue: "299.00",
      commission: "0.00",
      salesperson: { name: "Salesperson A" },
      offer: { categoryName: "Ceramic" },
    });
  });

  it("filters the consolidated report by global salesperson", async () => {
    const report = await getSalesCommissionReport({
      from: "2026-07-01",
      to: "2026-07-31",
      globalSalespersonId,
      page: 1,
      pageSize: 25,
    });

    expect(report.summary).toMatchObject({
      appointments: 7,
      attributedRevenue: "1298.00",
      commission: "75.00",
    });
    expect(report.globalSalespersonGroups).toHaveLength(1);
    expect(report.globalSalespersonGroups[0]?.clients).toHaveLength(2);
    const globalOption = report.options.globalSalespeople.find(
      (person) => person.id === globalSalespersonId,
    );
    expect(globalOption).toMatchObject({
      id: globalSalespersonId,
      name: "Salesperson A",
    });
    expect(new Set(globalOption?.clientIds)).toEqual(
      new Set([clientId, secondClientId]),
    );
  });

  it("keeps the client presentation when a global display name is set", async () => {
    await updateGlobalSalesperson({
      globalSalespersonId,
      displayName: "Global Closer A",
    });
    const report = await getSalesCommissionReport({
      from: "2026-07-01",
      to: "2026-07-31",
      clientId,
      page: 1,
      pageSize: 25,
    });

    expect(report.clientGroups[0]?.salespeople[0]?.name).toBe("Salesperson A");
    expect(report.globalSalespersonGroups[0]?.name).toBe("Global Closer A");

    await updateGlobalSalesperson({
      globalSalespersonId,
      displayName: "",
    });
  });

  it("prefers a local display name without changing the GHL name", async () => {
    await updateSalesperson({
      clientId,
      salespersonId,
      displayName: "Closer A",
      status: "active",
    });

    const report = await getSalesCommissionReport({
      from: "2026-07-01",
      to: "2026-07-31",
      clientId,
      page: 1,
      pageSize: 1,
    });
    const [stored] = await db
      .select({
        providerName: salespeople.providerName,
        displayName: salespeople.displayName,
      })
      .from(salespeople)
      .where(eq(salespeople.clientId, clientId));

    expect(report.rows[0]?.salesperson?.name).toBe("Closer A");
    expect(stored).toEqual({
      providerName: "Salesperson A",
      displayName: "Closer A",
    });

    await updateSalesperson({
      clientId,
      salespersonId,
      displayName: "",
      status: "active",
    });
    const fallbackReport = await getSalesCommissionReport({
      from: "2026-07-01",
      to: "2026-07-31",
      clientId,
      page: 1,
      pageSize: 1,
    });
    expect(fallbackReport.rows[0]?.salesperson?.name).toBe("Salesperson A");
  });
});
