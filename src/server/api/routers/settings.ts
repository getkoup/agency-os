import { z } from "zod";

import {
  createLeadClassificationRule,
  createRevenueRule,
  removeGhlClientConfiguration,
  saveGhlClientConfiguration,
  updateLeadClassificationRule,
  updateRevenueRule,
} from "~/features/settings/server/actions";
import {
  getGhlConfigurationStatus,
  listLeadClassificationRules,
  listRevenueRules,
} from "~/features/settings/server/queries";
import {
  agencyProcedure,
  createTRPCRouter,
  ownerProcedure,
} from "~/server/api/trpc";

const clientId = z.string().uuid();
const tagName = z.string().trim().min(1).max(255);
const revenueValue = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Use a non-negative USD value");
const serviceName = z.string().trim().max(255).optional();
const status = z.enum(["active", "inactive"]);
const categoryName = z.string().trim().min(1).max(100);
const keywords = z.array(z.string().trim().min(1).max(100)).min(1).max(20);
const matchMode = z.enum(["any", "all"]);
const priority = z.number().int().min(0).max(1_000);

export const settingsRouter = createTRPCRouter({
  leadClassificationRules: agencyProcedure
    .input(
      z.object({
        clientId: clientId.optional(),
        limit: z.number().int().positive().max(100).default(100),
      }),
    )
    .query(({ input }) => listLeadClassificationRules(input)),
  createLeadClassificationRule: ownerProcedure
    .input(
      z.object({
        clientId,
        categoryName,
        keywords,
        matchMode,
        priority,
      }),
    )
    .mutation(({ input }) => createLeadClassificationRule(input)),
  updateLeadClassificationRule: ownerProcedure
    .input(
      z.object({
        ruleId: z.string().uuid(),
        clientId,
        categoryName,
        keywords,
        matchMode,
        priority,
        status,
      }),
    )
    .mutation(({ input }) => updateLeadClassificationRule(input)),
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
  ghlConfigurationStatus: ownerProcedure.query(() =>
    getGhlConfigurationStatus(),
  ),
  saveGhlConfiguration: ownerProcedure
    .input(
      z.object({
        clientId,
        locationId: z.string().trim().min(1).max(255),
        token: z.string().trim().min(10).max(5_000),
      }),
    )
    .mutation(({ ctx, input }) =>
      saveGhlClientConfiguration({ ...input, userId: ctx.currentUser.id }),
    ),
  removeGhlConfiguration: ownerProcedure
    .input(z.object({ clientId }))
    .mutation(({ input }) => removeGhlClientConfiguration(input.clientId)),
});
