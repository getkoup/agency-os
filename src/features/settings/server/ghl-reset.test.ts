import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { deleteManagedClient } from "~/features/management/server/actions";
import {
  resetGhlClientIntegration,
  saveGhlClientConfiguration,
} from "~/features/settings/server/actions";
import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clients,
  clientSynchronizationStates,
  ghlAppointmentMatches,
  ghlAppointments,
  ghlCalendars,
  ghlClientConfigurations,
  ghlContacts,
  ghlOpportunities,
  ghlOpportunityMatches,
  integrationMappings,
} from "~/server/db/schema";

const clientIds: string[] = [];
const runIds: string[] = [];

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const locationId = decodeURIComponent(
        url.pathname.split("/").at(-1) ?? "",
      );
      return Response.json({ location: { id: locationId, timezone: "UTC" } });
    }),
  );
});

afterEach(async () => {
  if (runIds.length) {
    await db
      .delete(allClientSyncRuns)
      .where(inArray(allClientSyncRuns.id, runIds));
    runIds.length = 0;
  }
  if (clientIds.length) {
    await db.delete(clients).where(inArray(clients.id, clientIds));
    clientIds.length = 0;
  }
});
interface GhlFixture {
  appointmentId: string;
  clientId: string;
  mappingId: string;
  opportunityId: string;
  slug: string;
}

async function createGhlFixture(slug: string) {
  const [client] = await db
    .insert(clients)
    .values({
      slug,
      name: slug
        .split("-")
        .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
        .join(" "),
      dailyBookingGoal: 12,
    })
    .returning({ id: clients.id, name: clients.name });
  if (!client) throw new Error("Could not create GHL reset test client");
  clientIds.push(client.id);

  const locationId = `${slug}-location`;
  await saveGhlClientConfiguration({
    clientId: client.id,
    locationId,
    token: `${slug}-private-token`,
    userId: null,
  });
  const [mapping] = await db
    .insert(integrationMappings)
    .values({
      clientId: client.id,
      provider: "ghl",
      externalLocationId: locationId,
      timezone: "UTC",
      syncFromAt: new Date("2026-08-01T00:00:00.000Z"),
      lastSuccessfulSyncAt: new Date("2026-08-02T00:00:00.000Z"),
    })
    .returning({ id: integrationMappings.id });
  if (!mapping) throw new Error("Could not create GHL reset test mapping");

  const [contact] = await db
    .insert(ghlContacts)
    .values({
      integrationMappingId: mapping.id,
      externalId: `${slug}-contact`,
      providerUpdatedAt: new Date("2026-08-02T00:00:00.000Z"),
      rawPayload: {},
    })
    .returning({ id: ghlContacts.id });
  const [calendar] = await db
    .insert(ghlCalendars)
    .values({
      integrationMappingId: mapping.id,
      externalId: `${slug}-calendar`,
      name: `${client.name} Calendar`,
    })
    .returning({ id: ghlCalendars.id });
  if (!contact || !calendar) {
    throw new Error("Could not create GHL reset contact and calendar");
  }

  const [opportunity] = await db
    .insert(ghlOpportunities)
    .values({
      integrationMappingId: mapping.id,
      contactId: contact.id,
      externalId: `${slug}-opportunity`,
      status: "won",
      wonAt: new Date("2026-08-02T00:00:00.000Z"),
      providerUpdatedAt: new Date("2026-08-02T00:00:00.000Z"),
      rawPayload: {},
    })
    .returning({ id: ghlOpportunities.id });
  const [appointment] = await db
    .insert(ghlAppointments)
    .values({
      integrationMappingId: mapping.id,
      calendarId: calendar.id,
      contactId: contact.id,
      externalId: `${slug}-appointment`,
      status: "confirmed",
      startsAt: new Date("2026-08-03T12:00:00.000Z"),
      endsAt: new Date("2026-08-03T13:00:00.000Z"),
      providerCreatedAt: new Date("2026-08-02T00:00:00.000Z"),
      providerUpdatedAt: new Date("2026-08-02T00:00:00.000Z"),
      rawPayload: {},
    })
    .returning({ id: ghlAppointments.id });
  if (!opportunity || !appointment) {
    throw new Error("Could not create GHL reset history");
  }
  await db.insert(ghlOpportunityMatches).values({
    opportunityId: opportunity.id,
    status: "unmatched",
    candidateCount: 0,
  });
  await db.insert(ghlAppointmentMatches).values({
    appointmentId: appointment.id,
    status: "unmatched",
    candidateCount: 0,
  });
  await db.insert(clientSynchronizationStates).values([
    { clientId: client.id, provider: "ghl" },
    { clientId: client.id, provider: "windsor" },
  ]);

  return {
    appointmentId: appointment.id,
    clientId: client.id,
    mappingId: mapping.id,
    opportunityId: opportunity.id,
    slug,
  };
}

async function createSyncTarget(
  fixture: GhlFixture,
  status: "pending" | "succeeded",
) {
  const [run] = await db
    .insert(allClientSyncRuns)
    .values({
      requestedClientId: fixture.clientId,
      scope: "client",
      status: status === "pending" ? "running" : "succeeded",
      completedAt: status === "succeeded" ? new Date() : null,
    })
    .returning({ id: allClientSyncRuns.id });
  if (!run) throw new Error("Could not create GHL reset sync run");
  runIds.push(run.id);
  const [target] = await db
    .insert(allClientSyncTargets)
    .values({
      runId: run.id,
      clientId: fixture.clientId,
      integrationMappingId: fixture.mappingId,
      clientSlug: fixture.slug,
      clientName: fixture.slug,
      provider: "ghl",
      status,
      completedAt: status === "succeeded" ? new Date() : null,
    })
    .returning({ id: allClientSyncTargets.id });
  if (!target) throw new Error("Could not create GHL reset sync target");
  return target.id;
}

describe("GHL integration reset", () => {
  it("blocks reset while this client's GHL synchronization is active", async () => {
    const fixture = await createGhlFixture("ghl-reset-active");
    const targetId = await createSyncTarget(fixture, "pending");

    await expect(
      resetGhlClientIntegration(fixture.clientId),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      db
        .select({ id: integrationMappings.id })
        .from(integrationMappings)
        .where(eq(integrationMappings.id, fixture.mappingId)),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select({ clientId: ghlClientConfigurations.clientId })
        .from(ghlClientConfigurations)
        .where(eq(ghlClientConfigurations.clientId, fixture.clientId)),
    ).resolves.toHaveLength(1);

    await db
      .update(allClientSyncTargets)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(allClientSyncTargets.id, targetId));
    await expect(resetGhlClientIntegration(fixture.clientId)).resolves.toEqual({
      success: true,
      deletedMappingCount: 1,
    });
  });

  it("deletes only the selected client's GHL integration and permits client deletion", async () => {
    const selected = await createGhlFixture("ghl-reset-selected");
    const untouched = await createGhlFixture("ghl-reset-untouched");
    const historicalTargetId = await createSyncTarget(selected, "succeeded");

    await expect(resetGhlClientIntegration(selected.clientId)).resolves.toEqual(
      {
        success: true,
        deletedMappingCount: 1,
      },
    );

    const [
      selectedMappings,
      selectedCredentials,
      selectedContacts,
      selectedCalendars,
    ] = await Promise.all([
      db
        .select({ id: integrationMappings.id })
        .from(integrationMappings)
        .where(eq(integrationMappings.clientId, selected.clientId)),
      db
        .select({ clientId: ghlClientConfigurations.clientId })
        .from(ghlClientConfigurations)
        .where(eq(ghlClientConfigurations.clientId, selected.clientId)),
      db
        .select({ id: ghlContacts.id })
        .from(ghlContacts)
        .where(eq(ghlContacts.integrationMappingId, selected.mappingId)),
      db
        .select({ id: ghlCalendars.id })
        .from(ghlCalendars)
        .where(eq(ghlCalendars.integrationMappingId, selected.mappingId)),
    ]);
    expect(selectedMappings).toHaveLength(0);
    expect(selectedCredentials).toHaveLength(0);
    expect(selectedContacts).toHaveLength(0);
    expect(selectedCalendars).toHaveLength(0);
    await expect(
      db
        .select({ id: ghlOpportunities.id })
        .from(ghlOpportunities)
        .where(eq(ghlOpportunities.id, selected.opportunityId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select({ id: ghlAppointments.id })
        .from(ghlAppointments)
        .where(eq(ghlAppointments.id, selected.appointmentId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select({ opportunityId: ghlOpportunityMatches.opportunityId })
        .from(ghlOpportunityMatches)
        .where(eq(ghlOpportunityMatches.opportunityId, selected.opportunityId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select({ appointmentId: ghlAppointmentMatches.appointmentId })
        .from(ghlAppointmentMatches)
        .where(eq(ghlAppointmentMatches.appointmentId, selected.appointmentId)),
    ).resolves.toHaveLength(0);

    const selectedStates = await db
      .select({ provider: clientSynchronizationStates.provider })
      .from(clientSynchronizationStates)
      .where(eq(clientSynchronizationStates.clientId, selected.clientId));
    expect(selectedStates).toEqual([{ provider: "windsor" }]);
    const [historicalTarget] = await db
      .select({
        integrationMappingId: allClientSyncTargets.integrationMappingId,
      })
      .from(allClientSyncTargets)
      .where(eq(allClientSyncTargets.id, historicalTargetId));
    expect(historicalTarget?.integrationMappingId).toBeNull();

    await expect(
      db
        .select({ id: integrationMappings.id })
        .from(integrationMappings)
        .where(eq(integrationMappings.id, untouched.mappingId)),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select({ id: ghlAppointments.id })
        .from(ghlAppointments)
        .where(eq(ghlAppointments.id, untouched.appointmentId)),
    ).resolves.toHaveLength(1);

    await expect(deleteManagedClient(selected.clientId)).resolves.toEqual({
      success: true,
    });
    await expect(
      db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, selected.clientId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.id, untouched.clientId),
            eq(clients.dailyBookingGoal, 12),
          ),
        ),
    ).resolves.toHaveLength(1);
  });
});
