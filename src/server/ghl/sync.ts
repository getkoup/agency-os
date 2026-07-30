import "server-only";

import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { integrationMappings } from "~/server/db/schema";
import type {
  GhlCalendarEvent,
  GhlClient,
  GhlContact,
} from "~/server/ghl/client";
import { upsertGhlAppointmentBatch } from "~/server/ghl/appointment-persistence";
import { upsertGhlOpportunityPage } from "~/server/ghl/persistence";
import { mapInBatches } from "~/server/sync/batch";

const REPLAY_OVERLAP_MS = 5 * 60 * 1000;
const GHL_CALENDAR_WINDOW_BATCH_SIZE = 5;
const GHL_CONTACT_FETCH_BATCH_SIZE = 20;
const APPOINTMENT_HISTORY_MS = 90 * 24 * 60 * 60 * 1_000;
const APPOINTMENT_FUTURE_MS = 180 * 24 * 60 * 60 * 1_000;
const APPOINTMENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

export interface GhlSyncSummary {
  contactRowCount: number;
  opportunityRowCount: number;
  matchedOpportunityCount: number;
  appointmentRowCount: number;
  matchedAppointmentCount: number;
}

export async function syncGhlLocation(input: {
  client: GhlClient;
  clientId: string;
  locationId: string;
  token: string;
  runStartedAt: Date;
  onPage?: () => Promise<void>;
}): Promise<GhlSyncSummary & { mappingId: string }> {
  const timezone = await input.client.locationTimezone({
    locationId: input.locationId,
    token: input.token,
  });
  const [mapping] = await db
    .insert(integrationMappings)
    .values({
      clientId: input.clientId,
      provider: "ghl",
      externalLocationId: input.locationId,
      timezone,
      syncFromAt: new Date(0),
    })
    .onConflictDoUpdate({
      target: [integrationMappings.clientId, integrationMappings.provider],
      set: { timezone, updatedAt: new Date() },
    })
    .returning({
      id: integrationMappings.id,
      syncFromAt: integrationMappings.syncFromAt,
      lastSuccessfulSyncAt: integrationMappings.lastSuccessfulSyncAt,
      externalLocationId: integrationMappings.externalLocationId,
    });
  if (mapping?.externalLocationId !== input.locationId) {
    throw new Error("GHL mapping identity conflict");
  }
  const replayFloor = mapping.lastSuccessfulSyncAt
    ? new Date(mapping.lastSuccessfulSyncAt.getTime() - REPLAY_OVERLAP_MS)
    : mapping.syncFromAt;
  const floor =
    replayFloor < mapping.syncFromAt ? mapping.syncFromAt : replayFloor;
  const summary: GhlSyncSummary = {
    contactRowCount: 0,
    opportunityRowCount: 0,
    matchedOpportunityCount: 0,
    appointmentRowCount: 0,
    matchedAppointmentCount: 0,
  };
  for await (const page of input.client.wonOpportunities({
    locationId: input.locationId,
    token: input.token,
    floor,
    through: input.runStartedAt,
    onPage: input.onPage,
  })) {
    const pageSummary = await upsertGhlOpportunityPage({
      mappingId: mapping.id,
      clientId: input.clientId,
      rows: page,
    });
    summary.contactRowCount += pageSummary.contactRowCount;
    summary.opportunityRowCount += pageSummary.opportunityRowCount;
    summary.matchedOpportunityCount += pageSummary.matchedOpportunityCount;
  }
  const calendars = await input.client.calendars({
    locationId: input.locationId,
    token: input.token,
  });
  const events = new Map<string, GhlCalendarEvent>();
  const appointmentFloor = new Date(
    input.runStartedAt.getTime() - APPOINTMENT_HISTORY_MS,
  );
  const appointmentThrough = new Date(
    input.runStartedAt.getTime() + APPOINTMENT_FUTURE_MS,
  );
  const calendarWindows = calendars.flatMap((calendar) => {
    const windows: Array<{ calendarId: string; start: Date; end: Date }> = [];
    for (
      let windowStart = appointmentFloor;
      windowStart < appointmentThrough;
      windowStart = new Date(windowStart.getTime() + APPOINTMENT_WINDOW_MS)
    ) {
      windows.push({
        calendarId: calendar.id,
        start: windowStart,
        end: new Date(
          Math.min(
            windowStart.getTime() + APPOINTMENT_WINDOW_MS,
            appointmentThrough.getTime(),
          ),
        ),
      });
    }
    return windows;
  });
  const eventPages = await mapInBatches(
    calendarWindows,
    GHL_CALENDAR_WINDOW_BATCH_SIZE,
    (window) =>
      input.client.calendarEvents({
        locationId: input.locationId,
        calendarId: window.calendarId,
        token: input.token,
        start: window.start,
        end: window.end,
      }),
    input.onPage,
  );
  for (const rows of eventPages) {
    for (const event of rows) events.set(event.id, event);
  }
  const contactRows = await mapInBatches(
    [...new Set([...events.values()].map((event) => event.contactId))],
    GHL_CONTACT_FETCH_BATCH_SIZE,
    (contactId) =>
      input.client.contact({
        contactId,
        locationId: input.locationId,
        token: input.token,
      }),
    input.onPage,
  );
  const contacts = new Map<string, GhlContact>(
    contactRows.map((contact) => [contact.id, contact]),
  );
  const appointmentSummary = await upsertGhlAppointmentBatch({
    mappingId: mapping.id,
    clientId: input.clientId,
    calendars,
    events: [...events.values()],
    contacts,
  });
  summary.appointmentRowCount = appointmentSummary.appointmentCount;
  summary.matchedAppointmentCount = appointmentSummary.matchedAppointmentCount;
  summary.contactRowCount += contacts.size;

  await db
    .update(integrationMappings)
    .set({ lastSuccessfulSyncAt: input.runStartedAt, updatedAt: new Date() })
    .where(eq(integrationMappings.id, mapping.id));
  return { mappingId: mapping.id, ...summary };
}
