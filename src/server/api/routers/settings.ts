import { z } from "zod";

import {
  createRevenueRule,
  updateRevenueRule,
} from "~/features/settings/server/actions";
import {
  getGhlConfigurationStatus,
  listRevenueRules,
} from "~/features/settings/server/queries";
import { agencyProcedure, createTRPCRouter } from "~/server/api/trpc";

const clientId = z.string().uuid();
const tagName = z.string().trim().min(1).max(255);
const revenueValue = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Use a non-negative USD value");
const serviceName = z.string().trim().max(255).optional();
const status = z.enum(["active", "inactive"]);

export const settingsRouter = createTRPCRouter({
  revenueRules: agencyProcedure
    .input(
      z.object({
        clientId: clientId.optional(),
        status: status.optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(({ input }) => listRevenueRules(input)),
  createRevenueRule: agencyProcedure
    .input(z.object({ clientId, tagName, revenueValue, serviceName }))
    .mutation(({ input }) => createRevenueRule(input)),
  updateRevenueRule: agencyProcedure
    .input(
      z.object({
        ruleId: z.string().uuid(),
        clientId,
        tagName,
        revenueValue,
        serviceName,
        status,
      }),
    )
    .mutation(({ input }) => updateRevenueRule(input)),
  ghlConfigurationStatus: agencyProcedure.query(() =>
    getGhlConfigurationStatus(),
  ),
});
