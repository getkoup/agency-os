import "server-only";

import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  eq,
  exists,
  gte,
  ilike,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { type z } from "zod";

import type {
  listAssignmentsSchema,
  updateAssignmentSchema,
} from "~/features/assignments/schemas";
import {
  assignmentClients,
  assignmentReviewFlags,
  assignments,
  assignmentStatusDefinitions,
  assignmentTagLinks,
  assignmentTags,
} from "~/features/assignments/server/schema";
import { db } from "~/server/db";

type ListInput = z.infer<typeof listAssignmentsSchema>;
type UpdateInput = z.infer<typeof updateAssignmentSchema>;

export async function listAssignments(input: ListInput) {
  const filters: SQL[] = [];
  if (input.search) {
    const term = `%${input.search}%`;
    const searchFilter = or(
      ilike(assignments.videoName, term),
      ilike(assignments.clientName, term),
      ilike(assignments.rawFilesUrl, term),
      ilike(assignments.finalFileUrl, term),
      ilike(assignmentStatusDefinitions.name, term),
      sql`${assignments.status}::text ilike ${term}`,
      sql`${assignments.uploadStatus}::text ilike ${term}`,
      sql`${assignments.dateAssigned}::text ilike ${term}`,
      exists(
        db
          .select({ value: assignmentTagLinks.assignmentId })
          .from(assignmentTagLinks)
          .innerJoin(
            assignmentTags,
            eq(assignmentTags.id, assignmentTagLinks.tagId),
          )
          .where(
            and(
              eq(assignmentTagLinks.assignmentId, assignments.id),
              ilike(assignmentTags.name, term),
            ),
          ),
      ),
    );
    if (searchFilter) filters.push(searchFilter);
  }
  if (input.statusDefinitionId) {
    filters.push(eq(assignments.statusDefinitionId, input.statusDefinitionId));
  }
  if (input.uploadStatus) {
    filters.push(eq(assignments.uploadStatus, input.uploadStatus));
  }
  if (input.client) filters.push(eq(assignments.clientName, input.client));
  if (input.reviewOnly) {
    filters.push(
      exists(
        db
          .select({ value: assignmentReviewFlags.assignmentId })
          .from(assignmentReviewFlags)
          .where(eq(assignmentReviewFlags.assignmentId, assignments.id)),
      ),
    );
  }
  if (input.tagId) {
    filters.push(
      exists(
        db
          .select({ value: assignmentTagLinks.assignmentId })
          .from(assignmentTagLinks)
          .where(
            and(
              eq(assignmentTagLinks.assignmentId, assignments.id),
              eq(assignmentTagLinks.tagId, input.tagId),
            ),
          ),
      ),
    );
  }

  const where = filters.length ? and(...filters) : undefined;
  const direction = input.direction === "asc" ? sql`asc` : sql`desc`;
  const sortExpressions: Record<ListInput["sort"], SQL> = {
    updated: sql`${assignments.updatedAt} ${direction} nulls last`,
    dateAssigned: sql`${assignments.dateAssigned} ${direction} nulls last`,
    videoName: sql`regexp_replace(lower(${assignments.videoName}), '[0-9]+$', '') ${direction}, nullif(substring(${assignments.videoName} from '([0-9]+)$'), '')::integer ${direction} nulls last, lower(${assignments.videoName}) ${direction}`,
    clientName: sql`lower(${assignments.clientName}) ${direction} nulls last`,
    status: sql`lower(coalesce(${assignmentStatusDefinitions.name}, ${assignments.status}::text)) ${direction} nulls last`,
    uploadStatus: sql`${assignments.uploadStatus}::text ${direction} nulls last`,
    files: sql`(case when ${assignments.finalFileUrl} is not null then 2 when ${assignments.rawFilesUrl} is not null then 1 else 0 end) ${direction}`,
  };
  const assignmentTagsJson = sql<
    Array<{ id: string; name: string; color: string }>
  >`coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', ${assignmentTags.id},
          'name', ${assignmentTags.name},
          'color', ${assignmentTags.color}
        )
        order by lower(${assignmentTags.name}), ${assignmentTags.id}
      )
      from ${assignmentTagLinks}
      inner join ${assignmentTags}
        on ${assignmentTags.id} = ${assignmentTagLinks.tagId}
      where ${assignmentTagLinks.assignmentId} = ${assignments.id}
    ),
    '[]'::jsonb
  )`;

  const rowsWithTotal = await db
    .select({
      id: assignments.id,
      videoName: assignments.videoName,
      clientName: assignments.clientName,
      status: assignments.status,
      statusDefinitionId: assignments.statusDefinitionId,
      statusName: assignmentStatusDefinitions.name,
      statusColor: assignmentStatusDefinitions.color,
      uploadStatus: assignments.uploadStatus,
      dateAssigned: assignments.dateAssigned,
      rawFilesUrl: assignments.rawFilesUrl,
      finalFileUrl: assignments.finalFileUrl,
      notionPageUrl: assignments.notionPageUrl,
      updatedAt: assignments.updatedAt,
      tags: assignmentTagsJson,
      total: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(assignments)
    .leftJoin(
      assignmentStatusDefinitions,
      eq(assignments.statusDefinitionId, assignmentStatusDefinitions.id),
    )
    .where(where)
    .orderBy(sortExpressions[input.sort], sql`${assignments.id} desc`)
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  let total = rowsWithTotal[0]?.total ?? 0;
  if (!rowsWithTotal.length && input.page > 1) {
    const [fallbackTotal] = await db
      .select({ value: count() })
      .from(assignments)
      .leftJoin(
        assignmentStatusDefinitions,
        eq(assignments.statusDefinitionId, assignmentStatusDefinitions.id),
      )
      .where(where);
    total = fallbackTotal?.value ?? 0;
  }

  return {
    rows: rowsWithTotal.map(({ total: _total, ...row }) => row),
    total,
  };
}

export async function getAssignmentOptions() {
  const [statusRows, tagRows, clientRows] = await Promise.all([
    db
      .select({
        id: assignmentStatusDefinitions.id,
        name: assignmentStatusDefinitions.name,
        color: assignmentStatusDefinitions.color,
      })
      .from(assignmentStatusDefinitions)
      .where(eq(assignmentStatusDefinitions.isActive, true))
      .orderBy(asc(assignmentStatusDefinitions.position)),
    db
      .select({
        id: assignmentTags.id,
        name: assignmentTags.name,
        color: assignmentTags.color,
      })
      .from(assignmentTags)
      .orderBy(asc(assignmentTags.name)),
    db
      .select({ value: assignmentClients.canonicalName })
      .from(assignmentClients)
      .where(eq(assignmentClients.isHidden, false))
      .orderBy(asc(assignmentClients.canonicalName)),
  ]);

  return {
    statuses: statusRows,
    tags: tagRows,
    clients: clientRows.map(({ value }) => value),
  };
}

export async function updateAssignment(input: UpdateInput, userId: string) {
  const { id, expectedUpdatedAt, tagIds, ...changes } = input;
  const clientWasChanged = Object.prototype.hasOwnProperty.call(
    changes,
    "clientName",
  );
  // JavaScript drops PostgreSQL's sub-millisecond precision during the UI round trip.
  const expectedUpdatedAtDate = new Date(expectedUpdatedAt);
  const expectedUpdatedAtUpperBound = new Date(
    expectedUpdatedAtDate.getTime() + 1,
  );

  return db.transaction(async (tx) => {
    const [client] =
      clientWasChanged && changes.clientName
        ? await tx
            .select({ id: assignmentClients.id })
            .from(assignmentClients)
            .where(
              and(
                eq(assignmentClients.canonicalName, changes.clientName),
                eq(assignmentClients.isHidden, false),
              ),
            )
            .limit(1)
        : [];
    if (clientWasChanged && changes.clientName && !client) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Select a valid assignment client",
      });
    }

    const updatedAt = new Date();
    const [updated] = await tx
      .update(assignments)
      .set({
        ...changes,
        ...(clientWasChanged ? { clientId: client?.id ?? null } : {}),
        updatedByUserId: userId,
        locallyEditedAt: updatedAt,
        updatedAt,
      })
      .where(
        and(
          eq(assignments.id, id),
          gte(assignments.updatedAt, expectedUpdatedAtDate),
          lt(assignments.updatedAt, expectedUpdatedAtUpperBound),
        ),
      )
      .returning({ id: assignments.id });

    if (!updated) {
      const [existing] = await tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(eq(assignments.id, id))
        .limit(1);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Assignment no longer exists",
        });
      }
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This assignment changed after you opened it. Refresh and try again.",
      });
    }

    if (tagIds) {
      await tx
        .delete(assignmentTagLinks)
        .where(eq(assignmentTagLinks.assignmentId, id));
      if (tagIds.length) {
        await tx.insert(assignmentTagLinks).values(
          tagIds.map((tagId) => ({
            assignmentId: id,
            tagId,
          })),
        );
      }
    }

    return { id: updated.id, updatedAt };
  });
}
