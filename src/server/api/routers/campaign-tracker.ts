import { z } from "zod";

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
    .input(z.object({ date: z.string().date() }))
    .query(({ input }) => getCampaignTrackerRows(input.date)),
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
