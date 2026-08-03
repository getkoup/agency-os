import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { resolveAccessibleClientScope } from "~/features/dashboard/server/client-scope";
import {
  getAllClientSyncRuns,
  getSynchronizationClientStatuses,
} from "~/features/synchronization/server/queries";
import {
  agencyProcedure,
  createTRPCRouter,
  ownerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  FailedClientSyncTargetsNotFoundError,
  retryClientSync,
} from "~/server/sync/retry-client-sync";
import { scheduleSyncWorker } from "~/server/sync/schedule-worker";
import { CLIENT_SYNC_COOLDOWN_MS } from "~/server/sync/sync-mode";
import {
  queueSynchronization,
  SyncAlreadyRunningError,
  SyncCooldownError,
  SynchronizationClientNotFoundError,
} from "~/server/sync/synchronization-queue";

const optionalClientInput = z.object({
  clientId: z.string().uuid().optional(),
});

function synchronizationError(error: unknown): TRPCError {
  if (error instanceof SyncAlreadyRunningError) {
    return new TRPCError({
      code: "CONFLICT",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof SyncCooldownError) {
    return new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof SynchronizationClientNotFoundError) {
    return new TRPCError({
      code: "NOT_FOUND",
      message: error.message,
      cause: error,
    });
  }
  console.error("Synchronization request failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage:
      error instanceof Error ? error.message : "Unknown synchronization error",
  });
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Synchronization could not start. Please try again.",
    cause: error,
  });
}

export const synchronizationRouter = createTRPCRouter({
  clientStatuses: protectedProcedure.query(({ ctx }) =>
    getSynchronizationClientStatuses(ctx.currentUser),
  ),
  history: agencyProcedure.query(() => getAllClientSyncRuns()),
  requestFresh: protectedProcedure
    .input(optionalClientInput)
    .mutation(async ({ ctx, input }) => {
      if (ctx.currentUser.role === "manager") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (ctx.currentUser.role === "client") {
        if (!input.clientId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a client to synchronize",
          });
        }
        await resolveAccessibleClientScope(ctx.currentUser, input.clientId);
      }
      try {
        const run = await queueSynchronization({
          minimumIntervalMs:
            ctx.currentUser.role === "client"
              ? CLIENT_SYNC_COOLDOWN_MS
              : undefined,
          mode: "fresh",
          requestedByUserId: ctx.currentUser.id,
          scope: input.clientId
            ? { kind: "client", clientId: input.clientId }
            : { kind: "all" },
          trigger: "manual",
        });
        if (!run) {
          throw new Error("No synchronization targets were queued");
        }
        if (run.status === "running") scheduleSyncWorker(run.id);
        return run;
      } catch (error) {
        throw synchronizationError(error);
      }
    }),
  requestFull: ownerProcedure
    .input(optionalClientInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const run = await queueSynchronization({
          mode: "full",
          requestedByUserId: ctx.currentUser.id,
          scope: input.clientId
            ? { kind: "client", clientId: input.clientId }
            : { kind: "all" },
          trigger: "manual",
        });
        if (!run) {
          throw new Error("No synchronization targets were queued");
        }
        if (run.status === "running") scheduleSyncWorker(run.id);
        return run;
      } catch (error) {
        throw synchronizationError(error);
      }
    }),
  retryClient: agencyProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        sourceRunId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const run = await retryClientSync({
          ...input,
          requestedByUserId: ctx.currentUser.id,
        });
        scheduleSyncWorker(run.id);
        return run;
      } catch (error) {
        if (error instanceof FailedClientSyncTargetsNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
            cause: error,
          });
        }
        throw synchronizationError(error);
      }
    }),
});
