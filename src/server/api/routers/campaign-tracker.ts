import { z } from "zod";

import { saveCampaignRemark } from "~/features/campaign-tracker/server/actions";
import { getCampaignTrackerRows } from "~/features/campaign-tracker/server/queries";
import { createTRPCRouter, staffProcedure } from "~/server/api/trpc";

export const campaignTrackerRouter = createTRPCRouter({
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
