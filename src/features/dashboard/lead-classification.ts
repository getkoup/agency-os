export const UNCATEGORIZED_LEAD_CATEGORY = "Uncategorized";

export interface LeadClassificationRule {
  id: string;
  categoryName: string;
  keywords: readonly string[];
  matchMode: "any" | "all";
  priority: number;
}

export function normalizeCampaignText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsKeyword(campaign: string, keyword: string): boolean {
  const normalizedKeyword = normalizeCampaignText(keyword);
  if (!normalizedKeyword) return false;
  return ` ${campaign} `.includes(` ${normalizedKeyword} `);
}

function matchesRule(campaign: string, rule: LeadClassificationRule): boolean {
  const matches = rule.keywords.map((keyword) =>
    containsKeyword(campaign, keyword),
  );
  return rule.matchMode === "all"
    ? matches.length > 0 && matches.every(Boolean)
    : matches.some(Boolean);
}

export function classifyCampaign(
  campaignName: string | null,
  rules: readonly LeadClassificationRule[],
): string {
  if (!campaignName) return UNCATEGORIZED_LEAD_CATEGORY;
  const campaign = normalizeCampaignText(campaignName);
  if (!campaign) return UNCATEGORIZED_LEAD_CATEGORY;
  const orderedRules = [...rules].sort(
    (left, right) =>
      right.priority - left.priority ||
      left.categoryName.localeCompare(right.categoryName) ||
      left.id.localeCompare(right.id),
  );
  return (
    orderedRules.find((rule) => matchesRule(campaign, rule))?.categoryName ??
    UNCATEGORIZED_LEAD_CATEGORY
  );
}
