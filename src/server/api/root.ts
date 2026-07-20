import { campaignTrackerRouter } from "~/server/api/routers/campaign-tracker";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { managementRouter } from "~/server/api/routers/management";
import { settingsRouter } from "~/server/api/routers/settings";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  campaignTracker: campaignTrackerRouter,
  dashboard: dashboardRouter,
  management: managementRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
