import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getSalesCommissionReport } from "~/features/sales-commissions/server/queries";
import { db } from "~/server/db";
import {
  clients,
  ghlAppointments,
  ghlCalendars,
  ghlContacts,
  integrationMappings,
  salesCategories,
  salesOffers,
  salespeople,
  salespersonCommissionRates,
} from "~/server/db/schema";

let clientId = "";

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
    const [salesperson] = await db
      .insert(salespeople)
      .values({
        clientId,
        externalUserId: "salesperson-a",
        displayName: "Salesperson A",
        nameIsPlaceholder: false,
      })
      .returning({ id: salespeople.id });
    if (!salesperson) throw new Error("Could not create test salesperson");
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
  });

  afterAll(async () => {
    if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
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
    expect(report.rows.find((row) => row.status === "noshow")).toMatchObject({
      attributedRevenue: "0.00",
      missedRevenue: "299.00",
      commission: "0.00",
      salesperson: { name: "Salesperson A" },
      offer: { categoryName: "Ceramic" },
    });
  });
});
