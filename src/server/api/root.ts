import { assignmentsRouter } from "~/server/api/routers/assignments";
import { campaignTrackerRouter } from "~/server/api/routers/campaign-tracker";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { managementRouter } from "~/server/api/routers/management";
import { salesCommissionsRouter } from "~/server/api/routers/sales-commissions";
import { salesTrackingRouter } from "~/server/api/routers/sales-tracking";
import { settingsRouter } from "~/server/api/routers/settings";
import { synchronizationRouter } from "~/server/api/routers/synchronization";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  assignments: assignmentsRouter,
  campaignTracker: campaignTrackerRouter,
  dashboard: dashboardRouter,
  management: managementRouter,
  salesCommissions: salesCommissionsRouter,
  salesTracking: salesTrackingRouter,
  settings: settingsRouter,
  synchronization: synchronizationRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
