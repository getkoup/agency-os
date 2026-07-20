import { z } from "zod";

import { USER_ROLES } from "~/lib/roles";
import {
  assignManagedSourceAccount,
  assignUnassignedSourceAccounts,
  createManagedClient,
  createManagedUser,
  deleteManagedClient,
  resetManagedUserPassword,
  updateManagedClient,
  updateManagedUser,
} from "~/features/management/server/actions";
import {
  listAccountAssignments,
  listClientOptions,
  listManagedClients,
  listManagedUsers,
} from "~/features/management/server/queries";
import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

const pageFields = {
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
};
const name = z.string().trim().min(1).max(255);
const role = z.enum(USER_ROLES);
const status = z.enum(["active", "inactive"]);
const clientIds = z
  .array(z.string().uuid())
  .transform((values) => [...new Set(values)]);
const sourceAccountIds = z
  .array(z.string().uuid())
  .max(100)
  .transform((values) => [...new Set(values)]);
const requiredSourceAccountIds = z
  .array(z.string().uuid())
  .min(1)
  .max(100)
  .transform((values) => [...new Set(values)]);
const email = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const password = z.string().min(12);

export const managementRouter = createTRPCRouter({
  users: ownerProcedure
    .input(
      z.object({
        query: z.string().trim().optional(),
        role: role.optional(),
        status: status.optional(),
        clientId: z.string().uuid().optional(),
        ...pageFields,
      }),
    )
    .query(({ input }) => listManagedUsers(input)),
  createUser: ownerProcedure
    .input(z.object({ name, email, password, role, clientIds }))
    .mutation(({ input }) => createManagedUser(input)),
  updateUser: ownerProcedure
    .input(
      z.object({ userId: z.string().uuid(), name, role, status, clientIds }),
    )
    .mutation(({ input }) => updateManagedUser(input)),
  resetUserPassword: ownerProcedure
    .input(z.object({ userId: z.string().uuid(), password }))
    .mutation(({ input }) =>
      resetManagedUserPassword(input.userId, input.password),
    ),
  clients: ownerProcedure
    .input(
      z.object({
        query: z.string().trim().optional(),
        status: status.optional(),
        ...pageFields,
      }),
    )
    .query(({ input }) => listManagedClients(input)),
  clientOptions: ownerProcedure
    .input(
      z.object({
        query: z.string().trim().optional(),
        limit: z.number().int().positive().max(50).default(50),
      }),
    )
    .query(({ input }) => listClientOptions(input.query, input.limit)),
  createClient: ownerProcedure
    .input(z.object({ name, sourceAccountIds }))
    .mutation(({ input }) => createManagedClient(input)),
  updateClient: ownerProcedure
    .input(z.object({ clientId: z.string().uuid(), name, status }))
    .mutation(({ input }) => updateManagedClient(input)),
  deleteClient: ownerProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .mutation(({ input }) => deleteManagedClient(input.clientId)),
  accountAssignments: ownerProcedure
    .input(
      z.object({
        query: z.string().trim().optional(),
        clientId: z
          .union([z.string().uuid(), z.literal("unassigned")])
          .optional(),
        platform: z.string().trim().min(1).optional(),
        status: z.enum(["active", "disconnected", "ignored"]).optional(),
        assignment: z.enum(["assigned", "unassigned"]).optional(),
        ...pageFields,
      }),
    )
    .query(({ input }) => listAccountAssignments(input)),
  assignSourceAccount: ownerProcedure
    .input(
      z.object({
        sourceAccountId: z.string().uuid(),
        clientId: z.string().uuid().nullable(),
      }),
    )
    .mutation(({ input }) =>
      assignManagedSourceAccount(input.sourceAccountId, input.clientId),
    ),
  assignUnassignedSourceAccounts: ownerProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        sourceAccountIds: requiredSourceAccountIds,
      }),
    )
    .mutation(({ input }) => assignUnassignedSourceAccounts(input)),
});
