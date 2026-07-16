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
import { parseGhlConfig, type GhlConfig } from "~/server/ghl/env";
import { syncGhlLocation } from "~/server/ghl/sync";
import { WindsorClient } from "~/server/windsor/client";
import {
  discoverWindsorSourceAccounts,
  syncWindsorData,
  WindsorDataSyncError,
} from "~/server/windsor/sync";

const STALE_RUN_MS = 15 * 60 * 1000;

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("An all-client synchronization is already running");
    this.name = "SyncAlreadyRunningError";
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
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
              new Date(startedAt.getTime() - STALE_RUN_MS),
            ),
          ),
        )
        .returning({ id: allClientSyncRuns.id });
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
  const ghlConfig = dependencies.ghlConfig ?? parseGhlConfig();
  const ghlClient = dependencies.ghlClient ?? new GhlClient(ghlConfig.baseUrl);
  const run = await createRun(requestedByUserId, startedAt);
  const activeClients = await db
    .select({ id: clients.id, slug: clients.slug, name: clients.name })
    .from(clients)
    .where(eq(clients.status, "active"));
  const activeBySlug = new Map(
    activeClients.map((client) => [client.slug, client]),
  );
  const targets = new Map<string, { id: string; clientId: string | null }>();

  for (const client of activeClients) {
    const [windsorTarget] = await db
      .insert(allClientSyncTargets)
      .values({
        runId: run.id,
        clientId: client.id,
        clientSlug: client.slug,
        clientName: client.name,
        provider: "windsor",
      })
      .returning({ id: allClientSyncTargets.id });
    if (!windsorTarget) throw new Error("Could not create Windsor target");
    targets.set(`windsor:${client.slug}`, {
      id: windsorTarget.id,
      clientId: client.id,
    });
    const configured = ghlConfig.mappings.some(
      (mapping) => mapping.clientSlug === client.slug,
    );
    const [ghlTarget] = await db
      .insert(allClientSyncTargets)
      .values({
        runId: run.id,
        clientId: client.id,
        clientSlug: client.slug,
        clientName: client.name,
        provider: "ghl",
        status: configured ? "running" : "skipped",
        completedAt: configured ? null : startedAt,
        errorMessage: configured ? null : "No GHL location configured",
      })
      .returning({ id: allClientSyncTargets.id });
    if (!ghlTarget) throw new Error("Could not create GHL target");
    targets.set(`ghl:${client.slug}`, {
      id: ghlTarget.id,
      clientId: client.id,
    });
  }
  for (const mapping of ghlConfig.mappings) {
    if (activeBySlug.has(mapping.clientSlug)) continue;
    const [target] = await db
      .insert(allClientSyncTargets)
      .values({
        runId: run.id,
        clientSlug: mapping.clientSlug,
        clientName: mapping.clientName,
        provider: "ghl",
        status: "failed",
        completedAt: startedAt,
        errorMessage: "Expected active client is missing",
      })
      .returning({ id: allClientSyncTargets.id });
    if (!target) throw new Error("Could not create missing-client target");
    targets.set(`ghl:${mapping.clientSlug}`, { id: target.id, clientId: null });
  }

  const [windsorRun] = await db
    .insert(syncRuns)
    .values({ dataProvider: "windsor" })
    .returning({ id: syncRuns.id });
  if (!windsorRun) throw new Error("Could not create Windsor provider run");
  await db
    .update(allClientSyncRuns)
    .set({ windsorSyncRunId: windsorRun.id })
    .where(eq(allClientSyncRuns.id, run.id));
  let discoveredAccountCount = 0;
  let windsorFailed = false;
  try {
    ({ discoveredAccountCount } = await discoverWindsorSourceAccounts(
      windsorClient,
      { provisionMappedClients: false },
    ));
  } catch (error) {
    windsorFailed = true;
    for (const client of activeClients) {
      const target = targets.get(`windsor:${client.slug}`);
      if (target) {
        await finishTarget(target.id, {
          status: "failed",
          errorMessage: safeError(error),
        });
      }
    }
  }

  if (!windsorFailed) {
    for (const client of activeClients) {
      const target = targets.get(`windsor:${client.slug}`);
      if (!target) continue;
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sourceAccounts)
        .where(
          and(
            eq(sourceAccounts.dataProvider, "windsor"),
            eq(sourceAccounts.status, "active"),
            eq(sourceAccounts.clientId, client.id),
          ),
        );
      const sourceAccountCount = countRows[0]?.count ?? 0;
      if (sourceAccountCount === 0) {
        await finishTarget(target.id, {
          status: "skipped",
          sourceAccountCount,
          errorMessage: "No active Windsor accounts",
        });
        continue;
      }
      try {
        const summary = await syncWindsorData(windsorClient, {
          kind: "client",
          clientId: client.id,
        });
        await finishTarget(target.id, {
          status: "succeeded",
          sourceAccountCount,
          ...summary,
        });
      } catch (error) {
        const partial =
          error instanceof WindsorDataSyncError
            ? error.summary
            : { performanceRowCount: 0, leadRowCount: 0 };
        await finishTarget(target.id, {
          status: "failed",
          sourceAccountCount,
          ...partial,
          errorMessage: safeError(error),
        });
      }
      await heartbeat(run.id);
    }
  }

  for (const mapping of ghlConfig.mappings) {
    const client = activeBySlug.get(mapping.clientSlug);
    const target = targets.get(`ghl:${mapping.clientSlug}`);
    if (!client || !target) continue;
    try {
      const summary = await syncGhlLocation({
        client: ghlClient,
        clientId: client.id,
        locationId: mapping.locationId,
        token: mapping.token,
        runStartedAt: startedAt,
        onPage: () => heartbeat(run.id),
      });
      await finishTarget(target.id, {
        status: "succeeded",
        integrationMappingId: summary.mappingId,
        contactRowCount: summary.contactRowCount,
        opportunityRowCount: summary.opportunityRowCount,
        matchedOpportunityCount: summary.matchedOpportunityCount,
      });
    } catch (error) {
      await finishTarget(target.id, {
        status: "failed",
        errorMessage: safeError(error),
      });
    }
    await heartbeat(run.id);
  }

  const targetRows = await db
    .select()
    .from(allClientSyncTargets)
    .where(eq(allClientSyncTargets.runId, run.id));
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
  const failed = targetRows.some((target) => target.status === "failed");
  const completedAt = new Date();
  await db
    .update(syncRuns)
    .set({
      status: targetRows.some(
        (target) => target.provider === "windsor" && target.status === "failed",
      )
        ? "failed"
        : "succeeded",
      completedAt,
      discoveredAccountCount,
      performanceRowCount: totals.performanceRowCount,
      leadRowCount: totals.leadRowCount,
      errorMessage: windsorFailed ? "One or more Windsor targets failed" : null,
    })
    .where(eq(syncRuns.id, windsorRun.id));
  await db
    .update(allClientSyncRuns)
    .set({
      status: failed ? "failed" : "succeeded",
      completedAt,
      heartbeatAt: completedAt,
      discoveredAccountCount,
      ...totals,
      errorMessage: failed
        ? "One or more synchronization targets failed"
        : null,
    })
    .where(eq(allClientSyncRuns.id, run.id));
  const [summary] = await db
    .select()
    .from(allClientSyncRuns)
    .where(eq(allClientSyncRuns.id, run.id))
    .limit(1);
  if (!summary) throw new Error("Completed synchronization run disappeared");
  return { ...summary, targets: targetRows };
}
