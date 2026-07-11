import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { resolveAccessibleClientScope } from "~/features/dashboard/server/client-scope";
import {
  getDashboardOverview,
  getFilterOptions,
  getLeadRows,
  getPerformanceRows,
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
