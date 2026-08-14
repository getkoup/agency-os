import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createSalesCommissionV2Category,
  createSalesCommissionV2MappingRule,
  saveSalesCommissionV2Settings,
  updateSalesCommissionV2Category,
  updateSalesCommissionV2MappingRule,
} from "~/features/sales-commissions-v2/server/actions";
import { canAccessSalesCommissionV2 } from "~/features/sales-commissions-v2/server/access";
import {
  getSalesCommissionV2Report,
  getSalesCommissionV2Setup,
} from "~/features/sales-commissions-v2/server/queries";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const salesCommissionV2Procedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!(await canAccessSalesCommissionV2(ctx.currentUser.role))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  },
);

const id = z.string().uuid();
const status = z.enum(["active", "inactive"]);
const appointmentStatus = z.enum([
  "new",
  "confirmed",
  "showed",
  "cancelled",
  "noshow",
  "invalid",
]);
const attributionMode = z.enum([
  "created_by",
  "assigned_user",
  "created_by_then_assigned",
]);
const commissionPercentage = z
  .string()
  .trim()
  .regex(
    /^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/,
    "Use a percentage between 0 and 100 with at most two decimals",
  );
const categoryInput = z.object({
  clientId: id,
  name: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().min(0).max(10_000),
});
const mappingRuleInput = z.object({
  clientId: id,
  categoryId: id,
  name: z.string().trim().min(1).max(100),
  field: z.enum(["category", "service"]),
  keywords: z.array(z.string().trim().min(1).max(255)).min(1).max(20),
  matchMode: z.enum(["any", "all"]),
  priority: z.number().int().min(0).max(1_000),
});

export const salesCommissionsV2Router = createTRPCRouter({
  report: salesCommissionV2Procedure
    .input(
      z.object({
        from: z.string().date(),
        to: z.string().date(),
        clientId: id.optional(),
        globalSalespersonId: z.union([id, z.literal("unassigned")]).optional(),
        status: appointmentStatus.optional(),
        categoryId: id.optional(),
        review: z.enum(["ready", "needs_review"]).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(({ input }) => getSalesCommissionV2Report(input)),
  setup: salesCommissionV2Procedure
    .input(z.object({ clientId: id.optional() }))
    .query(({ input }) => getSalesCommissionV2Setup(input)),
  saveSettings: salesCommissionV2Procedure
    .input(z.object({ clientId: id, attributionMode, commissionPercentage }))
    .mutation(({ input }) => saveSalesCommissionV2Settings(input)),
  createCategory: salesCommissionV2Procedure
    .input(categoryInput)
    .mutation(({ input }) => createSalesCommissionV2Category(input)),
  updateCategory: salesCommissionV2Procedure
    .input(
      categoryInput.extend({
        categoryId: id,
        status,
      }),
    )
    .mutation(({ input }) => updateSalesCommissionV2Category(input)),
  createMappingRule: salesCommissionV2Procedure
    .input(mappingRuleInput)
    .mutation(({ input }) => createSalesCommissionV2MappingRule(input)),
  updateMappingRule: salesCommissionV2Procedure
    .input(
      mappingRuleInput.extend({
        ruleId: id,
        status,
      }),
    )
    .mutation(({ input }) => updateSalesCommissionV2MappingRule(input)),
});
