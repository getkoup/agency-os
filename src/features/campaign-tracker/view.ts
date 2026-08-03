import { z } from "zod";

export const campaignTrackerViewSchema = z.enum(["grouped", "table"]);
export type CampaignTrackerView = z.infer<typeof campaignTrackerViewSchema>;

export function campaignTrackerViewHref(input: {
  date: string;
  view: CampaignTrackerView;
}): string {
  const search = new URLSearchParams({ date: input.date });
  if (input.view !== "grouped") search.set("view", input.view);
  return `/dashboard/campaign-tracker?${search.toString()}`;
}
