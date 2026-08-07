import { pgSchema } from "drizzle-orm/pg-core";

export const assignmentDashboard = pgSchema("assignment_dashboard");

export const assignmentStatus = assignmentDashboard.enum("assignment_status", [
  "unknown",
  "backlog",
  "in_progress",
  "review",
  "done",
  "blocked",
]);

export const assignmentUploadStatus = assignmentDashboard.enum(
  "upload_status",
  ["unknown", "not_uploaded", "raw_uploaded", "final_uploaded"],
);

export const assignmentClients = assignmentDashboard.table("client", (d) => ({
  id: d.uuid().primaryKey(),
  canonicalName: d.varchar("canonical_name", { length: 255 }).notNull(),
  normalizedKey: d.varchar("normalized_key", { length: 255 }).notNull(),
  isHidden: d.boolean("is_hidden").notNull(),
}));

export const assignmentStatusDefinitions = assignmentDashboard.table(
  "status_definition",
  (d) => ({
    id: d.uuid().primaryKey(),
    name: d.varchar({ length: 80 }).notNull(),
    slug: d.varchar({ length: 80 }).notNull(),
    color: d.varchar({ length: 20 }).notNull(),
    position: d.integer().notNull(),
    isActive: d.boolean("is_active").notNull(),
  }),
);

export const assignmentTags = assignmentDashboard.table("tag", (d) => ({
  id: d.uuid().primaryKey(),
  name: d.varchar({ length: 80 }).notNull(),
  color: d.varchar({ length: 20 }).notNull(),
}));

export const assignments = assignmentDashboard.table("assignment", (d) => ({
  id: d.uuid().primaryKey(),
  videoName: d.varchar("video_name", { length: 500 }).notNull(),
  clientName: d.varchar("client_name", { length: 255 }),
  clientId: d.uuid("client_id"),
  assigneeLabel: d.varchar("assignee_label", { length: 255 }),
  priority: d.integer(),
  status: assignmentStatus().notNull(),
  statusDefinitionId: d.uuid("status_definition_id"),
  uploadStatus: assignmentUploadStatus("upload_status").notNull(),
  dateAssigned: d.date("date_assigned"),
  rawFilesUrl: d.text("raw_files_url"),
  finalFileUrl: d.text("final_file_url"),
  notionPageUrl: d.text("notion_page_url"),
  notes: d.text(),
  locallyEditedAt: d.timestamp("locally_edited_at", { withTimezone: true }),
  createdByUserId: d.varchar("created_by_user_id", { length: 255 }).notNull(),
  updatedByUserId: d.varchar("updated_by_user_id", { length: 255 }).notNull(),
  updatedAt: d.timestamp("updated_at", { withTimezone: true }).notNull(),
  createdAt: d.timestamp("created_at", { withTimezone: true }).notNull(),
}));

export const assignmentTagLinks = assignmentDashboard.table(
  "assignment_tag",
  (d) => ({
    assignmentId: d.uuid("assignment_id").notNull(),
    tagId: d.uuid("tag_id").notNull(),
  }),
);

export const assignmentReviewFlags = assignmentDashboard.table(
  "assignment_review_flag",
  (d) => ({
    assignmentId: d.uuid("assignment_id").notNull(),
  }),
);
