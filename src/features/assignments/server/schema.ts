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
  canonicalName: d.varchar({ length: 255 }).notNull(),
  normalizedKey: d.varchar({ length: 255 }).notNull(),
  isHidden: d.boolean().notNull(),
}));

export const assignmentStatusDefinitions = assignmentDashboard.table(
  "status_definition",
  (d) => ({
    id: d.uuid().primaryKey(),
    name: d.varchar({ length: 80 }).notNull(),
    slug: d.varchar({ length: 80 }).notNull(),
    color: d.varchar({ length: 20 }).notNull(),
    position: d.integer().notNull(),
    isActive: d.boolean().notNull(),
  }),
);

export const assignmentTags = assignmentDashboard.table("tag", (d) => ({
  id: d.uuid().primaryKey(),
  name: d.varchar({ length: 80 }).notNull(),
  color: d.varchar({ length: 20 }).notNull(),
}));

export const assignments = assignmentDashboard.table("assignment", (d) => ({
  id: d.uuid().primaryKey(),
  videoName: d.varchar({ length: 500 }).notNull(),
  clientName: d.varchar({ length: 255 }),
  clientId: d.uuid(),
  assigneeLabel: d.varchar({ length: 255 }),
  priority: d.integer(),
  status: assignmentStatus().notNull(),
  statusDefinitionId: d.uuid(),
  uploadStatus: assignmentUploadStatus().notNull(),
  dateAssigned: d.date(),
  rawFilesUrl: d.text(),
  finalFileUrl: d.text(),
  notionPageUrl: d.text(),
  notes: d.text(),
  locallyEditedAt: d.timestamp({ withTimezone: true }),
  createdByUserId: d.varchar({ length: 255 }).notNull(),
  updatedByUserId: d.varchar({ length: 255 }).notNull(),
  updatedAt: d.timestamp({ withTimezone: true }).notNull(),
  createdAt: d.timestamp({ withTimezone: true }).notNull(),
}));

export const assignmentTagLinks = assignmentDashboard.table(
  "assignment_tag",
  (d) => ({
    assignmentId: d.uuid().notNull(),
    tagId: d.uuid().notNull(),
  }),
);

export const assignmentReviewFlags = assignmentDashboard.table(
  "assignment_review_flag",
  (d) => ({
    assignmentId: d.uuid().notNull(),
  }),
);
