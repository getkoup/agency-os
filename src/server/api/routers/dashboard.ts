import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { resolveAccessibleClientScope } from "~/features/dashboard/server/client-scope";
import {
  getAccountSummary,
  getClientHealthRows,
  getClientAnalytics,
  getDashboardOverview,
  getFilterOptions,
  getLeadRows,
  getLeadAnalytics,
  getMonitoringCampaigns,
  getPerformanceRows,
  getRevenueRows,
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
import { getAllClientSyncRuns } from "~/features/synchronization/server/queries";
import {
  agencyProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  syncAllClients,
  SyncAlreadyRunningError,
} from "~/server/sync/sync-all-clients";

export const dashboardRouter = createTRPCRouter({
  currentUser: protectedProcedure.query(({ ctx }) => ctx.currentUser),
  filterOptions: protectedProcedure
    .input(filterOptionsInputSchema)
    .query(async ({ ctx, input }) => {
      const [scope, clientOptionScope] = await Promise.all([
        resolveAccessibleClientScope(ctx.currentUser, input.clientId),
        resolveAccessibleClientScope(ctx.currentUser, undefined),
      ]);
      return getFilterOptions(input, scope, clientOptionScope);
    }),
  monitoring: protectedProcedure
    .input(
      z.object({
        from: z.string().date(),
        to: z.string().date(),
        clientId: z
          .union([z.string().uuid(), z.literal("unassigned")])
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getMonitoringCampaigns(input, scope);
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
  clientHealth: protectedProcedure
    .input(dashboardFiltersSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getClientHealthRows(input, scope);
    }),
  leadAnalytics: protectedProcedure
    .input(dashboardFiltersSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getLeadAnalytics(input, scope);
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
  syncRuns: agencyProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(({ input }) => getSyncRuns(input.page, input.pageSize)),
  allClientSyncRuns: agencyProcedure.query(() => getAllClientSyncRuns()),
  syncAllClients: agencyProcedure.mutation(async ({ ctx }) => {
    try {
      return await syncAllClients(ctx.currentUser.id);
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error.message,
          cause: error,
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Synchronization could not start. Check server configuration.",
      });
    }
  }),
  clients: agencyProcedure
    .input(
      z.object({
        from: z.string().date(),
        to: z.string().date(),
        clientId: z.string().uuid().optional(),
        query: z.string().trim().optional(),
        status: z.enum(["active", "inactive"]).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(25),
      }),
    )
    .query(({ input }) =>
      getClientAnalytics({
        ...input,
        clientIds: input.clientId ? [input.clientId] : undefined,
      }),
    ),
  revenue: agencyProcedure
    .input(dashboardListInputSchema)
    .query(async ({ ctx, input }) => {
      const scope = await resolveAccessibleClientScope(
        ctx.currentUser,
        input.clientId,
      );
      return getRevenueRows(input, scope, input.page, input.pageSize);
    }),
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
