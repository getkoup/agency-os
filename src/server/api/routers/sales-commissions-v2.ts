import { z } from "zod";

import {
  createSalesCommissionV2Category,
  createSalesCommissionV2MappingRule,
  removeSalespersonCommissionV2Rate,
  saveSalesCommissionV2Settings,
  updateSalesCommissionV2Category,
  updateSalesCommissionV2MappingRule,
  upsertSalespersonCommissionV2Rate,
} from "~/features/sales-commissions-v2/server/actions";
import {
  getSalesCommissionV2Report,
  getSalesCommissionV2Setup,
} from "~/features/sales-commissions-v2/server/queries";
import {
  agencyProcedure,
  createTRPCRouter,
  staffProcedure,
} from "~/server/api/trpc";

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
const money = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Use a non-negative USD value");
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
const commissionRateInput = z.object({
  clientId: id,
  salespersonExternalUserId: z.string().trim().min(1).max(255),
  categoryId: id,
});

export const salesCommissionsV2Router = createTRPCRouter({
  report: staffProcedure
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
  setup: agencyProcedure
    .input(z.object({ clientId: id.optional() }))
    .query(({ input }) => getSalesCommissionV2Setup(input)),
  saveSettings: agencyProcedure
    .input(z.object({ clientId: id, attributionMode }))
    .mutation(({ input }) => saveSalesCommissionV2Settings(input)),
  createCategory: agencyProcedure
    .input(categoryInput)
    .mutation(({ input }) => createSalesCommissionV2Category(input)),
  updateCategory: agencyProcedure
    .input(
      categoryInput.extend({
        categoryId: id,
        status,
      }),
    )
    .mutation(({ input }) => updateSalesCommissionV2Category(input)),
  createMappingRule: agencyProcedure
    .input(mappingRuleInput)
    .mutation(({ input }) => createSalesCommissionV2MappingRule(input)),
  updateMappingRule: agencyProcedure
    .input(
      mappingRuleInput.extend({
        ruleId: id,
        status,
      }),
    )
    .mutation(({ input }) => updateSalesCommissionV2MappingRule(input)),
  upsertCommissionRate: agencyProcedure
    .input(commissionRateInput.extend({ commissionValue: money }))
    .mutation(({ input }) => upsertSalespersonCommissionV2Rate(input)),
  removeCommissionRate: agencyProcedure
    .input(commissionRateInput)
    .mutation(({ input }) => removeSalespersonCommissionV2Rate(input)),
});
