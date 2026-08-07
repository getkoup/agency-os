import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import {
  getAssignmentOptions,
  listAssignments,
  updateAssignment,
} from "~/features/assignments/server/service";
import {
  assignmentClients,
  assignments,
  assignmentStatusDefinitions,
  assignmentTagLinks,
  assignmentTags,
} from "~/features/assignments/server/schema";
import { db } from "~/server/db";

const assignmentId = "10000000-0000-4000-8000-000000000001";
const clientId = "10000000-0000-4000-8000-000000000002";
const statusId = "10000000-0000-4000-8000-000000000003";
const firstTagId = "10000000-0000-4000-8000-000000000004";
const secondTagId = "10000000-0000-4000-8000-000000000005";
const initialUpdatedAt = new Date("2026-08-07T12:00:00.000Z");

async function createAssignmentTestTables() {
  const statements = [
    `create schema if not exists assignment_dashboard`,
    `create table if not exists assignment_dashboard.client (
      id uuid primary key,
      canonical_name varchar(255) not null,
      normalized_key varchar(255) not null,
      is_hidden boolean not null default false
    )`,
    `create table if not exists assignment_dashboard.status_definition (
      id uuid primary key,
      name varchar(80) not null,
      slug varchar(80) not null,
      color varchar(20) not null,
      position integer not null,
      is_active boolean not null default true
    )`,
    `create table if not exists assignment_dashboard.tag (
      id uuid primary key,
      name varchar(80) not null,
      color varchar(20) not null
    )`,
    `create table if not exists assignment_dashboard.assignment (
      id uuid primary key,
      video_name varchar(500) not null,
      client_name varchar(255),
      client_id uuid,
      assignee_label varchar(255),
      priority integer,
      status text not null,
      status_definition_id uuid,
      upload_status text not null,
      date_assigned date,
      raw_files_url text,
      final_file_url text,
      notion_page_url text,
      notes text,
      locally_edited_at timestamptz,
      created_by_user_id varchar(255) not null,
      updated_by_user_id varchar(255) not null,
      updated_at timestamptz not null,
      created_at timestamptz not null
    )`,
    `create table if not exists assignment_dashboard.assignment_tag (
      assignment_id uuid not null,
      tag_id uuid not null,
      primary key (assignment_id, tag_id)
    )`,
    `create table if not exists assignment_dashboard.assignment_review_flag (
      assignment_id uuid not null
    )`,
  ];
  for (const statement of statements) await db.execute(sql.raw(statement));
}

async function removeFixtures() {
  await db
    .delete(assignmentTagLinks)
    .where(eq(assignmentTagLinks.assignmentId, assignmentId));
  await db.delete(assignments).where(eq(assignments.id, assignmentId));
  await db
    .delete(assignmentTags)
    .where(inArray(assignmentTags.id, [firstTagId, secondTagId]));
  await db
    .delete(assignmentStatusDefinitions)
    .where(eq(assignmentStatusDefinitions.id, statusId));
  await db.delete(assignmentClients).where(eq(assignmentClients.id, clientId));
}

beforeAll(createAssignmentTestTables);

beforeEach(async () => {
  await removeFixtures();
  await db.insert(assignmentClients).values({
    id: clientId,
    canonicalName: "Shared Assignment Client",
    normalizedKey: "sharedassignmentclient",
    isHidden: false,
  });
  await db.insert(assignmentStatusDefinitions).values({
    id: statusId,
    name: "In review",
    slug: "in-review-test",
    color: "amber",
    position: 10,
    isActive: true,
  });
  await db.insert(assignmentTags).values([
    { id: firstTagId, name: "Paid social", color: "blue" },
    { id: secondTagId, name: "Priority client", color: "red" },
  ]);
  await db.insert(assignments).values({
    id: assignmentId,
    videoName: "Shared assignment test",
    clientName: "Shared Assignment Client",
    clientId,
    assigneeLabel: "Maya",
    priority: 2,
    status: "review",
    statusDefinitionId: statusId,
    uploadStatus: "raw_uploaded",
    dateAssigned: "2026-08-07",
    rawFilesUrl: "https://example.com/raw",
    finalFileUrl: null,
    notionPageUrl: "https://notion.so/shared-test",
    notes: "Initial notes",
    locallyEditedAt: null,
    createdByUserId: "fixture-user",
    updatedByUserId: "fixture-user",
    updatedAt: initialUpdatedAt,
    createdAt: initialUpdatedAt,
  });
  await db.insert(assignmentTagLinks).values({
    assignmentId,
    tagId: firstTagId,
  });
});

afterAll(removeFixtures);

describe("shared assignment data module", () => {
  it("lists shared assignment rows with status and tags", async () => {
    const result = await listAssignments({
      page: 1,
      pageSize: 25,
      search: "Shared assignment test",
      reviewOnly: false,
      sort: "updated",
      direction: "desc",
    });

    expect(result).toMatchObject({
      total: 1,
      rows: [
        {
          id: assignmentId,
          clientName: "Shared Assignment Client",
          assigneeLabel: "Maya",
          statusName: "In review",
          tags: [{ id: firstTagId, name: "Paid social", color: "blue" }],
        },
      ],
    });
  });

  it("returns assignment-owned filter options", async () => {
    const options = await getAssignmentOptions();

    expect(options.statuses).toContainEqual({
      id: statusId,
      name: "In review",
      color: "amber",
    });
    expect(options.clients).toContain("Shared Assignment Client");
    expect(options.assignees).toContain("Maya");
  });

  it("updates the shared row, audit fields, and tags", async () => {
    const result = await updateAssignment(
      {
        id: assignmentId,
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        assigneeLabel: "Jordan",
        notes: "Updated from Agency OS",
        tagIds: [secondTagId],
      },
      "agency-manager",
    );

    const [row] = await db
      .select({
        assigneeLabel: assignments.assigneeLabel,
        notes: assignments.notes,
        locallyEditedAt: assignments.locallyEditedAt,
        updatedByUserId: assignments.updatedByUserId,
      })
      .from(assignments)
      .where(eq(assignments.id, assignmentId));
    const links = await db
      .select({ tagId: assignmentTagLinks.tagId })
      .from(assignmentTagLinks)
      .where(eq(assignmentTagLinks.assignmentId, assignmentId));

    expect(row).toMatchObject({
      assigneeLabel: "Jordan",
      notes: "Updated from Agency OS",
      updatedByUserId: "agency-manager",
    });
    expect(row?.locallyEditedAt).toEqual(result.updatedAt);
    expect(links).toEqual([{ tagId: secondTagId }]);
  });

  it("rejects stale writes instead of overwriting another app", async () => {
    await updateAssignment(
      {
        id: assignmentId,
        expectedUpdatedAt: initialUpdatedAt.toISOString(),
        notes: "Concurrent update",
      },
      "other-app-user",
    );

    await expect(
      updateAssignment(
        {
          id: assignmentId,
          expectedUpdatedAt: initialUpdatedAt.toISOString(),
          notes: "Stale overwrite",
        },
        "agency-manager",
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
