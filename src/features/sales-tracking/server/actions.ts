import "server-only";

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { clients } from "~/server/db/schema";

export async function saveDailyBookingGoal(input: {
  clientId: string;
  dailyBookingGoal: number | null;
}) {
  const rows = await db
    .update(clients)
    .set({ dailyBookingGoal: input.dailyBookingGoal, updatedAt: new Date() })
    .where(eq(clients.id, input.clientId))
    .returning({ id: clients.id });
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
  return { success: true as const };
}
