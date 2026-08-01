import "server-only";

import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db";
import {
  clients,
  globalSalespeople,
  globalSalespersonIdentities,
  salespeople,
} from "~/server/db/schema";

const MAX_GLOBAL_SALESPEOPLE = 500;
const MAX_GLOBAL_ASSIGNMENTS = 5_000;

function normalizedOptionalName(value: string): string | null {
  return value.trim() || null;
}

function resolvedGlobalName(
  globalSalesperson: { id: string; displayName: string | null },
  assignments: readonly {
    providerName: string | null;
    displayName: string | null;
  }[],
): string {
  return (
    globalSalesperson.displayName ??
    assignments.find((assignment) => assignment.providerName)?.providerName ??
    assignments.find((assignment) => assignment.displayName)?.displayName ??
    `Unnamed • ${globalSalesperson.id.slice(-6)}`
  );
}

export async function getGlobalSalespeople(input: {
  search?: string;
  page: number;
  pageSize: number;
}) {
  const [globalRows, [globalCount], [assignmentCount]] = await Promise.all([
    db
      .select({
        id: globalSalespeople.id,
        displayName: globalSalespeople.displayName,
      })
      .from(globalSalespeople)
      .orderBy(asc(globalSalespeople.createdAt), asc(globalSalespeople.id))
      .limit(MAX_GLOBAL_SALESPEOPLE + 1),
    db.select({ value: count() }).from(globalSalespeople),
    db.select({ value: count() }).from(salespeople),
  ]);
  const loadedGlobalRows = globalRows.slice(0, MAX_GLOBAL_SALESPEOPLE);
  const loadedGlobalSalespersonIds = loadedGlobalRows.map(
    (person) => person.id,
  );
  const assignmentRows = loadedGlobalSalespersonIds.length
    ? await db
        .select({
          globalSalespersonId: globalSalespersonIdentities.globalSalespersonId,
          externalUserId: globalSalespersonIdentities.externalUserId,
          salespersonId: salespeople.id,
          clientId: clients.id,
          clientName: clients.name,
          providerName: salespeople.providerName,
          displayName: salespeople.displayName,
        })
        .from(globalSalespersonIdentities)
        .innerJoin(
          salespeople,
          and(
            eq(globalSalespersonIdentities.provider, "ghl"),
            eq(
              globalSalespersonIdentities.externalUserId,
              salespeople.externalUserId,
            ),
          ),
        )
        .innerJoin(clients, eq(salespeople.clientId, clients.id))
        .where(
          inArray(
            globalSalespersonIdentities.globalSalespersonId,
            loadedGlobalSalespersonIds,
          ),
        )
        .orderBy(asc(clients.name), asc(salespeople.id))
        .limit(MAX_GLOBAL_ASSIGNMENTS + 1)
    : [];
  const isTruncated =
    globalRows.length > MAX_GLOBAL_SALESPEOPLE ||
    assignmentRows.length > MAX_GLOBAL_ASSIGNMENTS;
  const loadedAssignments = assignmentRows.slice(0, MAX_GLOBAL_ASSIGNMENTS);
  const assignmentsByGlobalSalesperson = new Map<
    string,
    typeof loadedAssignments
  >();
  for (const assignment of loadedAssignments) {
    const values =
      assignmentsByGlobalSalesperson.get(assignment.globalSalespersonId) ?? [];
    values.push(assignment);
    assignmentsByGlobalSalesperson.set(assignment.globalSalespersonId, values);
  }

  const normalizedSearch = input.search?.trim().toLowerCase() ?? "";
  const allPeople = loadedGlobalRows
    .map((person) => {
      const assignments = assignmentsByGlobalSalesperson.get(person.id) ?? [];
      const name = resolvedGlobalName(person, assignments);
      return {
        ...person,
        name,
        isUnnamed:
          person.displayName === null &&
          assignments.every(
            (assignment) =>
              assignment.providerName === null &&
              assignment.displayName === null,
          ),
        clientCount: new Set(
          assignments.map((assignment) => assignment.clientId),
        ).size,
        externalIdentityCount: new Set(
          assignments.map((assignment) => assignment.externalUserId),
        ).size,
        assignments,
      };
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  const filteredPeople = allPeople.filter((person) => {
    if (!normalizedSearch) return true;
    return [
      person.name,
      person.displayName,
      ...person.assignments.flatMap((assignment) => [
        assignment.clientName,
        assignment.providerName,
        assignment.displayName,
        assignment.externalUserId,
      ]),
    ].some((value) => value?.toLowerCase().includes(normalizedSearch));
  });
  const total = filteredPeople.length;
  const start = (input.page - 1) * input.pageSize;
  const pageRows = filteredPeople.slice(start, start + input.pageSize);
  const sharedCount = allPeople.filter(
    (person) => person.clientCount > 1,
  ).length;

  return {
    summary: {
      globalSalespeople: globalCount?.value ?? 0,
      clientAssignments: assignmentCount?.value ?? 0,
      sharedSalespeople: sharedCount,
    },
    people: pageRows,
    targetOptions: allPeople.map((person) => ({
      id: person.id,
      name: person.name,
      clientCount: person.clientCount,
      clientNames: [
        ...new Set(
          person.assignments.map((assignment) => assignment.clientName),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    isTruncated,
  };
}

export async function updateGlobalSalesperson(input: {
  globalSalespersonId: string;
  displayName: string;
}) {
  const rows = await db
    .update(globalSalespeople)
    .set({
      displayName: normalizedOptionalName(input.displayName),
      updatedAt: new Date(),
    })
    .where(eq(globalSalespeople.id, input.globalSalespersonId))
    .returning({ id: globalSalespeople.id });
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
  return { success: true as const };
}

export async function linkSalespersonToGlobal(input: {
  salespersonId: string;
  targetGlobalSalespersonId: string;
}) {
  return db.transaction(async (tx) => {
    const [[source], [target]] = await Promise.all([
      tx
        .select({
          externalUserId: salespeople.externalUserId,
          globalSalespersonId: globalSalespersonIdentities.globalSalespersonId,
          globalDisplayName: globalSalespeople.displayName,
        })
        .from(salespeople)
        .innerJoin(
          globalSalespersonIdentities,
          and(
            eq(globalSalespersonIdentities.provider, "ghl"),
            eq(
              globalSalespersonIdentities.externalUserId,
              salespeople.externalUserId,
            ),
          ),
        )
        .innerJoin(
          globalSalespeople,
          eq(
            globalSalespersonIdentities.globalSalespersonId,
            globalSalespeople.id,
          ),
        )
        .where(eq(salespeople.id, input.salespersonId))
        .limit(1),
      tx
        .select({
          id: globalSalespeople.id,
          displayName: globalSalespeople.displayName,
        })
        .from(globalSalespeople)
        .where(eq(globalSalespeople.id, input.targetGlobalSalespersonId))
        .limit(1),
    ]);
    if (!source || !target) throw new TRPCError({ code: "NOT_FOUND" });
    if (source.globalSalespersonId === target.id) {
      return { success: true as const };
    }

    await tx
      .update(globalSalespersonIdentities)
      .set({
        globalSalespersonId: target.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(globalSalespersonIdentities.provider, "ghl"),
          eq(globalSalespersonIdentities.externalUserId, source.externalUserId),
        ),
      );

    const [remainingSourceIdentity] = await tx
      .select({
        externalUserId: globalSalespersonIdentities.externalUserId,
      })
      .from(globalSalespersonIdentities)
      .where(
        eq(
          globalSalespersonIdentities.globalSalespersonId,
          source.globalSalespersonId,
        ),
      )
      .limit(1);
    if (!remainingSourceIdentity) {
      if (
        target.displayName &&
        source.globalDisplayName &&
        target.displayName !== source.globalDisplayName
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Both global salespeople have display names. Clear one name before linking them.",
        });
      }
      if (!target.displayName && source.globalDisplayName) {
        await tx
          .update(globalSalespeople)
          .set({
            displayName: source.globalDisplayName,
            updatedAt: new Date(),
          })
          .where(eq(globalSalespeople.id, target.id));
      }
      await tx
        .delete(globalSalespeople)
        .where(eq(globalSalespeople.id, source.globalSalespersonId));
    }

    return { success: true as const };
  });
}

export async function separateSalespersonIdentity(input: {
  salespersonId: string;
}) {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        externalUserId: salespeople.externalUserId,
        globalSalespersonId: globalSalespersonIdentities.globalSalespersonId,
      })
      .from(salespeople)
      .innerJoin(
        globalSalespersonIdentities,
        and(
          eq(globalSalespersonIdentities.provider, "ghl"),
          eq(
            globalSalespersonIdentities.externalUserId,
            salespeople.externalUserId,
          ),
        ),
      )
      .where(eq(salespeople.id, input.salespersonId))
      .limit(1);
    if (!source) throw new TRPCError({ code: "NOT_FOUND" });

    const identityRows = await tx
      .select({ externalUserId: globalSalespersonIdentities.externalUserId })
      .from(globalSalespersonIdentities)
      .where(
        eq(
          globalSalespersonIdentities.globalSalespersonId,
          source.globalSalespersonId,
        ),
      )
      .limit(2);
    if (identityRows.length < 2) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This GHL identity is already a separate global salesperson",
      });
    }

    const [created] = await tx
      .insert(globalSalespeople)
      .values({})
      .returning({ id: globalSalespeople.id });
    if (!created) throw new Error("Global salesperson insert returned no row");
    await tx
      .update(globalSalespersonIdentities)
      .set({
        globalSalespersonId: created.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(globalSalespersonIdentities.provider, "ghl"),
          eq(globalSalespersonIdentities.externalUserId, source.externalUserId),
        ),
      );
    return { globalSalespersonId: created.id };
  });
}
