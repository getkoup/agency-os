import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
} from "drizzle-orm";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clients,
  sourceAccounts,
  syncRuns,
} from "~/server/db/schema";
import { loadStoredGhlConfig } from "~/server/ghl/configuration";
import type { GhlConfig } from "~/server/ghl/env";
import {
  ALL_CLIENT_SYNC_STALE_AFTER_MS,
  CLIENT_SYNC_SUCCESS_BUFFER_MS,
} from "~/server/sync/run-status";
import { WindsorClient } from "~/server/windsor/client";
import { discoverWindsorSourceAccounts } from "~/server/windsor/sync";

interface ActiveClient {
  id: string;
  slug: string;
  name: string;
}

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("A synchronization is already running");
    this.name = "SyncAlreadyRunningError";
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}

export async function recoverStaleSyncRuns(startedAt: Date) {
  const staleRuns = await db
    .update(allClientSyncRuns)
    .set({
      status: "failed",
      completedAt: startedAt,
      workerLeaseExpiresAt: null,
      errorMessage: "Synchronization heartbeat expired",
    })
    .where(
      and(
        eq(allClientSyncRuns.status, "running"),
        lt(
          allClientSyncRuns.heartbeatAt,
          new Date(startedAt.getTime() - ALL_CLIENT_SYNC_STALE_AFTER_MS),
        ),
      ),
    )
    .returning({
      id: allClientSyncRuns.id,
      windsorSyncRunId: allClientSyncRuns.windsorSyncRunId,
    });
  if (staleRuns.length === 0) return;

  await db
    .update(allClientSyncTargets)
    .set({
      status: "failed",
      completedAt: startedAt,
      leaseExpiresAt: null,
      errorMessage: "Synchronization heartbeat expired",
    })
    .where(
      and(
        inArray(
          allClientSyncTargets.runId,
          staleRuns.map(({ id }) => id),
        ),
        inArray(allClientSyncTargets.status, ["pending", "running"]),
      ),
    );
  const staleProviderRunIds = staleRuns.flatMap(({ windsorSyncRunId }) =>
    windsorSyncRunId ? [windsorSyncRunId] : [],
  );
  if (staleProviderRunIds.length > 0) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt: startedAt,
        errorMessage: "Synchronization heartbeat expired",
      })
      .where(
        and(
          inArray(syncRuns.id, staleProviderRunIds),
          eq(syncRuns.status, "running"),
        ),
      );
  }
}

async function createRun(requestedByUserId: string, startedAt: Date) {
  await recoverStaleSyncRuns(startedAt);
  try {
    return await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(allClientSyncRuns)
        .values({ requestedByUserId, startedAt, heartbeatAt: startedAt })
        .returning({ id: allClientSyncRuns.id });
      if (!run) throw new Error("Could not create all-client sync run");
      const [windsorRun] = await tx
        .insert(syncRuns)
        .values({ dataProvider: "windsor", startedAt })
        .returning({ id: syncRuns.id });
      if (!windsorRun) throw new Error("Could not create Windsor provider run");
      await tx
        .update(allClientSyncRuns)
        .set({ windsorSyncRunId: windsorRun.id })
        .where(eq(allClientSyncRuns.id, run.id));
      return { id: run.id, windsorRunId: windsorRun.id };
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new SyncAlreadyRunningError();
    }
    throw error;
  }
}

function clientProviderKey(clientId: string, provider: string): string {
  return `${clientId}:${provider}`;
}

async function getRecentlySuccessfulClientProviders(input: {
  activeClients: readonly ActiveClient[];
  startedAt: Date;
}): Promise<Set<string>> {
  const clientIds = input.activeClients.map(({ id }) => id);
  if (clientIds.length === 0) return new Set();
  const completedAfter = new Date(
    input.startedAt.getTime() - CLIENT_SYNC_SUCCESS_BUFFER_MS,
  );
  const latestTargets = await db
    .selectDistinctOn(
      [allClientSyncTargets.clientId, allClientSyncTargets.provider],
      {
        clientId: allClientSyncTargets.clientId,
        provider: allClientSyncTargets.provider,
        status: allClientSyncTargets.status,
      },
    )
    .from(allClientSyncTargets)
    .where(
      and(
        inArray(allClientSyncTargets.clientId, clientIds),
        inArray(allClientSyncTargets.status, ["succeeded", "failed"]),
        isNotNull(allClientSyncTargets.completedAt),
        gte(allClientSyncTargets.completedAt, completedAfter),
      ),
    )
    .orderBy(
      asc(allClientSyncTargets.clientId),
      asc(allClientSyncTargets.provider),
      desc(allClientSyncTargets.completedAt),
      desc(allClientSyncTargets.startedAt),
    );
  return new Set(
    latestTargets.flatMap((target) =>
      target.clientId && target.status === "succeeded"
        ? [clientProviderKey(target.clientId, target.provider)]
        : [],
    ),
  );
}

async function createTargets(input: {
  runId: string;
  startedAt: Date;
  activeClients: readonly ActiveClient[];
  ghlConfig: GhlConfig;
  recentlySuccessfulClientProviders: ReadonlySet<string>;
}) {
  const configuredSlugs = new Set(
    input.ghlConfig.mappings.map(({ clientSlug }) => clientSlug),
  );
  const activeSlugs = new Set(input.activeClients.map(({ slug }) => slug));
  const targetValues: Array<typeof allClientSyncTargets.$inferInsert> =
    input.activeClients.flatMap((client) => {
      const hasGhlConfiguration = configuredSlugs.has(client.slug);
      const recentlySyncedWindsor = input.recentlySuccessfulClientProviders.has(
        clientProviderKey(client.id, "windsor"),
      );
      const recentlySyncedGhl = input.recentlySuccessfulClientProviders.has(
        clientProviderKey(client.id, "ghl"),
      );
      const ghlSkipReason = !hasGhlConfiguration
        ? "No GHL location configured"
        : recentlySyncedGhl
          ? "Successfully synchronized within the last 60 minutes"
          : null;
      return [
        {
          runId: input.runId,
          clientId: client.id,
          clientSlug: client.slug,
          clientName: client.name,
          provider: "windsor",
          status: recentlySyncedWindsor
            ? ("skipped" as const)
            : ("pending" as const),
          completedAt: recentlySyncedWindsor ? input.startedAt : null,
          errorMessage: recentlySyncedWindsor
            ? "Successfully synchronized within the last 60 minutes"
            : null,
        },
        {
          runId: input.runId,
          clientId: client.id,
          clientSlug: client.slug,
          clientName: client.name,
          provider: "ghl",
          status: ghlSkipReason ? ("skipped" as const) : ("pending" as const),
          completedAt: ghlSkipReason ? input.startedAt : null,
          errorMessage: ghlSkipReason,
        },
      ];
    });
  targetValues.push(
    ...input.ghlConfig.mappings
      .filter((mapping) => !activeSlugs.has(mapping.clientSlug))
      .map((mapping) => ({
        runId: input.runId,
        clientSlug: mapping.clientSlug,
        clientName: mapping.clientName,
        provider: "ghl",
        status: "failed" as const,
        completedAt: input.startedAt,
        errorMessage: "Expected active client is missing",
      })),
  );
  if (targetValues.length > 0) {
    await db.insert(allClientSyncTargets).values(targetValues);
  }
}

async function prepareWindsorTargets(input: {
  client: WindsorClient;
  runId: string;
  activeClients: readonly ActiveClient[];
}): Promise<number> {
  const pendingTargets = await db
    .select({ clientId: allClientSyncTargets.clientId })
    .from(allClientSyncTargets)
    .where(
      and(
        eq(allClientSyncTargets.runId, input.runId),
        eq(allClientSyncTargets.provider, "windsor"),
        eq(allClientSyncTargets.status, "pending"),
      ),
    );
  const pendingClientIds = new Set(
    pendingTargets.flatMap(({ clientId }) => (clientId ? [clientId] : [])),
  );
  const activeClients = input.activeClients.filter(({ id }) =>
    pendingClientIds.has(id),
  );
  if (activeClients.length === 0) return 0;

  let discoveredAccountCount = 0;
  try {
    ({ discoveredAccountCount } = await discoverWindsorSourceAccounts(
      input.client,
      { provisionMappedClients: false },
    ));
  } catch (error) {
    const completedAt = new Date();
    await db
      .update(allClientSyncTargets)
      .set({
        status: "failed",
        completedAt,
        errorMessage: safeError(error),
      })
      .where(
        and(
          eq(allClientSyncTargets.runId, input.runId),
          eq(allClientSyncTargets.provider, "windsor"),
          eq(allClientSyncTargets.status, "pending"),
        ),
      );
    return discoveredAccountCount;
  }

  const clientIds = activeClients.map(({ id }) => id);
  const countRows = await db
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
    .groupBy(sourceAccounts.clientId);
  const counts = new Map(
    countRows.flatMap((row) =>
      row.clientId ? [[row.clientId, row.count] as const] : [],
    ),
  );
  for (const client of activeClients) {
    const sourceAccountCount = counts.get(client.id) ?? 0;
    await db
      .update(allClientSyncTargets)
      .set(
        sourceAccountCount === 0
          ? {
              status: "skipped",
              completedAt: new Date(),
              sourceAccountCount,
              errorMessage: "No active Windsor accounts",
            }
          : { sourceAccountCount },
      )
      .where(
        and(
          eq(allClientSyncTargets.runId, input.runId),
          eq(allClientSyncTargets.clientId, client.id),
          eq(allClientSyncTargets.provider, "windsor"),
          eq(allClientSyncTargets.status, "pending"),
        ),
      );
  }
  return discoveredAccountCount;
}

async function failRunSetup(
  runId: string,
  windsorRunId: string,
  error: unknown,
) {
  const completedAt = new Date();
  const errorMessage = `Synchronization could not be queued: ${safeError(error)}`;
  await db.transaction(async (tx) => {
    await tx
      .update(allClientSyncTargets)
      .set({ status: "failed", completedAt, errorMessage })
      .where(
        and(
          eq(allClientSyncTargets.runId, runId),
          inArray(allClientSyncTargets.status, ["pending", "running"]),
        ),
      );
    await tx
      .update(syncRuns)
      .set({ status: "failed", completedAt, errorMessage })
      .where(eq(syncRuns.id, windsorRunId));
    await tx
      .update(allClientSyncRuns)
      .set({
        status: "failed",
        completedAt,
        heartbeatAt: completedAt,
        workerLeaseExpiresAt: null,
        errorMessage,
      })
      .where(eq(allClientSyncRuns.id, runId));
  });
}

export async function getSyncRun(runId: string) {
  const [run] = await db
    .select({
      id: allClientSyncRuns.id,
      requestedByUserId: allClientSyncRuns.requestedByUserId,
      status: allClientSyncRuns.status,
      startedAt: allClientSyncRuns.startedAt,
      heartbeatAt: allClientSyncRuns.heartbeatAt,
      completedAt: allClientSyncRuns.completedAt,
      windsorSyncRunId: allClientSyncRuns.windsorSyncRunId,
      discoveredAccountCount: allClientSyncRuns.discoveredAccountCount,
      performanceRowCount: allClientSyncRuns.performanceRowCount,
      leadRowCount: allClientSyncRuns.leadRowCount,
      contactRowCount: allClientSyncRuns.contactRowCount,
      opportunityRowCount: allClientSyncRuns.opportunityRowCount,
      matchedOpportunityCount: allClientSyncRuns.matchedOpportunityCount,
      errorMessage: allClientSyncRuns.errorMessage,
    })
    .from(allClientSyncRuns)
    .where(eq(allClientSyncRuns.id, runId));
  if (!run) throw new Error("Queued synchronization run disappeared");
  const targets = await db
    .select({
      id: allClientSyncTargets.id,
      runId: allClientSyncTargets.runId,
      clientId: allClientSyncTargets.clientId,
      integrationMappingId: allClientSyncTargets.integrationMappingId,
      clientSlug: allClientSyncTargets.clientSlug,
      clientName: allClientSyncTargets.clientName,
      provider: allClientSyncTargets.provider,
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
    .where(eq(allClientSyncTargets.runId, runId))
    .orderBy(
      asc(allClientSyncTargets.startedAt),
      asc(allClientSyncTargets.clientName),
    );
  return { ...run, targets };
}

export async function syncAllClients(
  requestedByUserId: string,
  dependencies: {
    windsorClient?: WindsorClient;
    ghlConfig?: GhlConfig;
  } = {},
) {
  const startedAt = new Date();
  const windsorClient = dependencies.windsorClient ?? new WindsorClient();
  const ghlConfig = dependencies.ghlConfig ?? (await loadStoredGhlConfig());
  const run = await createRun(requestedByUserId, startedAt);

  try {
    const activeClients = await db
      .select({ id: clients.id, slug: clients.slug, name: clients.name })
      .from(clients)
      .where(eq(clients.status, "active"))
      .orderBy(asc(clients.slug), asc(clients.id));
    const recentlySuccessfulClientProviders =
      await getRecentlySuccessfulClientProviders({ activeClients, startedAt });
    await createTargets({
      runId: run.id,
      startedAt,
      activeClients,
      ghlConfig,
      recentlySuccessfulClientProviders,
    });
    const discoveredAccountCount = await prepareWindsorTargets({
      client: windsorClient,
      runId: run.id,
      activeClients,
    });
    await db
      .update(allClientSyncRuns)
      .set({ discoveredAccountCount, heartbeatAt: new Date() })
      .where(eq(allClientSyncRuns.id, run.id));
    return getSyncRun(run.id);
  } catch (error) {
    await failRunSetup(run.id, run.windsorRunId, error);
    throw error;
  }
}
