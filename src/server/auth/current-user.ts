import "server-only";

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { type UserRole } from "~/lib/roles";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  status: "active";
}

export async function getCurrentUser(
  sessionUserId: string,
): Promise<CurrentUser> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, sessionUserId))
    .limit(1);
  if (user?.status !== "active") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return { ...user, status: "active" };
}

export const getAuthenticatedUser = cache(async (): Promise<CurrentUser> => {
  const session = await auth();
  if (!session?.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
  return getCurrentUser(session.user.id);
});
