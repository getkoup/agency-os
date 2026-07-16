export interface RevenueRuleInput {
  id: string;
  tagName: string;
  revenueValue: string;
  serviceName: string | null;
  status: "active" | "inactive";
}

export interface OpportunityRevenue {
  revenueValue: string;
  matchedRuleIds: string[];
  matchedServices: string[];
  matchedTags: string[];
  status: "matched" | "missing";
}

export function normalizeRevenueTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function parseUsdToCents(value: string): bigint {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match?.[1]) throw new Error("USD value must be a non-negative decimal");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(match[1]) * 100n + BigInt(fraction || "0");
}

export function formatUsdCents(cents: bigint): string {
  if (cents < 0n) throw new Error("USD cents cannot be negative");
  const dollars = cents / 100n;
  const remainder = (cents % 100n).toString().padStart(2, "0");
  return `${dollars}.${remainder}`;
}

export function calculateOpportunityRevenue(input: {
  tags: readonly string[];
  rules: readonly RevenueRuleInput[];
}): OpportunityRevenue {
  const distinctTags = new Map<string, string>();
  for (const tag of input.tags) {
    const normalized = normalizeRevenueTag(tag);
    if (normalized && !distinctTags.has(normalized)) {
      distinctTags.set(normalized, normalized);
    }
  }

  const activeRules = new Map<string, RevenueRuleInput>();
  for (const rule of input.rules) {
    if (rule.status !== "active") continue;
    const normalized = normalizeRevenueTag(rule.tagName);
    if (normalized && !activeRules.has(normalized)) {
      activeRules.set(normalized, rule);
    }
  }

  let revenueCents = 0n;
  const matchedRuleIds: string[] = [];
  const matchedServices = new Set<string>();
  const matchedTags: string[] = [];
  for (const tag of distinctTags.keys()) {
    const rule = activeRules.get(tag);
    if (!rule) continue;
    revenueCents += parseUsdToCents(rule.revenueValue);
    matchedRuleIds.push(rule.id);
    matchedTags.push(tag);
    const serviceName = rule.serviceName?.trim();
    if (serviceName) matchedServices.add(serviceName);
  }

  return {
    revenueValue: formatUsdCents(revenueCents),
    matchedRuleIds,
    matchedServices: [...matchedServices],
    matchedTags,
    status: matchedRuleIds.length > 0 ? "matched" : "missing",
  };
}
