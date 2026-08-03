import { type CampaignCplThresholds } from "~/features/campaign-tracker/cpl-thresholds";

export function getCplHighlightClass(
  cpl: string | null,
  thresholds: CampaignCplThresholds,
): string {
  if (cpl === null) return "";
  const value = Number(cpl);
  if (!Number.isFinite(value)) return "";
  if (value > Number(thresholds.criticalThreshold)) return "bg-red-500/40";
  if (value > Number(thresholds.warningThreshold)) return "bg-orange-500/40";
  return "";
}
