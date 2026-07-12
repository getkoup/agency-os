import { z } from "zod";

const dashboardFilterFields = z.object({
  from: z.string().date(),
  to: z.string().date(),
  clientId: z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
  platform: z.string().trim().min(1).optional(),
  campaignId: z.string().uuid().optional(),
});

const validDateRange = (value: { from: string; to: string }) => {
  if (value.from > value.to) return false;
  const from = Date.parse(`${value.from}T00:00:00.000Z`);
  const to = Date.parse(`${value.to}T00:00:00.000Z`);
  return (to - from) / 86_400_000 + 1 <= 366;
};
const dateRangeIssue = {
  message: "The date range must be ordered and no longer than 366 days",
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
