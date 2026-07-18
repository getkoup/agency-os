import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { clients, sourceAccounts, syncRuns } from "~/server/db/schema";
import { WindsorClient } from "~/server/windsor/client";
import {
  CLIENT_MAPPINGS,
  findClientMapping,
} from "~/server/windsor/client-mappings";
import {
  chunkValues,
  normalizeSuggestionKey,
  parseConnectorAccountId,
} from "~/server/windsor/normalize";
import {
  upsertLeadBatch,
  upsertPerformanceBatch,
} from "~/server/windsor/persistence";

const DISCOVERY_WRITE_CHUNK_SIZE = 500;

export interface SyncSummary {
  runId: string;
  status: "succeeded" | "failed";
  discoveredAccountCount: number;
  performanceRowCount: number;
  leadRowCount: number;
  durationMs: number;
}

export class WindsorSyncError extends Error {
  readonly summary: SyncSummary;

  constructor(summary: SyncSummary, options?: ErrorOptions) {
    super("Windsor synchronization failed", options);
    this.name = "WindsorSyncError";
    this.summary = summary;
  }
}

export interface WindsorDiscoverySummary {
  discoveredAccountCount: number;
}

export interface WindsorDataSummary {
  performanceRowCount: number;
  leadRowCount: number;
}

export class WindsorDataSyncError extends Error {
  constructor(
    readonly summary: WindsorDataSummary,
    options?: ErrorOptions,
  ) {
    super("Scoped Windsor synchronization failed", options);
    this.name = "WindsorDataSyncError";
  }
}

export async function discoverWindsorSourceAccounts(
  client: WindsorClient,
  options: { provisionMappedClients: boolean },
): Promise<WindsorDiscoverySummary> {
  const discovered = (await client.discoverAccounts()).filter(
    (account) =>
      account.datasource === "facebook" ||
      account.datasource === "facebook_leads",
  );
  const uniqueDiscovered = new Map<string, (typeof discovered)[number]>();
  for (const account of discovered) {
    const parsed = parseConnectorAccountId(account.account_id);
    if (parsed.connector !== account.datasource) {
      throw new Error("Discovery datasource did not match account selector");
    }
    uniqueDiscovered.set(account.account_id, account);
  }

  await db.transaction(async (tx) => {
    if (options.provisionMappedClients) {
      await tx
        .insert(clients)
        .values(
          CLIENT_MAPPINGS.map((mapping) => ({
            slug: mapping.slug,
            name: mapping.name,
          })),
        )
        .onConflictDoNothing({ target: clients.slug });
    }
    const mappedClients = await tx
      .select({ id: clients.id, slug: clients.slug, status: clients.status })
      .from(clients)
      .where(
        inArray(
          clients.slug,
          CLIENT_MAPPINGS.map((mapping) => mapping.slug),
        ),
      );
    const activeClientIds = new Map(
      mappedClients
        .filter((client) => client.status === "active")
        .map((client) => [client.slug, client.id]),
    );
    const now = new Date();
    const sourceValues: Array<typeof sourceAccounts.$inferInsert> = [];
    for (const account of uniqueDiscovered.values()) {
      const parsed = parseConnectorAccountId(account.account_id);
      const mapping = findClientMapping(account.account_id);
      const displayName =
        account.account_name
          .replace(new RegExp(`^${account.datasource}__`), "")
          .trim() || parsed.externalAccountId;
      sourceValues.push({
        clientId: mapping ? (activeClientIds.get(mapping.slug) ?? null) : null,
        dataProvider: "windsor",
        platform: "facebook",
        connector: parsed.connector,
        connectorAccountId: account.account_id,
        externalAccountId: parsed.externalAccountId,
        externalAccountName: displayName,
        normalizedName: normalizeSuggestionKey(displayName),
        lastSeenAt: now,
      });
    }
    for (const values of chunkValues(
      sourceValues,
      DISCOVERY_WRITE_CHUNK_SIZE,
    )) {
      await tx
        .insert(sourceAccounts)
        .values(values)
        .onConflictDoUpdate({
          target: [
            sourceAccounts.dataProvider,
            sourceAccounts.connectorAccountId,
          ],
          set: {
            externalAccountId: sql`excluded."externalAccountId"`,
            externalAccountName: sql`excluded."externalAccountName"`,
            normalizedName: sql`excluded."normalizedName"`,
            status: sql`case when ${sourceAccounts.status} = 'ignored' then ${sourceAccounts.status} else excluded."status" end`,
            lastSeenAt: now,
          },
        });
    }
    const seenConnectorAccounts = [...uniqueDiscovered.keys()];
    if (seenConnectorAccounts.length > 0) {
      await tx
        .update(sourceAccounts)
        .set({ status: "disconnected" })
        .where(
          and(
            eq(sourceAccounts.dataProvider, "windsor"),
            inArray(sourceAccounts.connector, ["facebook", "facebook_leads"]),
            sql`${sourceAccounts.status} <> 'ignored'`,
            notInArray(
              sourceAccounts.connectorAccountId,
              seenConnectorAccounts,
            ),
          ),
        );
    }
  });

  return { discoveredAccountCount: discovered.length };
}

export async function syncWindsorData(
  client: WindsorClient,
  scope: { kind: "all-active" } | { kind: "client"; clientId: string },
): Promise<WindsorDataSummary> {
  let performanceRowCount = 0;
  let leadRowCount = 0;
  try {
    const activeAccounts = await db
      .select({
        connector: sourceAccounts.connector,
        connectorAccountId: sourceAccounts.connectorAccountId,
      })
      .from(sourceAccounts)
      .where(
        and(
          eq(sourceAccounts.dataProvider, "windsor"),
          eq(sourceAccounts.status, "active"),
          scope.kind === "client"
            ? eq(sourceAccounts.clientId, scope.clientId)
            : undefined,
        ),
      );
    const performanceAccounts = activeAccounts
      .filter((account) => account.connector === "facebook")
      .map((account) => account.connectorAccountId);
    const leadAccounts = activeAccounts
      .filter((account) => account.connector === "facebook_leads")
      .map((account) => account.connectorAccountId);
    for (const batch of chunkValues(performanceAccounts, 20)) {
      const rows = await client.fetchPerformance(batch);
      await upsertPerformanceBatch(rows, batch);
      performanceRowCount += rows.length;
    }
    for (const batch of chunkValues(leadAccounts, 20)) {
      const rows = await client.fetchLeads(batch);
      await upsertLeadBatch(rows, batch);
      leadRowCount += rows.length;
    }
    return { performanceRowCount, leadRowCount };
  } catch (error) {
    throw new WindsorDataSyncError(
      { performanceRowCount, leadRowCount },
      { cause: error },
    );
  }
}

export async function syncWindsor(
  client: WindsorClient = new WindsorClient(),
): Promise<SyncSummary> {
  const startedAt = new Date();
  const [run] = await db
    .insert(syncRuns)
    .values({ dataProvider: "windsor" })
    .returning({ id: syncRuns.id });
  if (!run) throw new Error("Could not create Windsor sync run");
  let discoveredAccountCount = 0;
  let performanceRowCount = 0;
  let leadRowCount = 0;
  try {
    ({ discoveredAccountCount } = await discoverWindsorSourceAccounts(client, {
      provisionMappedClients: true,
    }));
    ({ performanceRowCount, leadRowCount } = await syncWindsorData(client, {
      kind: "all-active",
    }));
    const completedAt = new Date();
    await db
      .update(syncRuns)
      .set({
        status: "succeeded",
        completedAt,
        discoveredAccountCount,
        performanceRowCount,
        leadRowCount,
      })
      .where(eq(syncRuns.id, run.id));
    return {
      runId: run.id,
      status: "succeeded",
      discoveredAccountCount,
      performanceRowCount,
      leadRowCount,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  } catch (error) {
    if (error instanceof WindsorDataSyncError) {
      ({ performanceRowCount, leadRowCount } = error.summary);
    }
    const completedAt = new Date();
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt,
        discoveredAccountCount,
        performanceRowCount,
        leadRowCount,
        errorMessage:
          error instanceof Error ? error.message : "Unknown sync error",
      })
      .where(eq(syncRuns.id, run.id));
    throw new WindsorSyncError(
      {
        runId: run.id,
        status: "failed",
        discoveredAccountCount,
        performanceRowCount,
        leadRowCount,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
      { cause: error },
    );
  }
}
