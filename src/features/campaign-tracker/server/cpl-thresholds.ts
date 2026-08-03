import "server-only";

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import {
  campaignCplThresholdsSchema,
  DEFAULT_CAMPAIGN_CPL_THRESHOLDS,
  type CampaignCplThresholds,
} from "~/features/campaign-tracker/cpl-thresholds";
import { AGENCY_SETTING_ID } from "~/features/settings/server/reporting-timezone";
import { db } from "~/server/db";
import { agencySettings } from "~/server/db/schema";

export async function getCampaignCplThresholds(): Promise<CampaignCplThresholds> {
  const [settings] = await db
    .select({
      warningThreshold: agencySettings.campaignCplWarningThreshold,
      criticalThreshold: agencySettings.campaignCplCriticalThreshold,
    })
    .from(agencySettings)
    .where(eq(agencySettings.id, AGENCY_SETTING_ID))
    .limit(1);
  return settings ?? DEFAULT_CAMPAIGN_CPL_THRESHOLDS;
}

export async function updateCampaignCplThresholds(input: {
  warningThreshold: string;
  criticalThreshold: string;
  userId: string;
}): Promise<CampaignCplThresholds> {
  const parsed = campaignCplThresholdsSchema.safeParse(input);
  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid CPL thresholds",
      cause: parsed.error,
    });
  }
  const [settings] = await db
    .insert(agencySettings)
    .values({
      id: AGENCY_SETTING_ID,
      campaignCplWarningThreshold: parsed.data.warningThreshold,
      campaignCplCriticalThreshold: parsed.data.criticalThreshold,
      updatedByUserId: input.userId,
    })
    .onConflictDoUpdate({
      target: agencySettings.id,
      set: {
        campaignCplWarningThreshold: parsed.data.warningThreshold,
        campaignCplCriticalThreshold: parsed.data.criticalThreshold,
        updatedByUserId: input.userId,
        updatedAt: new Date(),
      },
    })
    .returning({
      warningThreshold: agencySettings.campaignCplWarningThreshold,
      criticalThreshold: agencySettings.campaignCplCriticalThreshold,
    });
  if (!settings) throw new Error("CPL threshold update returned no row");
  return settings;
}
