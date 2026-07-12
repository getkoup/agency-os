import { dashboardRouter } from "~/server/api/routers/dashboard";
import { managementRouter } from "~/server/api/routers/management";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  dashboard: dashboardRouter,
  management: managementRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
