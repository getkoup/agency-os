import "server-only";

import { TRPCError } from "@trpc/server";
import { hash } from "bcryptjs";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { type UserRole } from "~/lib/roles";
import { db } from "~/server/db";
import {
  clientMemberships,
  clients,
  sourceAccounts,
  users,
} from "~/server/db/schema";

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );
}

async function requireActiveClients(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  clientIds: string[],
) {
  if (!clientIds.length) return;
  const rows = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(inArray(clients.id, clientIds), eq(clients.status, "active")))
    .orderBy(asc(clients.id));
  if (rows.length !== clientIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Every client must be active",
    });
  }
}

function validateMemberships(role: UserRole, clientIds: string[]) {
  if (role === "client" && clientIds.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Client users need at least one client",
    });
  }
  if (role !== "client" && clientIds.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Owner, admin, and manager users cannot have client memberships",
    });
  }
}

export async function createManagedUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  clientIds: string[];
}) {
  validateMemberships(input.role, input.clientIds);
  const passwordHash = await hash(input.password, 12);
  try {
    return await db.transaction(async (tx) => {
      await requireActiveClients(tx, input.clientIds);
      const [user] = await tx
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          status: "active",
        })
        .returning({ id: users.id });
      if (!user) throw new Error("User insert returned no row");
      if (input.clientIds.length) {
        await tx
          .insert(clientMemberships)
          .values(
            input.clientIds.map((clientId) => ({ userId: user.id, clientId })),
          );
      }
      return { id: user.id };
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new TRPCError({ code: "CONFLICT", cause: error });
    throw error;
  }
}

export async function updateManagedUser(input: {
  userId: string;
  name: string;
  role: UserRole;
  status: "active" | "inactive";
  clientIds: string[];
}) {
  validateMemberships(input.role, input.clientIds);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select "id" from ${users} where "role" = 'owner' order by "id" for update`,
    );
    const [target] = await tx
      .select({ role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });
    if (
      target.role === "owner" &&
      target.status === "active" &&
      (input.role !== "owner" || input.status !== "active")
    ) {
      const [owners] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "owner"), eq(users.status, "active")));
      if ((owners?.count ?? 0) <= 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "At least one active owner is required",
        });
      }
    }
    await requireActiveClients(tx, input.clientIds);
    await tx
      .update(users)
      .set({ name: input.name, role: input.role, status: input.status })
      .where(eq(users.id, input.userId));
    await tx
      .delete(clientMemberships)
      .where(eq(clientMemberships.userId, input.userId));
    if (input.clientIds.length) {
      await tx.insert(clientMemberships).values(
        input.clientIds.map((clientId) => ({
          userId: input.userId,
          clientId,
        })),
      );
    }
    return { success: true as const };
  });
}

export async function resetManagedUserPassword(
  userId: string,
  password: string,
) {
  const passwordHash = await hash(password, 12);
  const rows = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
  return { success: true as const };
}

export function slugifyClientName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 100)
    .replace(/-+$/, "");
}

export async function createManagedClient(name: string) {
  const slug = slugifyClientName(name);
  if (!slug)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Client name must contain letters or numbers",
    });
  try {
    const [client] = await db
      .insert(clients)
      .values({ name, slug })
      .returning({ id: clients.id });
    if (!client) throw new Error("Client insert returned no row");
    return client;
  } catch (error) {
    if (isUniqueViolation(error))
      throw new TRPCError({ code: "CONFLICT", cause: error });
    throw error;
  }
}

export async function updateManagedClient(input: {
  clientId: string;
  name: string;
  status: "active" | "inactive";
}) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select "id" from ${clients} where "id" = ${input.clientId} order by "id" for update`,
      );
      const [client] = await tx
        .select({ status: clients.status })
        .from(clients)
        .where(eq(clients.id, input.clientId));
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });
      if (client.status === "active" && input.status === "inactive") {
        await tx.execute(
          sql`select "id" from ${sourceAccounts} where "clientId" = ${input.clientId} order by "id" for update`,
        );
        const [assigned] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(sourceAccounts)
          .where(eq(sourceAccounts.clientId, input.clientId));
        if ((assigned?.count ?? 0) > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Unassign all source accounts before deactivating this client",
          });
        }
      }
      await tx
        .update(clients)
        .set({ name: input.name, status: input.status, updatedAt: new Date() })
        .where(eq(clients.id, input.clientId));
      return { success: true as const };
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new TRPCError({ code: "CONFLICT", cause: error });
    throw error;
  }
}

export async function assignManagedSourceAccount(
  sourceAccountId: string,
  clientId: string | null,
) {
  return db.transaction(async (tx) => {
    if (clientId) {
      await tx.execute(
        sql`select "id" from ${clients} where "id" = ${clientId} order by "id" for update`,
      );
    }
    await tx.execute(
      sql`select "id" from ${sourceAccounts} where "id" = ${sourceAccountId} order by "id" for update`,
    );
    if (clientId) {
      const [client] = await tx
        .select({ status: clients.status })
        .from(clients)
        .where(eq(clients.id, clientId));
      if (client?.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The target client must be active",
        });
      }
    }
    const rows = await tx
      .update(sourceAccounts)
      .set({ clientId })
      .where(eq(sourceAccounts.id, sourceAccountId))
      .returning({ id: sourceAccounts.id });
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
    return { success: true as const };
  });
}
