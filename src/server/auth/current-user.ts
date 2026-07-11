import "server-only";

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { users } from "~/server/db/schema";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  role: "agency_admin" | "client_viewer";
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
    })
    .from(users)
    .where(eq(users.id, sessionUserId))
    .limit(1);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return user;
}
