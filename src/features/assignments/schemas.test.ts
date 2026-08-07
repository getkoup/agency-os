import { describe, expect, it } from "vitest";

import {
  listAssignmentsSchema,
  updateAssignmentSchema,
} from "~/features/assignments/schemas";

const assignmentId = "536cb6e5-d7f5-4f77-b1a7-55fd75a6250b";

describe("assignment contracts", () => {
  it("accepts bounded list filters and sorting", () => {
    expect(
      listAssignmentsSchema.parse({
        page: 2,
        pageSize: 25,
        search: " launch ",
        reviewOnly: true,
        sort: "clientName",
        direction: "asc",
      }),
    ).toMatchObject({
      page: 2,
      search: "launch",
      reviewOnly: true,
      sort: "clientName",
    });
    expect(() =>
      listAssignmentsSchema.parse({ page: 1, pageSize: 101 }),
    ).toThrow();
  });

  it("accepts partial edits with HTTP links", () => {
    expect(
      updateAssignmentSchema.parse({
        id: assignmentId,
        expectedUpdatedAt: "2026-08-07T12:00:00.000Z",
        notes: "Updated",
        rawFilesUrl: "https://example.com/raw",
      }),
    ).toMatchObject({ notes: "Updated" });
  });

  it("rejects unsafe file protocols", () => {
    expect(() =>
      updateAssignmentSchema.parse({
        id: assignmentId,
        expectedUpdatedAt: "2026-08-07T12:00:00.000Z",
        finalFileUrl: "javascript:alert(1)",
      }),
    ).toThrow();
  });
});
