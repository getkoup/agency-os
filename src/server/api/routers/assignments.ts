import {
  listAssignmentsSchema,
  updateAssignmentSchema,
} from "~/features/assignments/schemas";
import {
  getAssignmentOptions,
  listAssignments,
  updateAssignment,
} from "~/features/assignments/server/service";
import { createTRPCRouter, staffProcedure } from "~/server/api/trpc";

export const assignmentsRouter = createTRPCRouter({
  list: staffProcedure
    .input(listAssignmentsSchema)
    .query(({ input }) => listAssignments(input)),
  options: staffProcedure.query(() => getAssignmentOptions()),
  update: staffProcedure
    .input(updateAssignmentSchema)
    .mutation(({ ctx, input }) => updateAssignment(input, ctx.currentUser.id)),
});
