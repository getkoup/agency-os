import { z } from "zod";

const dashboardFilterFields = z.object({
  from: z.string().date(),
  to: z.string().date(),
  clientId: z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
  platform: z.string().trim().min(1).optional(),
  campaignId: z.string().uuid().optional(),
});

const validDateRange = (value: { from: string; to: string }) =>
  value.from <= value.to;
const dateRangeIssue = {
  message: "The start date must not be after the end date",
  path: ["from"],
};

export const dashboardFiltersSchema = dashboardFilterFields.refine(
  validDateRange,
  dateRangeIssue,
);
export const dashboardListInputSchema = dashboardFilterFields
  .extend({
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().positive().max(100).default(50),
  })
  .refine(validDateRange, dateRangeIssue);
export const filterOptionsInputSchema = dashboardFilterFields
  .omit({ campaignId: true })
  .refine(validDateRange, dateRangeIssue);

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
