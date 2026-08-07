import { z } from "zod";

import {
  campaignAverageDaysSchema,
  DEFAULT_CAMPAIGN_AVERAGE_DAYS,
} from "~/features/campaign-tracker/average-days";
import { campaignCplThresholdsSchema } from "~/features/campaign-tracker/cpl-thresholds";
import { saveCampaignRemark } from "~/features/campaign-tracker/server/actions";
import {
  getCampaignCplThresholds,
  updateCampaignCplThresholds,
} from "~/features/campaign-tracker/server/cpl-thresholds";
import { getCampaignTrackerRows } from "~/features/campaign-tracker/server/queries";
import {
  agencyProcedure,
  createTRPCRouter,
  staffProcedure,
} from "~/server/api/trpc";

export const campaignTrackerRouter = createTRPCRouter({
  cplThresholds: staffProcedure.query(() => getCampaignCplThresholds()),
  updateCplThresholds: agencyProcedure
    .input(campaignCplThresholdsSchema)
    .mutation(({ ctx, input }) =>
      updateCampaignCplThresholds({
        ...input,
        userId: ctx.currentUser.id,
      }),
    ),
  daily: staffProcedure
    .input(
      z.object({
        date: z.string().date(),
        averageDays: campaignAverageDaysSchema.default(
          DEFAULT_CAMPAIGN_AVERAGE_DAYS,
        ),
      }),
    )
    .query(({ input }) =>
      getCampaignTrackerRows(input.date, input.averageDays),
    ),
  saveRemark: staffProcedure
    .input(
      z.object({
        campaignId: z.string().uuid(),
        date: z.string().date(),
        remark: z.string().max(2000),
      }),
    )
    .mutation(({ ctx, input }) =>
      saveCampaignRemark({ ...input, userId: ctx.currentUser.id }),
    ),
});
