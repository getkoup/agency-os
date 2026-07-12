import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { type UserRole } from "~/lib/roles";
import { db } from "~/server/db";
import { clientMemberships, clients } from "~/server/db/schema";

export type RequestedClientScope = string | undefined;

export async function resolveAccessibleClientScope(
  user: { id: string; role: UserRole },
  requestedClientId: RequestedClientScope,
): Promise<{ includeUnassigned: boolean; clientIds: string[] | null }> {
  if (user.role === "owner" || user.role === "admin") {
    if (requestedClientId === undefined) {
      return { clientIds: null, includeUnassigned: true };
    }
    if (requestedClientId === "unassigned") {
      return { clientIds: [], includeUnassigned: true };
    }
    return { clientIds: [requestedClientId], includeUnassigned: false };
  }

  const memberships = await db
    .select({ clientId: clientMemberships.clientId })
    .from(clientMemberships)
    .innerJoin(clients, eq(clientMemberships.clientId, clients.id))
    .where(
      and(eq(clientMemberships.userId, user.id), eq(clients.status, "active")),
    );
  const membershipIds = memberships.map(({ clientId }) => clientId);
  if (requestedClientId === undefined) {
    return { clientIds: membershipIds, includeUnassigned: false };
  }
  if (
    requestedClientId === "unassigned" ||
    !membershipIds.includes(requestedClientId)
  ) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return { clientIds: [requestedClientId], includeUnassigned: false };
}
