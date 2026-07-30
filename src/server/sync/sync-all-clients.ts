import "server-only";

import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clients,
  sourceAccounts,
  syncRuns,
} from "~/server/db/schema";
import { GhlClient } from "~/server/ghl/client";
import { loadStoredGhlConfig } from "~/server/ghl/configuration";
import { type GhlConfig, type GhlClientMapping } from "~/server/ghl/env";
import { syncGhlLocation } from "~/server/ghl/sync";
import { mapInBatches } from "~/server/sync/batch";
import { ALL_CLIENT_SYNC_STALE_AFTER_MS } from "~/server/sync/run-status";
import { WindsorClient } from "~/server/windsor/client";
import {
  discoverWindsorSourceAccounts,
  syncWindsorData,
  WindsorDataSyncError,
} from "~/server/windsor/sync";

const WINDSOR_CLIENT_BATCH_SIZE = 4;
const GHL_CLIENT_BATCH_SIZE = 4;

interface ActiveClient {
  id: string;
  slug: string;
  name: string;
}

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("An all-client synchronization is already running");
    this.name = "SyncAlreadyRunningError";
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}

function targetKey(provider: "windsor" | "ghl", clientSlug: string) {
  return `${provider}:${clientSlug}`;
}

async function heartbeat(runId: string) {
  await db
    .update(allClientSyncRuns)
    .set({ heartbeatAt: new Date() })
    .where(eq(allClientSyncRuns.id, runId));
}

async function finishTarget(
  targetId: string,
  values: Partial<typeof allClientSyncTargets.$inferInsert> & {
    status: "succeeded" | "failed" | "skipped";
  },
) {
  await db
    .update(allClientSyncTargets)
    .set({ ...values, completedAt: new Date() })
    .where(eq(allClientSyncTargets.id, targetId));
}

async function failUnexpectedRun(
  runId: string,
  windsorRunId: string | null,
  error: unknown,
) {
  const completedAt = new Date();
  const errorMessage = `Synchronization aborted: ${safeError(error)}`;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(allClientSyncTargets)
        .set({ status: "failed", completedAt, errorMessage })
        .where(
          and(
            eq(allClientSyncTargets.runId, runId),
            eq(allClientSyncTargets.status, "running"),
          ),
        );
      if (windsorRunId) {
        await tx
          .update(syncRuns)
          .set({ status: "failed", completedAt, errorMessage })
          .where(
            and(eq(syncRuns.id, windsorRunId), eq(syncRuns.status, "running")),
          );
      }
      await tx
        .update(allClientSyncRuns)
        .set({
          status: "failed",
          completedAt,
          heartbeatAt: completedAt,
          errorMessage,
        })
        .where(
          and(
            eq(allClientSyncRuns.id, runId),
            eq(allClientSyncRuns.status, "running"),
          ),
        );
    });
  } catch (cleanupError) {
    throw new Error(
      "Synchronization failed and its run could not be finalized",
      { cause: new AggregateError([error, cleanupError]) },
    );
  }
}

async function createRun(requestedByUserId: string, startedAt: Date) {
  try {
    return await db.transaction(async (tx) => {
      const staleRuns = await tx
        .update(allClientSyncRuns)
        .set({
          status: "failed",
          completedAt: startedAt,
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
      if (staleRuns.length > 0) {
        await tx
          .update(allClientSyncTargets)
          .set({
            status: "failed",
            completedAt: startedAt,
            errorMessage: "Synchronization heartbeat expired",
          })
          .where(
            and(
              inArray(
                allClientSyncTargets.runId,
                staleRuns.map(({ id }) => id),
              ),
              eq(allClientSyncTargets.status, "running"),
            ),
          );
        const staleProviderRunIds = staleRuns.flatMap(({ windsorSyncRunId }) =>
          windsorSyncRunId ? [windsorSyncRunId] : [],
        );
        if (staleProviderRunIds.length > 0) {
          await tx
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
      const [run] = await tx
        .insert(allClientSyncRuns)
        .values({ requestedByUserId, startedAt, heartbeatAt: startedAt })
        .returning({ id: allClientSyncRuns.id });
      if (!run) throw new Error("Could not create all-client sync run");
      return run;
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

async function createTargets(input: {
  runId: string;
  startedAt: Date;
  activeClients: readonly ActiveClient[];
  ghlConfig: GhlConfig;
}) {
  const configuredSlugs = new Set(
    input.ghlConfig.mappings.map(({ clientSlug }) => clientSlug),
  );
  const activeSlugs = new Set(input.activeClients.map(({ slug }) => slug));
  const targetValues: Array<typeof allClientSyncTargets.$inferInsert> =
    input.activeClients.flatMap((client) => {
      const hasGhlConfiguration = configuredSlugs.has(client.slug);
      return [
        {
          runId: input.runId,
          clientId: client.id,
          clientSlug: client.slug,
          clientName: client.name,
          provider: "windsor",
        },
        {
          runId: input.runId,
          clientId: client.id,
          clientSlug: client.slug,
          clientName: client.name,
          provider: "ghl",
          status: hasGhlConfiguration ? "running" : "skipped",
          completedAt: hasGhlConfiguration ? null : input.startedAt,
          errorMessage: hasGhlConfiguration
            ? null
            : "No GHL location configured",
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
  if (targetValues.length === 0) return new Map<string, string>();

  const targetRows = await db
    .insert(allClientSyncTargets)
    .values(targetValues)
    .returning({
      id: allClientSyncTargets.id,
      clientSlug: allClientSyncTargets.clientSlug,
      provider: allClientSyncTargets.provider,
    });
  return new Map(
    targetRows.map((target) => [
      `${target.provider}:${target.clientSlug}`,
      target.id,
    ]),
  );
}

async function syncWindsorTargets(input: {
  client: WindsorClient;
  runId: string;
  activeClients: readonly ActiveClient[];
  targetIds: ReadonlyMap<string, string>;
}) {
  let discoveredAccountCount = 0;
  try {
    ({ discoveredAccountCount } = await discoverWindsorSourceAccounts(
      input.client,
      { provisionMappedClients: false },
    ));
  } catch (error) {
    await db
      .update(allClientSyncTargets)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: safeError(error),
      })
      .where(
        and(
          eq(allClientSyncTargets.runId, input.runId),
          eq(allClientSyncTargets.provider, "windsor"),
          eq(allClientSyncTargets.status, "running"),
        ),
      );
    return { discoveredAccountCount };
  }

  const clientIds = input.activeClients.map(({ id }) => id);
  const countRows = clientIds.length
    ? await db
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
        .groupBy(sourceAccounts.clientId)
    : [];
  const sourceAccountCounts = new Map(
    countRows.flatMap((row) =>
      row.clientId ? [[row.clientId, row.count] as const] : [],
    ),
  );

  await mapInBatches(
    input.activeClients,
    WINDSOR_CLIENT_BATCH_SIZE,
    async (client) => {
      const targetId = input.targetIds.get(targetKey("windsor", client.slug));
      if (!targetId)
        throw new Error("Windsor synchronization target is missing");
      const sourceAccountCount = sourceAccountCounts.get(client.id) ?? 0;
      if (sourceAccountCount === 0) {
        await finishTarget(targetId, {
          status: "skipped",
          sourceAccountCount,
          errorMessage: "No active Windsor accounts",
        });
        return;
      }
      try {
        const summary = await syncWindsorData(input.client, {
          kind: "client",
          clientId: client.id,
        });
        await finishTarget(targetId, {
          status: "succeeded",
          sourceAccountCount,
          ...summary,
        });
      } catch (error) {
        const partial =
          error instanceof WindsorDataSyncError
            ? error.summary
            : { performanceRowCount: 0, leadRowCount: 0 };
        await finishTarget(targetId, {
          status: "failed",
          sourceAccountCount,
          ...partial,
          errorMessage: safeError(error),
        });
      }
    },
    () => heartbeat(input.runId),
  );
  return { discoveredAccountCount };
}

async function syncGhlTargets(input: {
  client: GhlClient;
  config: GhlConfig;
  runId: string;
  runStartedAt: Date;
  activeClientsBySlug: ReadonlyMap<string, ActiveClient>;
  targetIds: ReadonlyMap<string, string>;
}) {
  const configuredClients = input.config.mappings.flatMap((mapping) => {
    const client = input.activeClientsBySlug.get(mapping.clientSlug);
    return client ? [{ client, mapping }] : [];
  });

  await mapInBatches(
    configuredClients,
    GHL_CLIENT_BATCH_SIZE,
    async ({
      client,
      mapping,
    }: {
      client: ActiveClient;
      mapping: GhlClientMapping;
    }) => {
      const targetId = input.targetIds.get(
        targetKey("ghl", mapping.clientSlug),
      );
      if (!targetId) throw new Error("GHL synchronization target is missing");
      try {
        const summary = await syncGhlLocation({
          client: input.client,
          clientId: client.id,
          locationId: mapping.locationId,
          token: mapping.token,
          runStartedAt: input.runStartedAt,
          onPage: () => heartbeat(input.runId),
        });
        await finishTarget(targetId, {
          status: "succeeded",
          integrationMappingId: summary.mappingId,
          contactRowCount: summary.contactRowCount,
          opportunityRowCount: summary.appointmentRowCount,
          matchedOpportunityCount: summary.matchedAppointmentCount,
        });
      } catch (error) {
        await finishTarget(targetId, {
          status: "failed",
          errorMessage: safeError(error),
        });
      }
    },
    () => heartbeat(input.runId),
  );
}

async function finishRun(input: {
  runId: string;
  windsorRunId: string;
  discoveredAccountCount: number;
}) {
  const targetRows = await db
    .select()
    .from(allClientSyncTargets)
    .where(eq(allClientSyncTargets.runId, input.runId));
  const totals = targetRows.reduce(
    (sum, target) => ({
      performanceRowCount: sum.performanceRowCount + target.performanceRowCount,
      leadRowCount: sum.leadRowCount + target.leadRowCount,
      contactRowCount: sum.contactRowCount + target.contactRowCount,
      opportunityRowCount: sum.opportunityRowCount + target.opportunityRowCount,
      matchedOpportunityCount:
        sum.matchedOpportunityCount + target.matchedOpportunityCount,
    }),
    {
      performanceRowCount: 0,
      leadRowCount: 0,
      contactRowCount: 0,
      opportunityRowCount: 0,
      matchedOpportunityCount: 0,
    },
  );
  const failed = targetRows.some(
    (target) => target.status === "failed" || target.status === "running",
  );
  const windsorFailed = targetRows.some(
    (target) =>
      target.provider === "windsor" &&
      (target.status === "failed" || target.status === "running"),
  );
  const completedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(syncRuns)
      .set({
        status: windsorFailed ? "failed" : "succeeded",
        completedAt,
        discoveredAccountCount: input.discoveredAccountCount,
        performanceRowCount: totals.performanceRowCount,
        leadRowCount: totals.leadRowCount,
        errorMessage: windsorFailed
          ? "One or more Windsor targets failed"
          : null,
      })
      .where(eq(syncRuns.id, input.windsorRunId));
    await tx
      .update(allClientSyncRuns)
      .set({
        status: failed ? "failed" : "succeeded",
        completedAt,
        heartbeatAt: completedAt,
        discoveredAccountCount: input.discoveredAccountCount,
        ...totals,
        errorMessage: failed
          ? "One or more synchronization targets failed"
          : null,
      })
      .where(eq(allClientSyncRuns.id, input.runId));
  });
  const [summary] = await db
    .select()
    .from(allClientSyncRuns)
    .where(eq(allClientSyncRuns.id, input.runId))
    .limit(1);
  if (!summary) throw new Error("Completed synchronization run disappeared");
  return { ...summary, targets: targetRows };
}

export async function syncAllClients(
  requestedByUserId: string,
  dependencies: {
    windsorClient?: WindsorClient;
    ghlConfig?: GhlConfig;
    ghlClient?: GhlClient;
  } = {},
) {
  const startedAt = new Date();
  const windsorClient = dependencies.windsorClient ?? new WindsorClient();
  const ghlConfig = dependencies.ghlConfig ?? (await loadStoredGhlConfig());
  const ghlClient = dependencies.ghlClient ?? new GhlClient(ghlConfig.baseUrl);
  const run = await createRun(requestedByUserId, startedAt);
  let windsorRunId: string | null = null;

  try {
    const activeClients = await db
      .select({ id: clients.id, slug: clients.slug, name: clients.name })
      .from(clients)
      .where(eq(clients.status, "active"));
    const activeClientsBySlug = new Map(
      activeClients.map((client) => [client.slug, client]),
    );
    const targetIds = await createTargets({
      runId: run.id,
      startedAt,
      activeClients,
      ghlConfig,
    });

    const [windsorRun] = await db
      .insert(syncRuns)
      .values({ dataProvider: "windsor" })
      .returning({ id: syncRuns.id });
    if (!windsorRun) throw new Error("Could not create Windsor provider run");
    windsorRunId = windsorRun.id;
    await db
      .update(allClientSyncRuns)
      .set({ windsorSyncRunId: windsorRun.id })
      .where(eq(allClientSyncRuns.id, run.id));

    const { discoveredAccountCount } = await syncWindsorTargets({
      client: windsorClient,
      runId: run.id,
      activeClients,
      targetIds,
    });
    await syncGhlTargets({
      client: ghlClient,
      config: ghlConfig,
      runId: run.id,
      runStartedAt: startedAt,
      activeClientsBySlug,
      targetIds,
    });
    return await finishRun({
      runId: run.id,
      windsorRunId,
      discoveredAccountCount,
    });
  } catch (error) {
    await failUnexpectedRun(run.id, windsorRunId, error);
    throw error;
  }
}
