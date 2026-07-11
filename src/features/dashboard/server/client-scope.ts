import "server-only";

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { clientMemberships } from "~/server/db/schema";
import { type UserRole } from "~/server/auth/config";

export type RequestedClientScope = string | undefined;

export async function resolveAccessibleClientScope(
  user: { id: string; role: UserRole },
  requestedClientId: RequestedClientScope,
): Promise<{ includeUnassigned: boolean; clientIds: string[] | null }> {
  if (user.role === "agency_admin") {
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
    .where(eq(clientMemberships.userId, user.id));
  const membershipIds = memberships.map((membership) => membership.clientId);
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
