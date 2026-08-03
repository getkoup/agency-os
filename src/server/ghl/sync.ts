import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  updateGhlSalespersonNames,
  upsertGhlAppointmentBatch,
} from "~/server/ghl/appointment-persistence";
import type { GhlCalendar, GhlClient, GhlContact } from "~/server/ghl/client";
import { db } from "~/server/db";
import { integrationMappings } from "~/server/db/schema";
import { upsertGhlOpportunityPage } from "~/server/ghl/persistence";
import { mapInBatches } from "~/server/sync/batch";
import {
  ghlAppointmentRange,
  ghlOpportunityFloor,
  type SynchronizationMode,
} from "~/server/sync/sync-mode";

const GHL_CONTACT_FETCH_BATCH_SIZE = 20;
const APPOINTMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const GHL_SYNC_CHECKPOINT_VERSION = 1;

const progressSchema = z.object({
  contactRowCount: z.number().int().nonnegative(),
  opportunityRowCount: z.number().int().nonnegative(),
  matchedOpportunityCount: z.number().int().nonnegative(),
  appointmentRowCount: z.number().int().nonnegative(),
  matchedAppointmentCount: z.number().int().nonnegative(),
});

const checkpointCalendarSchema = z.object({
  id: z.string().min(1),
  locationId: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean(),
});

const checkpointWindowSchema = z.object({
  calendarId: z.string().min(1),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
});

const ghlSyncCheckpointSchema = z.discriminatedUnion("phase", [
  z.object({
    version: z.literal(GHL_SYNC_CHECKPOINT_VERSION),
    phase: z.literal("initialize"),
  }),
  z.object({
    version: z.literal(GHL_SYNC_CHECKPOINT_VERSION),
    phase: z.literal("opportunities"),
    mappingId: z.string().uuid(),
    floor: z.string().datetime({ offset: true }),
    through: z.string().datetime({ offset: true }),
    pageUrl: z.string().url().nullable(),
    visitedPageUrls: z.array(z.string().url()),
    progress: progressSchema,
  }),
  z.object({
    version: z.literal(GHL_SYNC_CHECKPOINT_VERSION),
    phase: z.literal("appointments"),
    mappingId: z.string().uuid(),
    through: z.string().datetime({ offset: true }),
    calendars: z.array(checkpointCalendarSchema),
    windows: z.array(checkpointWindowSchema),
    nextWindowIndex: z.number().int().nonnegative(),
    progress: progressSchema,
  }),
]);

export interface GhlSyncSummary {
  contactRowCount: number;
  opportunityRowCount: number;
  matchedOpportunityCount: number;
  appointmentRowCount: number;
  matchedAppointmentCount: number;
}

export type GhlSyncCheckpoint = z.infer<typeof ghlSyncCheckpointSchema>;

export type GhlSyncChunkResult =
  | { done: false; checkpoint: GhlSyncCheckpoint }
  | {
      done: true;
      summary: GhlSyncSummary & { mappingId: string };
    };

function emptyProgress(): GhlSyncSummary {
  return {
    contactRowCount: 0,
    opportunityRowCount: 0,
    matchedOpportunityCount: 0,
    appointmentRowCount: 0,
    matchedAppointmentCount: 0,
  };
}

function initialCheckpoint(): GhlSyncCheckpoint {
  return {
    version: GHL_SYNC_CHECKPOINT_VERSION,
    phase: "initialize",
  };
}

async function prepareLocation(input: {
  client: GhlClient;
  clientId: string;
  locationId: string;
  mode: SynchronizationMode;
  token: string;
  runStartedAt: Date;
}): Promise<GhlSyncCheckpoint> {
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
      externalLocationId: integrationMappings.externalLocationId,
    });
  if (mapping?.externalLocationId !== input.locationId) {
    throw new Error("GHL mapping identity conflict");
  }
  const floor = ghlOpportunityFloor({
    mode: input.mode,
    runStartedAt: input.runStartedAt,
    syncFromAt: mapping.syncFromAt,
  });
  return {
    version: GHL_SYNC_CHECKPOINT_VERSION,
    phase: "opportunities",
    mappingId: mapping.id,
    floor: floor.toISOString(),
    through: input.runStartedAt.toISOString(),
    pageUrl: null,
    visitedPageUrls: [],
    progress: emptyProgress(),
  };
}

function appointmentWindows(
  calendars: readonly GhlCalendar[],
  runStartedAt: Date,
  mode: SynchronizationMode,
): Array<{ calendarId: string; start: string; end: string }> {
  const { floor, through } = ghlAppointmentRange(runStartedAt, mode);
  return calendars.flatMap((calendar) => {
    const windows: Array<{ calendarId: string; start: string; end: string }> =
      [];
    for (
      let windowStart = floor;
      windowStart < through;
      windowStart = new Date(windowStart.getTime() + APPOINTMENT_WINDOW_MS)
    ) {
      windows.push({
        calendarId: calendar.id,
        start: windowStart.toISOString(),
        end: new Date(
          Math.min(
            windowStart.getTime() + APPOINTMENT_WINDOW_MS,
            through.getTime(),
          ),
        ).toISOString(),
      });
    }
    return windows;
  });
}

async function processOpportunityPage(input: {
  client: GhlClient;
  clientId: string;
  locationId: string;
  mode: SynchronizationMode;
  token: string;
  checkpoint: Extract<GhlSyncCheckpoint, { phase: "opportunities" }>;
  onProgress?: () => Promise<void>;
}): Promise<GhlSyncChunkResult> {
  if (
    input.checkpoint.pageUrl &&
    input.checkpoint.visitedPageUrls.includes(input.checkpoint.pageUrl)
  ) {
    throw new Error("GHL returned a repeated pagination cursor");
  }
  const page = await input.client.wonOpportunityPage({
    locationId: input.locationId,
    token: input.token,
    floor: new Date(input.checkpoint.floor),
    through: new Date(input.checkpoint.through),
    pageUrl: input.checkpoint.pageUrl,
  });
  const pageSummary = await upsertGhlOpportunityPage({
    mappingId: input.checkpoint.mappingId,
    clientId: input.clientId,
    rows: page.rows,
  });
  const progress = {
    ...input.checkpoint.progress,
    contactRowCount:
      input.checkpoint.progress.contactRowCount + pageSummary.contactRowCount,
    opportunityRowCount:
      input.checkpoint.progress.opportunityRowCount +
      pageSummary.opportunityRowCount,
    matchedOpportunityCount:
      input.checkpoint.progress.matchedOpportunityCount +
      pageSummary.matchedOpportunityCount,
  };
  await input.onProgress?.();

  const visitedPageUrls = input.checkpoint.pageUrl
    ? [...input.checkpoint.visitedPageUrls, input.checkpoint.pageUrl]
    : input.checkpoint.visitedPageUrls;
  if (page.nextPageUrl) {
    if (visitedPageUrls.includes(page.nextPageUrl)) {
      throw new Error("GHL returned a repeated pagination cursor");
    }
    return {
      done: false,
      checkpoint: {
        ...input.checkpoint,
        pageUrl: page.nextPageUrl,
        visitedPageUrls,
        progress,
      },
    };
  }

  const calendars = await input.client.calendars({
    locationId: input.locationId,
    token: input.token,
  });
  return {
    done: false,
    checkpoint: {
      version: GHL_SYNC_CHECKPOINT_VERSION,
      phase: "appointments",
      mappingId: input.checkpoint.mappingId,
      through: input.checkpoint.through,
      calendars,
      windows: appointmentWindows(
        calendars,
        new Date(input.checkpoint.through),
        input.mode,
      ),
      nextWindowIndex: 0,
      progress,
    },
  };
}

async function refreshSalespersonNames(input: {
  client: GhlClient;
  clientId: string;
  locationId: string;
  token: string;
}): Promise<void> {
  try {
    const users = await input.client.locationUsers({
      locationId: input.locationId,
      token: input.token,
    });
    if (!users) return;
    await updateGhlSalespersonNames({ clientId: input.clientId, users });
  } catch (error) {
    console.warn("Optional GHL salesperson name synchronization failed", {
      clientId: input.clientId,
      locationId: input.locationId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage:
        error instanceof Error ? error.message : "Unknown GHL users error",
    });
  }
}

async function processAppointmentWindow(input: {
  client: GhlClient;
  clientId: string;
  locationId: string;
  token: string;
  checkpoint: Extract<GhlSyncCheckpoint, { phase: "appointments" }>;
  onProgress?: () => Promise<void>;
}): Promise<GhlSyncChunkResult> {
  const window = input.checkpoint.windows[input.checkpoint.nextWindowIndex];
  if (!window) {
    await refreshSalespersonNames(input);
    const completedAt = new Date(input.checkpoint.through);
    await db
      .update(integrationMappings)
      .set({ lastSuccessfulSyncAt: completedAt, updatedAt: new Date() })
      .where(eq(integrationMappings.id, input.checkpoint.mappingId));
    return {
      done: true,
      summary: {
        mappingId: input.checkpoint.mappingId,
        ...input.checkpoint.progress,
      },
    };
  }

  const events = await input.client.calendarEvents({
    locationId: input.locationId,
    calendarId: window.calendarId,
    token: input.token,
    start: new Date(window.start),
    end: new Date(window.end),
  });
  const contactRows = await mapInBatches(
    [...new Set(events.map((event) => event.contactId))],
    GHL_CONTACT_FETCH_BATCH_SIZE,
    (contactId) =>
      input.client.contact({
        contactId,
        locationId: input.locationId,
        token: input.token,
      }),
    input.onProgress,
  );
  const contacts = new Map<string, GhlContact>(
    contactRows.map((contact) => [contact.id, contact]),
  );
  const appointmentSummary = await upsertGhlAppointmentBatch({
    mappingId: input.checkpoint.mappingId,
    clientId: input.clientId,
    calendars: input.checkpoint.calendars,
    events,
    contacts,
  });
  const progress = {
    ...input.checkpoint.progress,
    contactRowCount: input.checkpoint.progress.contactRowCount + contacts.size,
    appointmentRowCount:
      input.checkpoint.progress.appointmentRowCount +
      appointmentSummary.appointmentCount,
    matchedAppointmentCount:
      input.checkpoint.progress.matchedAppointmentCount +
      appointmentSummary.matchedAppointmentCount,
  };
  await input.onProgress?.();
  return {
    done: false,
    checkpoint: {
      ...input.checkpoint,
      nextWindowIndex: input.checkpoint.nextWindowIndex + 1,
      progress,
    },
  };
}

export async function processGhlLocationSyncChunk(input: {
  client: GhlClient;
  clientId: string;
  locationId: string;
  mode?: SynchronizationMode;
  token: string;
  runStartedAt: Date;
  checkpoint: unknown;
  onProgress?: () => Promise<void>;
}): Promise<GhlSyncChunkResult> {
  const checkpoint = ghlSyncCheckpointSchema.parse(
    input.checkpoint ?? initialCheckpoint(),
  );
  const mode = input.mode ?? "full";
  if (checkpoint.phase === "initialize") {
    return {
      done: false,
      checkpoint: await prepareLocation({ ...input, mode }),
    };
  }
  if (checkpoint.phase === "opportunities") {
    return processOpportunityPage({ ...input, checkpoint, mode });
  }
  return processAppointmentWindow({ ...input, checkpoint });
}
