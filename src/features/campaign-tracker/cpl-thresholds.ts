import { z } from "zod";

import {
  formatUsdCents,
  parseUsdToCents,
} from "~/features/revenue/calculations";

export const DEFAULT_CAMPAIGN_CPL_THRESHOLDS = {
  warningThreshold: "15.00",
  criticalThreshold: "25.00",
} as const;

const MAX_CPL_THRESHOLD_CENTS = 100_000_000n;
const USD_VALUE_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const thresholdValueSchema = z
  .string()
  .trim()
  .regex(USD_VALUE_PATTERN, "Use a non-negative USD value");

export const campaignCplThresholdsSchema = z
  .object({
    warningThreshold: thresholdValueSchema,
    criticalThreshold: thresholdValueSchema,
  })
  .superRefine((thresholds, context) => {
    if (
      !USD_VALUE_PATTERN.test(thresholds.warningThreshold) ||
      !USD_VALUE_PATTERN.test(thresholds.criticalThreshold)
    ) {
      return;
    }
    const warningCents = parseUsdToCents(thresholds.warningThreshold);
    const criticalCents = parseUsdToCents(thresholds.criticalThreshold);
    if (warningCents > MAX_CPL_THRESHOLD_CENTS) {
      context.addIssue({
        code: "custom",
        path: ["warningThreshold"],
        message: "Warning threshold cannot exceed $1,000,000",
      });
    }
    if (criticalCents > MAX_CPL_THRESHOLD_CENTS) {
      context.addIssue({
        code: "custom",
        path: ["criticalThreshold"],
        message: "Critical threshold cannot exceed $1,000,000",
      });
    }
    if (criticalCents <= warningCents) {
      context.addIssue({
        code: "custom",
        path: ["criticalThreshold"],
        message: "Critical threshold must be greater than warning threshold",
      });
    }
  })
  .transform((thresholds) => ({
    warningThreshold: formatUsdCents(
      parseUsdToCents(thresholds.warningThreshold),
    ),
    criticalThreshold: formatUsdCents(
      parseUsdToCents(thresholds.criticalThreshold),
    ),
  }));

export type CampaignCplThresholds = z.output<
  typeof campaignCplThresholdsSchema
>;

export function formatCplThresholdLabel(value: string): string {
  return `$${formatUsdCents(parseUsdToCents(value)).replace(/\.00$/, "")}`;
}
