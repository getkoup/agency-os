import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { campaignDailyRemarks, campaigns } from "~/server/db/schema";

export async function saveCampaignRemark(input: {
  campaignId: string;
  date: string;
  remark: string;
  userId: string;
}) {
  const remark = input.remark.trim();
  if (remark.length > 2000) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Remarks cannot exceed 2,000 characters",
    });
  }
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, input.campaignId))
    .limit(1);
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
  if (!remark) {
    await db
      .delete(campaignDailyRemarks)
      .where(
        and(
          eq(campaignDailyRemarks.campaignId, input.campaignId),
          eq(campaignDailyRemarks.date, input.date),
        ),
      );
    return { success: true as const };
  }
  await db
    .insert(campaignDailyRemarks)
    .values({
      campaignId: input.campaignId,
      date: input.date,
      remark,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
    })
    .onConflictDoUpdate({
      target: [campaignDailyRemarks.campaignId, campaignDailyRemarks.date],
      set: {
        remark,
        updatedByUserId: input.userId,
        updatedAt: new Date(),
      },
    });
  return { success: true as const };
}
