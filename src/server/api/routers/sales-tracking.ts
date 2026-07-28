import { z } from "zod";

import { saveDailyBookingGoal } from "~/features/sales-tracking/server/actions";
import { getSalesTrackingRows } from "~/features/sales-tracking/server/queries";
import {
  agencyProcedure,
  createTRPCRouter,
  staffProcedure,
} from "~/server/api/trpc";

export const salesTrackingRouter = createTRPCRouter({
  daily: staffProcedure
    .input(
      z.object({
        date: z.string().date(),
        groupSize: z.number().int().min(1).max(90),
      }),
    )
    .query(({ input }) => getSalesTrackingRows(input)),
  saveGoal: agencyProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        dailyBookingGoal: z.number().int().positive().nullable(),
      }),
    )
    .mutation(({ input }) => saveDailyBookingGoal(input)),
});
