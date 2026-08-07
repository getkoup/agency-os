import { z } from "zod";

export const assignmentStatuses = [
  "unknown",
  "backlog",
  "in_progress",
  "review",
  "done",
  "blocked",
] as const;

export const assignmentUploadStatuses = [
  "unknown",
  "not_uploaded",
  "raw_uploaded",
  "final_uploaded",
] as const;

const nullableHttpUrl = z
  .union([
    z
      .string()
      .url()
      .refine(
        (value) => value.startsWith("http://") || value.startsWith("https://"),
      ),
    z.literal(""),
  ])
  .nullable()
  .transform((value) => (value === "" ? null : value));

export const updateAssignmentSchema = z
  .object({
    videoName: z.string().trim().min(1).max(500),
    clientName: z.string().trim().max(255).nullable(),
    assigneeLabel: z.string().trim().max(255).nullable(),
    priority: z.number().int().min(1).max(10).nullable(),
    status: z.enum(assignmentStatuses),
    statusDefinitionId: z.string().uuid().nullable(),
    uploadStatus: z.enum(assignmentUploadStatuses),
    dateAssigned: z.string().date().nullable(),
    rawFilesUrl: nullableHttpUrl,
    finalFileUrl: nullableHttpUrl,
    notes: z.string().max(10_000).nullable(),
    tagIds: z.array(z.string().uuid()).max(20),
  })
  .partial()
  .extend({
    id: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime(),
  });

export const listAssignmentsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  statusDefinitionId: z.string().uuid().optional(),
  uploadStatus: z.enum(assignmentUploadStatuses).optional(),
  assignee: z.string().max(255).optional(),
  client: z.string().max(255).optional(),
  tagId: z.string().uuid().optional(),
  reviewOnly: z.boolean().default(false),
  sort: z
    .enum([
      "updated",
      "priority",
      "dateAssigned",
      "videoName",
      "clientName",
      "assignee",
      "status",
      "uploadStatus",
      "notes",
      "files",
    ])
    .default("updated"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
