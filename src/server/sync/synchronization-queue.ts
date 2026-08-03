import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  allClientSyncRuns,
  allClientSyncTargets,
  clientSynchronizationStates,
  clients,
  sourceAccounts,
  syncRuns,
} from "~/server/db/schema";
import { loadStoredGhlConfig } from "~/server/ghl/configuration";
import type { GhlConfig } from "~/server/ghl/env";
import { getSyncRun } from "~/server/sync/sync-run";
import {
  HOURLY_SYNC_INTERVAL_MS,
  type SynchronizationMode,
} from "~/server/sync/sync-mode";
import { WindsorClient } from "~/server/windsor/client";
import { discoverWindsorSourceAccounts } from "~/server/windsor/sync";

const MANUAL_TARGET_PRIORITY = 10;
const SCHEDULED_TARGET_PRIORITY = 0;

type ActiveClient = {
  id: string;
  name: string;
  slug: string;
};

type SynchronizationScope =
  { kind: "all" } | { kind: "client"; clientId: string };

type SynchronizationTrigger = "manual" | "scheduled";

type QueueSnapshot = {
  activeProviderKeys: Set<string>;
  clients: ActiveClient[];
  sourceAccountCounts: Map<string, number>;
  states: Map<
    string,
    { lastAttemptAt: Date | null; lastSucceededAt: Date | null }
  >;
};

type TargetCandidate = {
  client: ActiveClient;
  completedAt: Date | null;
  errorMessage: string | null;
  provider: "ghl" | "windsor";
  sourceAccountCount: number;
  status: "failed" | "pending" | "skipped";
};

export type QueueSynchronizationInput = {
  minimumIntervalMs?: number;
  mode: SynchronizationMode;
  requestedByUserId: string | null;
  scope: SynchronizationScope;
  trigger: SynchronizationTrigger;
};

export type QueueDependencies = {
  ghlConfig?: GhlConfig;
  now?: () => Date;
  windsorClient?: WindsorClient;
};

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("Synchronization is already queued or running for this client");
    this.name = "SyncAlreadyRunningError";
  }
}

export class SyncCooldownError extends Error {
  constructor(readonly nextEligibleAt: Date) {
    super(
      `Synchronization is available again at ${nextEligibleAt.toISOString()}`,
    );
    this.name = "SyncCooldownError";
  }
}

export class SynchronizationClientNotFoundError extends Error {
  constructor() {
    super("The requested active client was not found");
    this.name = "SynchronizationClientNotFoundError";
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}

function providerKey(clientId: string, provider: string): string {
  return `${clientId}:${provider}`;
}

async function getRequestedClients(
  scope: SynchronizationScope,
): Promise<ActiveClient[]> {
  return db
    .select({ id: clients.id, name: clients.name, slug: clients.slug })
    .from(clients)
    .where(
      and(
        eq(clients.status, "active"),
        scope.kind === "client" ? eq(clients.id, scope.clientId) : undefined,
      ),
    )
    .orderBy(asc(clients.slug), asc(clients.id));
}

async function loadSnapshot(
  requestedClients: readonly ActiveClient[],
): Promise<QueueSnapshot> {
  const clientIds = requestedClients.map(({ id }) => id);
  if (clientIds.length === 0) {
    return {
      activeProviderKeys: new Set(),
      clients: [],
      sourceAccountCounts: new Map(),
      states: new Map(),
    };
  }
  const [activeTargets, stateRows, accountCountRows] = await Promise.all([
    db
      .select({
        clientId: allClientSyncTargets.clientId,
        provider: allClientSyncTargets.provider,
      })
      .from(allClientSyncTargets)
      .where(
        and(
          inArray(allClientSyncTargets.clientId, clientIds),
          inArray(allClientSyncTargets.status, ["pending", "running"]),
        ),
      ),
    db
      .select({
        clientId: clientSynchronizationStates.clientId,
        provider: clientSynchronizationStates.provider,
        lastAttemptAt: clientSynchronizationStates.lastAttemptAt,
        lastSucceededAt: clientSynchronizationStates.lastSucceededAt,
      })
      .from(clientSynchronizationStates)
      .where(inArray(clientSynchronizationStates.clientId, clientIds)),
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
  return {
    activeProviderKeys: new Set(
      activeTargets.flatMap(({ clientId, provider }) =>
        clientId ? [providerKey(clientId, provider)] : [],
      ),
    ),
    clients: [...requestedClients],
    sourceAccountCounts: new Map(
      accountCountRows.flatMap(({ clientId, count }) =>
        clientId ? [[clientId, count] as const] : [],
      ),
    ),
    states: new Map(
      stateRows.map((state) => [
        providerKey(state.clientId, state.provider),
        {
          lastAttemptAt: state.lastAttemptAt,
          lastSucceededAt: state.lastSucceededAt,
        },
      ]),
    ),
  };
}

function isDue(
  state:
    { lastAttemptAt: Date | null; lastSucceededAt: Date | null } | undefined,
  now: Date,
): boolean {
  const freshnessAnchor =
    state?.lastAttemptAt &&
    (!state.lastSucceededAt || state.lastAttemptAt > state.lastSucceededAt)
      ? state.lastAttemptAt
      : state?.lastSucceededAt;
  return (
    !freshnessAnchor ||
    freshnessAnchor.getTime() <= now.getTime() - HOURLY_SYNC_INTERVAL_MS
  );
}

function assertManualRequestAllowed(input: {
  ghlConfiguredSlugs: ReadonlySet<string>;
  minimumIntervalMs: number | undefined;
  now: Date;
  snapshot: QueueSnapshot;
}) {
  const allProviderKeys = input.snapshot.clients.flatMap((client) => [
    providerKey(client.id, "ghl"),
    providerKey(client.id, "windsor"),
  ]);
  const configuredKeys = input.snapshot.clients.flatMap((client) => {
    const keys: string[] = [];
    if (input.ghlConfiguredSlugs.has(client.slug)) {
      keys.push(providerKey(client.id, "ghl"));
    }
    if ((input.snapshot.sourceAccountCounts.get(client.id) ?? 0) > 0) {
      keys.push(providerKey(client.id, "windsor"));
    }
    return keys;
  });
  if (
    configuredKeys.some((key) => input.snapshot.activeProviderKeys.has(key))
  ) {
    throw new SyncAlreadyRunningError();
  }
  if (!input.minimumIntervalMs) return;
  const latestAttemptAt = allProviderKeys.reduce<Date | null>((latest, key) => {
    const attemptedAt = input.snapshot.states.get(key)?.lastAttemptAt;
    return !attemptedAt || (latest && attemptedAt <= latest)
      ? latest
      : attemptedAt;
  }, null);
  if (!latestAttemptAt) return;
  const nextEligibleAt = new Date(
    latestAttemptAt.getTime() + input.minimumIntervalMs,
  );
  if (nextEligibleAt > input.now) throw new SyncCooldownError(nextEligibleAt);
}

function buildTargetCandidates(input: {
  discoveryError: string | null;
  ghlConfiguredSlugs: ReadonlySet<string>;
  now: Date;
  snapshot: QueueSnapshot;
  trigger: SynchronizationTrigger;
}): TargetCandidate[] {
  return input.snapshot.clients.flatMap((client) => {
    const candidates: TargetCandidate[] = [];
    const providers = ["windsor", "ghl"] as const;
    for (const provider of providers) {
      const key = providerKey(client.id, provider);
      const isConfigured =
        provider === "ghl"
          ? input.ghlConfiguredSlugs.has(client.slug)
          : (input.snapshot.sourceAccountCounts.get(client.id) ?? 0) > 0;
      if (input.trigger === "scheduled") {
        if (
          !isConfigured ||
          input.snapshot.activeProviderKeys.has(key) ||
          !isDue(input.snapshot.states.get(key), input.now)
        ) {
          continue;
        }
      }
      if (!isConfigured) {
        candidates.push({
          client,
          completedAt: input.now,
          errorMessage:
            provider === "ghl"
              ? "No GHL location configured"
              : "No active Windsor accounts",
          provider,
          sourceAccountCount:
            provider === "windsor"
              ? (input.snapshot.sourceAccountCounts.get(client.id) ?? 0)
              : 0,
          status: "skipped",
        });
        continue;
      }
      if (provider === "windsor" && input.discoveryError) {
        candidates.push({
          client,
          completedAt: input.now,
          errorMessage: input.discoveryError,
          provider,
          sourceAccountCount:
            input.snapshot.sourceAccountCounts.get(client.id) ?? 0,
          status: "failed",
        });
        continue;
      }
      candidates.push({
        client,
        completedAt: null,
        errorMessage: null,
        provider,
        sourceAccountCount:
          provider === "windsor"
            ? (input.snapshot.sourceAccountCounts.get(client.id) ?? 0)
            : 0,
        status: "pending",
      });
    }
    return candidates;
  });
}

async function discoverWindsorAccounts(
  client: WindsorClient,
): Promise<{ count: number; errorMessage: string | null }> {
  try {
    const result = await discoverWindsorSourceAccounts(client, {
      provisionMappedClients: false,
    });
    return { count: result.discoveredAccountCount, errorMessage: null };
  } catch (error) {
    return {
      count: 0,
      errorMessage: `Windsor account discovery failed: ${safeError(error)}`,
    };
  }
}

export async function queueSynchronization(
  input: QueueSynchronizationInput,
  dependencies: QueueDependencies = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();
  const ghlConfig = dependencies.ghlConfig ?? (await loadStoredGhlConfig());
  const requestedClients = await getRequestedClients(input.scope);
  if (input.scope.kind === "client" && requestedClients.length === 0) {
    throw new SynchronizationClientNotFoundError();
  }
  const preliminarySnapshot = await loadSnapshot(requestedClients);
  const ghlConfiguredSlugs = new Set(
    ghlConfig.mappings.map(({ clientSlug }) => clientSlug),
  );
  if (input.trigger === "manual") {
    assertManualRequestAllowed({
      ghlConfiguredSlugs,
      minimumIntervalMs: input.minimumIntervalMs,
      now: startedAt,
      snapshot: preliminarySnapshot,
    });
  }
  const preliminaryCandidates = buildTargetCandidates({
    discoveryError: null,
    ghlConfiguredSlugs,
    now: startedAt,
    snapshot: preliminarySnapshot,
    trigger: input.trigger,
  });
  if (input.trigger === "scheduled" && preliminaryCandidates.length === 0) {
    return null;
  }
  const shouldDiscover =
    input.scope.kind === "all" &&
    (input.trigger === "manual" || preliminaryCandidates.length > 0);
  const discovery = shouldDiscover
    ? await discoverWindsorAccounts(
        dependencies.windsorClient ?? new WindsorClient(),
      )
    : { count: 0, errorMessage: null };

  return db
    .transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('agency-os-sync-enqueue'))`,
      );
      const currentClients = await tx
        .select({ id: clients.id, name: clients.name, slug: clients.slug })
        .from(clients)
        .where(
          and(
            eq(clients.status, "active"),
            input.scope.kind === "client"
              ? eq(clients.id, input.scope.clientId)
              : undefined,
          ),
        )
        .orderBy(asc(clients.slug), asc(clients.id));
      if (input.scope.kind === "client" && currentClients.length === 0) {
        throw new SynchronizationClientNotFoundError();
      }
      const clientIds = currentClients.map(({ id }) => id);
      const [activeTargets, stateRows, accountCountRows] =
        clientIds.length === 0
          ? [[], [], []]
          : await Promise.all([
              tx
                .select({
                  clientId: allClientSyncTargets.clientId,
                  provider: allClientSyncTargets.provider,
                })
                .from(allClientSyncTargets)
                .where(
                  and(
                    inArray(allClientSyncTargets.clientId, clientIds),
                    inArray(allClientSyncTargets.status, [
                      "pending",
                      "running",
                    ]),
                  ),
                ),
              tx
                .select({
                  clientId: clientSynchronizationStates.clientId,
                  provider: clientSynchronizationStates.provider,
                  lastAttemptAt: clientSynchronizationStates.lastAttemptAt,
                  lastSucceededAt: clientSynchronizationStates.lastSucceededAt,
                })
                .from(clientSynchronizationStates)
                .where(
                  inArray(clientSynchronizationStates.clientId, clientIds),
                ),
              tx
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
      const snapshot: QueueSnapshot = {
        activeProviderKeys: new Set(
          activeTargets.flatMap(({ clientId, provider }) =>
            clientId ? [providerKey(clientId, provider)] : [],
          ),
        ),
        clients: currentClients,
        sourceAccountCounts: new Map(
          accountCountRows.flatMap(({ clientId, count }) =>
            clientId ? [[clientId, count] as const] : [],
          ),
        ),
        states: new Map(
          stateRows.map((state) => [
            providerKey(state.clientId, state.provider),
            {
              lastAttemptAt: state.lastAttemptAt,
              lastSucceededAt: state.lastSucceededAt,
            },
          ]),
        ),
      };
      if (input.trigger === "manual") {
        assertManualRequestAllowed({
          ghlConfiguredSlugs,
          minimumIntervalMs: input.minimumIntervalMs,
          now: startedAt,
          snapshot,
        });
      }
      const candidates = buildTargetCandidates({
        discoveryError: discovery.errorMessage,
        ghlConfiguredSlugs,
        now: startedAt,
        snapshot,
        trigger: input.trigger,
      });
      if (candidates.length === 0) return null;

      const hasPendingTargets = candidates.some(
        ({ status }) => status === "pending",
      );
      const hasFailedTargets = candidates.some(
        ({ status }) => status === "failed",
      );
      const hasWindsorTargets = candidates.some(
        ({ provider }) => provider === "windsor",
      );
      const [run] = await tx
        .insert(allClientSyncRuns)
        .values({
          requestedByUserId: input.requestedByUserId,
          requestedClientId:
            input.scope.kind === "client" ? input.scope.clientId : null,
          mode: input.mode,
          scope: input.scope.kind,
          trigger: input.trigger,
          status: hasPendingTargets
            ? "running"
            : hasFailedTargets
              ? "failed"
              : "succeeded",
          startedAt,
          heartbeatAt: startedAt,
          completedAt: hasPendingTargets ? null : startedAt,
          discoveredAccountCount: discovery.count,
          errorMessage: hasFailedTargets
            ? "One or more synchronization targets failed during setup"
            : null,
        })
        .returning({ id: allClientSyncRuns.id });
      if (!run) throw new Error("Could not create synchronization run");

      let windsorRunId: string | null = null;
      if (hasWindsorTargets) {
        const hasPendingWindsor = candidates.some(
          ({ provider, status }) =>
            provider === "windsor" && status === "pending",
        );
        const hasFailedWindsor = candidates.some(
          ({ provider, status }) =>
            provider === "windsor" && status === "failed",
        );
        const [windsorRun] = await tx
          .insert(syncRuns)
          .values({
            dataProvider: "windsor",
            status: hasPendingWindsor
              ? "running"
              : hasFailedWindsor
                ? "failed"
                : "succeeded",
            startedAt,
            completedAt: hasPendingWindsor ? null : startedAt,
            discoveredAccountCount: discovery.count,
            errorMessage: hasFailedWindsor
              ? "Windsor account discovery failed"
              : null,
          })
          .returning({ id: syncRuns.id });
        if (!windsorRun)
          throw new Error("Could not create Windsor provider run");
        windsorRunId = windsorRun.id;
        await tx
          .update(allClientSyncRuns)
          .set({ windsorSyncRunId: windsorRunId })
          .where(eq(allClientSyncRuns.id, run.id));
      }

      await tx.insert(allClientSyncTargets).values(
        candidates.map((candidate) => ({
          runId: run.id,
          clientId: candidate.client.id,
          clientSlug: candidate.client.slug,
          clientName: candidate.client.name,
          provider: candidate.provider,
          priority:
            input.trigger === "manual"
              ? MANUAL_TARGET_PRIORITY
              : SCHEDULED_TARGET_PRIORITY,
          status: candidate.status,
          startedAt,
          heartbeatAt: startedAt,
          availableAt: startedAt,
          completedAt: candidate.completedAt,
          sourceAccountCount: candidate.sourceAccountCount,
          errorMessage: candidate.errorMessage,
        })),
      );

      const completedCandidates = candidates.filter(
        ({ status }) => status !== "pending",
      );
      for (const candidate of completedCandidates) {
        await tx
          .insert(clientSynchronizationStates)
          .values({
            clientId: candidate.client.id,
            provider: candidate.provider,
            lastAttemptAt: startedAt,
            lastFailedAt: candidate.status === "failed" ? startedAt : undefined,
            lastErrorMessage:
              candidate.status === "failed"
                ? candidate.errorMessage
                : undefined,
            updatedAt: startedAt,
          })
          .onConflictDoUpdate({
            target: [
              clientSynchronizationStates.clientId,
              clientSynchronizationStates.provider,
            ],
            set: {
              lastAttemptAt: startedAt,
              ...(candidate.status === "failed"
                ? {
                    lastFailedAt: startedAt,
                    lastErrorMessage: candidate.errorMessage,
                  }
                : {}),
              updatedAt: startedAt,
            },
          });
      }
      return { runId: run.id, windsorRunId };
    })
    .then(async (queued) => (queued ? getSyncRun(queued.runId) : null));
}

export function queueHourlyFreshSynchronization(
  dependencies: QueueDependencies = {},
) {
  return queueSynchronization(
    {
      mode: "fresh",
      requestedByUserId: null,
      scope: { kind: "all" },
      trigger: "scheduled",
    },
    dependencies,
  );
}
