import { z } from "zod";

import { DEFAULT_CAMPAIGN_AVERAGE_DAYS } from "~/features/campaign-tracker/average-days";
export const campaignTrackerViewSchema = z.enum(["grouped", "table"]);
export type CampaignTrackerView = z.infer<typeof campaignTrackerViewSchema>;

export function campaignTrackerViewHref(input: {
  averageDays?: number;
  date: string;
  query?: string;
  view: CampaignTrackerView;
}): string {
  const search = new URLSearchParams({ date: input.date });
  const query = input.query?.trim();
  if (query) search.set("query", query);
  if (
    input.averageDays &&
    input.averageDays !== DEFAULT_CAMPAIGN_AVERAGE_DAYS
  ) {
    search.set("averageDays", String(input.averageDays));
  }
  if (input.view !== "grouped") search.set("view", input.view);
  return `/dashboard/campaign-tracker?${search.toString()}`;
}
