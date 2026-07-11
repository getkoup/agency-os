import { z } from "zod";

const dashboardPageSearchSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  clientId: z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
  platform: z.string().trim().min(1).optional(),
  campaignId: z.string().uuid().optional(),
  performancePage: z.coerce.number().int().positive().default(1),
  leadPage: z.coerce.number().int().positive().default(1),
});

export interface DashboardPageSearch {
  from: string;
  to: string;
  clientId?: string;
  platform?: string;
  campaignId?: string;
  performancePage: number;
  leadPage: number;
}

export function resolveDashboardPageSearch(
  search: Record<string, string | string[] | undefined>,
  now = new Date(),
): DashboardPageSearch {
  const today = now.toISOString().slice(0, 10);
  const fromDate = new Date(`${today}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 6);
  const parsed = dashboardPageSearchSchema.parse({
    ...search,
    from: search.from ?? fromDate.toISOString().slice(0, 10),
    to: search.to ?? today,
  });
  if (!parsed.from || !parsed.to || parsed.from > parsed.to) {
    throw new Error("Invalid dashboard date range");
  }
  return { ...parsed, from: parsed.from, to: parsed.to };
}
