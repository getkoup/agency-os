import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "~/server/auth";
import { getCurrentUser } from "~/server/auth/current-user";
import { db } from "~/server/db";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();
  const currentUser = session?.user?.id
    ? await getCurrentUser(session.user.id).catch((error: unknown) => {
        if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
          return null;
        }
        throw error;
      })
    : null;
  return { db, session, currentUser, ...opts };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user || !ctx.currentUser) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
      currentUser: ctx.currentUser,
    },
  });
});

export const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.currentUser.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const agencyProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.currentUser.role === "client") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});
