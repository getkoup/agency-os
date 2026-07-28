import { campaignTrackerRouter } from "~/server/api/routers/campaign-tracker";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { managementRouter } from "~/server/api/routers/management";
import { salesTrackingRouter } from "~/server/api/routers/sales-tracking";
import { settingsRouter } from "~/server/api/routers/settings";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  campaignTracker: campaignTrackerRouter,
  dashboard: dashboardRouter,
  management: managementRouter,
  salesTracking: salesTrackingRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
