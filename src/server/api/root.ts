import { dashboardRouter } from "~/server/api/routers/dashboard";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({ dashboard: dashboardRouter });

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
