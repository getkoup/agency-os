import {
  agencyReadProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { resolveAccessibleClientScope } from "~/features/dashboard/server/client-scope";
import { z } from "zod";

import {
  getAccountSummary,
  getClientAnalytics,
  getDashboardOverview,
  getFilterOptions,
  getLeadRows,
  getPerformanceRows,
  getSourceAccountRows,
  getSyncRuns,
  getTopCampaigns,
  getTrend,
} from "~/features/dashboard/server/queries";
import {
  dashboardFiltersSchema,
  dashboardListInputSchema,
  filterOptionsInputSchema,
} from "~/features/dashboard/server/schemas";

export const dashboardRouter = createTRPCRouter({
  currentUser: protectedProcedure.query(({ ctx }) => ctx.currentUser),
  filterOptions: protectedProcedure
    .input(filterOptionsInputSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getFilterOptions(input, scope);
    }),
  overview: protectedProcedure
    .input(dashboardFiltersSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getDashboardOverview(input, scope);
    }),
  trend: protectedProcedure
    .input(dashboardFiltersSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getTrend(input, scope);
    }),
  topCampaigns: protectedProcedure
    .input(dashboardFiltersSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getTopCampaigns(input, scope);
    }),
  recentLeads: protectedProcedure
    .input(dashboardFiltersSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      const result = await getLeadRows(input, scope, 1, 5);
      return result.rows;
    }),
  accountSummary: protectedProcedure
    .input(
      z.object({
        clientId: z
          .union([z.string().uuid(), z.literal("unassigned")])
          .optional(),
        platform: z.string().trim().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getAccountSummary(scope, input.platform);
    }),
  sourceAccounts: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().optional(),
        clientId: z
          .union([z.string().uuid(), z.literal("unassigned")])
          .optional(),
        platform: z.string().trim().min(1).optional(),
        status: z.enum(["active", "disconnected", "ignored"]).optional(),
        assignment: z.enum(["assigned", "unassigned"]).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getSourceAccountRows(input, scope, input.page, input.pageSize);
    }),
  syncRuns: agencyReadProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(({ input }) => getSyncRuns(input.page, input.pageSize)),
  clients: agencyReadProcedure
    .input(
      z.object({
        from: z.string().date(),
        to: z.string().date(),
        query: z.string().trim().optional(),
        status: z.enum(["active", "inactive"]).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(({ input }) => getClientAnalytics(input)),
  performance: protectedProcedure
    .input(dashboardListInputSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getPerformanceRows(input, scope, input.page, input.pageSize);
    }),
  leads: protectedProcedure
    .input(dashboardListInputSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getLeadRows(input, scope, input.page, input.pageSize);
    }),
});
