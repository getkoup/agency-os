import { z } from "zod";

import {
  createSalesCategory,
  createSalesOffer,
  removeSalespersonCommissionRate,
  saveSalesCommissionSettings,
  updateSalesCategory,
  updateSalesOffer,
  updateSalesperson,
  upsertSalespersonCommissionRate,
} from "~/features/sales-commissions/server/actions";
import {
  getSalesCommissionReport,
  getSalesCommissionSetup,
} from "~/features/sales-commissions/server/queries";
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
const classificationStatus = z.enum([
  "matched",
  "unmatched",
  "ambiguous",
  "missing_description",
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
const offerInput = z.object({
  clientId: id,
  categoryId: id,
  name: z.string().trim().min(1).max(100),
  keywords: z.array(z.string().trim().min(1).max(255)).min(1).max(20),
  matchMode: z.enum(["any", "all"]),
  priority: z.number().int().min(0).max(1_000),
  revenueValue: money,
});

export const salesCommissionsRouter = createTRPCRouter({
  report: staffProcedure
    .input(
      z.object({
        from: z.string().date(),
        to: z.string().date(),
        clientId: id.optional(),
        salespersonId: z.union([id, z.literal("unassigned")]).optional(),
        status: appointmentStatus.optional(),
        categoryId: id.optional(),
        classificationStatus: classificationStatus.optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(({ input }) => getSalesCommissionReport(input)),
  setup: agencyProcedure
    .input(z.object({ clientId: id.optional() }))
    .query(({ input }) => getSalesCommissionSetup(input)),
  saveSettings: agencyProcedure
    .input(z.object({ clientId: id, attributionMode }))
    .mutation(({ input }) => saveSalesCommissionSettings(input)),
  createCategory: agencyProcedure
    .input(categoryInput)
    .mutation(({ input }) => createSalesCategory(input)),
  updateCategory: agencyProcedure
    .input(
      categoryInput.extend({
        categoryId: id,
        status,
      }),
    )
    .mutation(({ input }) => updateSalesCategory(input)),
  createOffer: agencyProcedure
    .input(offerInput)
    .mutation(({ input }) => createSalesOffer(input)),
  updateOffer: agencyProcedure
    .input(
      offerInput.extend({
        offerId: id,
        status,
      }),
    )
    .mutation(({ input }) => updateSalesOffer(input)),
  updateSalesperson: agencyProcedure
    .input(
      z.object({
        clientId: id,
        salespersonId: id,
        displayName: z.string().trim().min(1).max(255),
        status,
      }),
    )
    .mutation(({ input }) => updateSalesperson(input)),
  upsertCommissionRate: agencyProcedure
    .input(
      z.object({
        clientId: id,
        salespersonId: id,
        categoryId: id,
        commissionValue: money,
      }),
    )
    .mutation(({ input }) => upsertSalespersonCommissionRate(input)),
  removeCommissionRate: agencyProcedure
    .input(
      z.object({
        clientId: id,
        salespersonId: id,
        categoryId: id,
      }),
    )
    .mutation(({ input }) => removeSalespersonCommissionRate(input)),
});
