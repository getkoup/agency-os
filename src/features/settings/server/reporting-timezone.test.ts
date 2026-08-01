import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getSalesTrackingRows } from "~/features/sales-tracking/server/queries";
import { updateAgencyReportingTimezone } from "~/features/settings/server/actions";
import { getAgencyReportingSettings } from "~/features/settings/server/reporting-timezone";
import { db } from "~/server/db";
import {
  clients,
  ghlAppointments,
  ghlCalendars,
  ghlContacts,
  integrationMappings,
  users,
} from "~/server/db/schema";

const clientSlug = "reporting-timezone-test";
const userId = "reporting-timezone-admin-test";
let clientId = "";

beforeAll(async () => {
  await db.delete(clients).where(eq(clients.slug, clientSlug));
  await db.delete(users).where(eq(users.id, userId));
  await db.insert(users).values({
    id: userId,
    email: "reporting-timezone-admin@example.com",
    role: "admin",
  });
  const [client] = await db
    .insert(clients)
    .values({ slug: clientSlug, name: "Reporting Timezone Test" })
    .returning({ id: clients.id });
  if (!client) throw new Error("Could not create reporting timezone client");
  clientId = client.id;
  const [mapping] = await db
    .insert(integrationMappings)
    .values({
      clientId,
      provider: "ghl",
      externalLocationId: "reporting-timezone-location",
      timezone: "America/Los_Angeles",
      syncFromAt: new Date("2026-07-01T00:00:00.000Z"),
    })
    .returning({ id: integrationMappings.id });
  if (!mapping) throw new Error("Could not create reporting timezone mapping");
  const [calendar] = await db
    .insert(ghlCalendars)
    .values({
      integrationMappingId: mapping.id,
      externalId: "reporting-timezone-calendar",
      name: "Reporting Timezone Calendar",
    })
    .returning({ id: ghlCalendars.id });
  const [contact] = await db
    .insert(ghlContacts)
    .values({
      integrationMappingId: mapping.id,
      externalId: "reporting-timezone-contact",
      providerUpdatedAt: new Date("2026-07-30T00:30:00.000Z"),
      rawPayload: {},
    })
    .returning({ id: ghlContacts.id });
  if (!calendar || !contact) {
    throw new Error("Could not create reporting timezone GHL fixtures");
  }
  await db.insert(ghlAppointments).values({
    integrationMappingId: mapping.id,
    calendarId: calendar.id,
    contactId: contact.id,
    externalId: "reporting-timezone-appointment",
    status: "confirmed",
    startsAt: new Date("2026-08-02T16:00:00.000Z"),
    endsAt: new Date("2026-08-02T17:00:00.000Z"),
    providerCreatedAt: new Date("2026-07-30T00:30:00.000Z"),
    providerUpdatedAt: new Date("2026-07-30T00:30:00.000Z"),
    rawPayload: {},
  });
  await updateAgencyReportingTimezone({ reportingTimezone: "UTC", userId });
});

afterAll(async () => {
  await updateAgencyReportingTimezone({ reportingTimezone: "UTC", userId });
  if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("agency reporting timezone persistence", () => {
  it("stores a valid timezone and rejects an invalid timezone", async () => {
    await expect(
      updateAgencyReportingTimezone({
        reportingTimezone: "America/Los_Angeles",
        userId,
      }),
    ).resolves.toEqual({ reportingTimezone: "America/Los_Angeles" });
    await expect(getAgencyReportingSettings()).resolves.toMatchObject({
      reportingTimezone: "America/Los_Angeles",
    });
    await expect(
      updateAgencyReportingTimezone({
        reportingTimezone: "Not/A_Timezone",
        userId,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(getAgencyReportingSettings()).resolves.toMatchObject({
      reportingTimezone: "America/Los_Angeles",
    });
    await updateAgencyReportingTimezone({ reportingTimezone: "UTC", userId });
  });

  it("re-buckets booking creation dates without changing source records", async () => {
    const utc = await getSalesTrackingRows({
      date: "2026-07-30",
      groupSize: 1,
    });
    const utcClient = utc.rows.find((row) => row.id === clientId);
    expect(utc.reportingTimezone).toBe("UTC");
    expect(utcClient?.buckets.at(-1)?.bookings).toBe(1);

    await updateAgencyReportingTimezone({
      reportingTimezone: "America/Los_Angeles",
      userId,
    });
    const losAngeles = await getSalesTrackingRows({
      date: "2026-07-30",
      groupSize: 1,
    });
    const losAngelesClient = losAngeles.rows.find((row) => row.id === clientId);
    expect(losAngeles.reportingTimezone).toBe("America/Los_Angeles");
    expect(losAngelesClient?.buckets.at(-1)?.bookings).toBe(0);
    expect(losAngelesClient?.buckets.at(-2)?.bookings).toBe(1);

    const [storedAppointment] = await db
      .select({ providerCreatedAt: ghlAppointments.providerCreatedAt })
      .from(ghlAppointments)
      .where(eq(ghlAppointments.externalId, "reporting-timezone-appointment"));
    expect(storedAppointment?.providerCreatedAt.toISOString()).toBe(
      "2026-07-30T00:30:00.000Z",
    );
    await updateAgencyReportingTimezone({ reportingTimezone: "UTC", userId });
  });
});
