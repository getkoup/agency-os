import "server-only";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { db } from "~/server/db";
import {
  clientMemberships,
  clients,
  sourceAccounts,
  users,
} from "~/server/db/schema";

export interface PageInput {
  page: number;
  pageSize: number;
}

export async function listManagedUsers(
  input: PageInput & {
    query?: string;
    role?: "owner" | "admin" | "client";
    status?: "active" | "inactive";
    clientId?: string;
  },
) {
  const where = and(
    input.query
      ? or(
          ilike(users.name, `%${input.query}%`),
          ilike(users.email, `%${input.query}%`),
        )
      : undefined,
    input.role ? eq(users.role, input.role) : undefined,
    input.status ? eq(users.status, input.status) : undefined,
    input.clientId
      ? sql`exists (select 1 from ${clientMemberships} membership_filter where membership_filter."userId" = ${users.id} and membership_filter."clientId" = ${input.clientId})`
      : undefined,
  );
  const [totalRow] = await db
    .select({ count: count() })
    .from(users)
    .where(where);
  const pageRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(where)
    .orderBy(sql`${users.name} asc nulls last`, asc(users.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const ids = pageRows.map(({ id }) => id);
  const memberships = ids.length
    ? await db
        .select({
          userId: clientMemberships.userId,
          id: clients.id,
          name: clients.name,
        })
        .from(clientMemberships)
        .innerJoin(clients, eq(clientMemberships.clientId, clients.id))
        .where(inArray(clientMemberships.userId, ids))
        .orderBy(asc(clients.name), asc(clients.id))
    : [];
  return {
    total: totalRow?.count ?? 0,
    rows: pageRows.map((user) => ({
      ...user,
      clients: memberships
        .filter(({ userId }) => userId === user.id)
        .map(({ id, name }) => ({ id, name })),
    })),
  };
}

export async function listManagedClients(
  input: PageInput & {
    query?: string;
    status?: "active" | "inactive";
  },
) {
  const where = and(
    input.query ? ilike(clients.name, `%${input.query}%`) : undefined,
    input.status ? eq(clients.status, input.status) : undefined,
  );
  const [totalRow] = await db
    .select({ count: count() })
    .from(clients)
    .where(where);
  const accountCounts = db
    .select({
      clientId: sourceAccounts.clientId,
      count: count().as("account_count"),
    })
    .from(sourceAccounts)
    .where(isNotNull(sourceAccounts.clientId))
    .groupBy(sourceAccounts.clientId)
    .as("account_counts");
  const userCounts = db
    .select({
      clientId: clientMemberships.clientId,
      count: count().as("user_count"),
    })
    .from(clientMemberships)
    .innerJoin(users, eq(clientMemberships.userId, users.id))
    .where(and(eq(users.role, "client"), eq(users.status, "active")))
    .groupBy(clientMemberships.clientId)
    .as("user_counts");
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      slug: clients.slug,
      status: clients.status,
      sourceAccountCount: sql<number>`coalesce(${accountCounts.count}, 0)::int`,
      activeClientUserCount: sql<number>`coalesce(${userCounts.count}, 0)::int`,
    })
    .from(clients)
    .leftJoin(accountCounts, eq(clients.id, accountCounts.clientId))
    .leftJoin(userCounts, eq(clients.id, userCounts.clientId))
    .where(where)
    .orderBy(asc(clients.name), asc(clients.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return { rows, total: totalRow?.count ?? 0 };
}

export async function listClientOptions(
  query: string | undefined,
  limit: number,
) {
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.status, "active"),
        query ? ilike(clients.name, `%${query}%`) : undefined,
      ),
    )
    .orderBy(asc(clients.name), asc(clients.id))
    .limit(limit);
}

export async function listAccountAssignments(
  input: PageInput & {
    query?: string;
    clientId?: string;
    platform?: string;
    status?: "active" | "disconnected" | "ignored";
    assignment?: "assigned" | "unassigned";
  },
) {
  const where = and(
    input.query
      ? or(
          ilike(sourceAccounts.externalAccountName, `%${input.query}%`),
          ilike(sourceAccounts.externalAccountId, `%${input.query}%`),
        )
      : undefined,
    input.clientId === "unassigned"
      ? isNull(sourceAccounts.clientId)
      : input.clientId
        ? eq(sourceAccounts.clientId, input.clientId)
        : undefined,
    input.platform ? eq(sourceAccounts.platform, input.platform) : undefined,
    input.status ? eq(sourceAccounts.status, input.status) : undefined,
    input.assignment === "assigned"
      ? isNotNull(sourceAccounts.clientId)
      : input.assignment === "unassigned"
        ? isNull(sourceAccounts.clientId)
        : undefined,
  );
  const [totalRow] = await db
    .select({ count: count() })
    .from(sourceAccounts)
    .where(where);
  const userCounts = db
    .select({
      clientId: clientMemberships.clientId,
      count: count().as("user_count"),
    })
    .from(clientMemberships)
    .innerJoin(users, eq(clientMemberships.userId, users.id))
    .where(and(eq(users.role, "client"), eq(users.status, "active")))
    .groupBy(clientMemberships.clientId)
    .as("assignment_user_counts");
  const rows = await db
    .select({
      id: sourceAccounts.id,
      name: sourceAccounts.externalAccountName,
      platform: sourceAccounts.platform,
      connector: sourceAccounts.connector,
      status: sourceAccounts.status,
      clientId: clients.id,
      clientName: clients.name,
      clientUserCount: sql<number>`coalesce(${userCounts.count}, 0)::int`,
      lastSyncedAt: sourceAccounts.lastSyncedAt,
    })
    .from(sourceAccounts)
    .leftJoin(clients, eq(sourceAccounts.clientId, clients.id))
    .leftJoin(userCounts, eq(sourceAccounts.clientId, userCounts.clientId))
    .where(where)
    .orderBy(asc(sourceAccounts.normalizedName), asc(sourceAccounts.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return {
    total: totalRow?.count ?? 0,
    rows: rows.map(({ clientId, clientName, ...row }) => ({
      ...row,
      client:
        clientId && clientName ? { id: clientId, name: clientName } : null,
    })),
  };
}
