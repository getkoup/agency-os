import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { resolveAccessibleClientScope } from "~/features/dashboard/server/client-scope";
import { type UserRole } from "~/lib/roles";
import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clientSynchronizationStates,
  clients,
  ghlClientConfigurations,
  sourceAccounts,
  users,
} from "~/server/db/schema";
import { CLIENT_SYNC_COOLDOWN_MS } from "~/server/sync/sync-mode";

export async function getAllClientSyncRuns() {
  const runs = await db
    .select({
      id: allClientSyncRuns.id,
      status: allClientSyncRuns.status,
      mode: allClientSyncRuns.mode,
      scope: allClientSyncRuns.scope,
      trigger: allClientSyncRuns.trigger,
      requestedClientId: allClientSyncRuns.requestedClientId,
      startedAt: allClientSyncRuns.startedAt,
      heartbeatAt: allClientSyncRuns.heartbeatAt,
      completedAt: allClientSyncRuns.completedAt,
      requesterName: users.name,
      requesterEmail: users.email,
      discoveredAccountCount: allClientSyncRuns.discoveredAccountCount,
      performanceRowCount: allClientSyncRuns.performanceRowCount,
      leadRowCount: allClientSyncRuns.leadRowCount,
      contactRowCount: allClientSyncRuns.contactRowCount,
      opportunityRowCount: allClientSyncRuns.opportunityRowCount,
      matchedOpportunityCount: allClientSyncRuns.matchedOpportunityCount,
      errorMessage: allClientSyncRuns.errorMessage,
    })
    .from(allClientSyncRuns)
    .leftJoin(users, eq(users.id, allClientSyncRuns.requestedByUserId))
    .orderBy(desc(allClientSyncRuns.startedAt))
    .limit(25);
  if (runs.length === 0) return [];
  const targets = await db
    .select({
      id: allClientSyncTargets.id,
      runId: allClientSyncTargets.runId,
      clientId: allClientSyncTargets.clientId,
      integrationMappingId: allClientSyncTargets.integrationMappingId,
      clientSlug: allClientSyncTargets.clientSlug,
      clientName: allClientSyncTargets.clientName,
      provider: allClientSyncTargets.provider,
      priority: allClientSyncTargets.priority,
      status: allClientSyncTargets.status,
      startedAt: allClientSyncTargets.startedAt,
      completedAt: allClientSyncTargets.completedAt,
      sourceAccountCount: allClientSyncTargets.sourceAccountCount,
      performanceRowCount: allClientSyncTargets.performanceRowCount,
      leadRowCount: allClientSyncTargets.leadRowCount,
      contactRowCount: allClientSyncTargets.contactRowCount,
      opportunityRowCount: allClientSyncTargets.opportunityRowCount,
      matchedOpportunityCount: allClientSyncTargets.matchedOpportunityCount,
      errorMessage: allClientSyncTargets.errorMessage,
    })
    .from(allClientSyncTargets)
    .where(
      inArray(
        allClientSyncTargets.runId,
        runs.map(({ id }) => id),
      ),
    )
    .orderBy(allClientSyncTargets.startedAt, allClientSyncTargets.clientName);
  return runs.map((run) => ({
    ...run,
    targets: targets.filter((target) => target.runId === run.id),
  }));
}

type ProviderStatus = {
  configured: boolean;
  lastAttemptAt: Date | null;
  lastSucceededAt: Date | null;
  status: "failed" | "idle" | "pending" | "running" | "succeeded";
};

function providerStatus(input: {
  activeStatus: "pending" | "running" | undefined;
  configured: boolean;
  lastAttemptAt: Date | null;
  lastFailedAt: Date | null;
  lastSucceededAt: Date | null;
}): ProviderStatus {
  let status: ProviderStatus["status"] = "idle";
  if (input.activeStatus) {
    status = input.activeStatus;
  } else if (
    input.lastFailedAt &&
    (!input.lastSucceededAt || input.lastFailedAt > input.lastSucceededAt)
  ) {
    status = "failed";
  } else if (input.lastSucceededAt) {
    status = "succeeded";
  }
  return {
    configured: input.configured,
    lastAttemptAt: input.lastAttemptAt,
    lastSucceededAt: input.lastSucceededAt,
    status,
  };
}

export async function getSynchronizationClientStatuses(user: {
  id: string;
  role: UserRole;
}) {
  const scope = await resolveAccessibleClientScope(user, undefined);
  const clientRows = await db
    .select({ id: clients.id, name: clients.name, slug: clients.slug })
    .from(clients)
    .where(
      and(
        eq(clients.status, "active"),
        scope.clientIds === null
          ? undefined
          : scope.clientIds.length
            ? inArray(clients.id, scope.clientIds)
            : sql`false`,
      ),
    )
    .orderBy(asc(clients.name), asc(clients.id));
  const clientIds = clientRows.map(({ id }) => id);
  if (clientIds.length === 0) return [];
  const [stateRows, activeTargets, ghlConfigurationRows, windsorAccountRows] =
    await Promise.all([
      db
        .select({
          clientId: clientSynchronizationStates.clientId,
          provider: clientSynchronizationStates.provider,
          lastAttemptAt: clientSynchronizationStates.lastAttemptAt,
          lastSucceededAt: clientSynchronizationStates.lastSucceededAt,
          lastFailedAt: clientSynchronizationStates.lastFailedAt,
        })
        .from(clientSynchronizationStates)
        .where(inArray(clientSynchronizationStates.clientId, clientIds)),
      db
        .select({
          clientId: allClientSyncTargets.clientId,
          provider: allClientSyncTargets.provider,
          status: allClientSyncTargets.status,
        })
        .from(allClientSyncTargets)
        .where(
          and(
            inArray(allClientSyncTargets.clientId, clientIds),
            inArray(allClientSyncTargets.status, ["pending", "running"]),
          ),
        ),
      db
        .select({ clientId: ghlClientConfigurations.clientId })
        .from(ghlClientConfigurations)
        .where(inArray(ghlClientConfigurations.clientId, clientIds)),
      db
        .select({
          clientId: sourceAccounts.clientId,
          count: sql<number>`count(*)::int`,
        })
        .from(sourceAccounts)
        .where(
          and(
            eq(sourceAccounts.dataProvider, "windsor"),
            eq(sourceAccounts.status, "active"),
            inArray(sourceAccounts.clientId, clientIds),
          ),
        )
        .groupBy(sourceAccounts.clientId),
    ]);
  const stateByProvider = new Map(
    stateRows.map((state) => [`${state.clientId}:${state.provider}`, state]),
  );
  const activeByProvider = new Map(
    activeTargets.flatMap((target) =>
      target.clientId &&
      (target.status === "pending" || target.status === "running")
        ? [[`${target.clientId}:${target.provider}`, target.status] as const]
        : [],
    ),
  );
  const ghlClientIds = new Set(
    ghlConfigurationRows.map(({ clientId }) => clientId),
  );
  const windsorCounts = new Map(
    windsorAccountRows.flatMap(({ clientId, count }) =>
      clientId ? [[clientId, count] as const] : [],
    ),
  );

  return clientRows.map((client) => {
    const ghlState = stateByProvider.get(`${client.id}:ghl`);
    const windsorState = stateByProvider.get(`${client.id}:windsor`);
    const ghl = providerStatus({
      activeStatus: activeByProvider.get(`${client.id}:ghl`),
      configured: ghlClientIds.has(client.id),
      lastAttemptAt: ghlState?.lastAttemptAt ?? null,
      lastFailedAt: ghlState?.lastFailedAt ?? null,
      lastSucceededAt: ghlState?.lastSucceededAt ?? null,
    });
    const windsor = providerStatus({
      activeStatus: activeByProvider.get(`${client.id}:windsor`),
      configured: (windsorCounts.get(client.id) ?? 0) > 0,
      lastAttemptAt: windsorState?.lastAttemptAt ?? null,
      lastFailedAt: windsorState?.lastFailedAt ?? null,
      lastSucceededAt: windsorState?.lastSucceededAt ?? null,
    });
    const latestAttemptAt = [
      ghl.lastAttemptAt,
      windsor.lastAttemptAt,
    ].reduce<Date | null>(
      (latest, value) =>
        !value || (latest && value <= latest) ? latest : value,
      null,
    );
    return {
      ...client,
      ghl,
      windsor,
      nextManualSyncAt: latestAttemptAt
        ? new Date(latestAttemptAt.getTime() + CLIENT_SYNC_COOLDOWN_MS)
        : null,
    };
  });
}
