import { z } from "zod";

export const DEFAULT_CAMPAIGN_AVERAGE_DAYS = 3;
export const MAX_CAMPAIGN_AVERAGE_DAYS = 3_650;

export const campaignAverageDaysSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_CAMPAIGN_AVERAGE_DAYS);

export function parseCampaignAverageDays(value: unknown): number {
  return (
    campaignAverageDaysSchema.safeParse(value).data ??
    DEFAULT_CAMPAIGN_AVERAGE_DAYS
  );
}
