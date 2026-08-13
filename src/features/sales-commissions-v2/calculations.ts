import {
  formatUsdCents,
  parseUsdToCents,
} from "~/features/revenue/calculations";
import { normalizeAppointmentText } from "~/features/sales-commissions/calculations";

export type SalesCommissionV2Fields = {
  leadSource: string | null;
  category: string | null;
  service: string | null;
  price: string | null;
  car: string | null;
  depositStatus: string | null;
};

export type SalesCommissionV2ParseStatus =
  | "structured"
  | "legacy_description"
  | "missing_description"
  | "invalid_structure";

export type SalesCommissionV2MatchStatus =
  "matched" | "unmatched" | "ambiguous" | "not_applicable";

export type SalesCommissionV2ReviewReason =
  | "missing_description"
  | "legacy_description"
  | "duplicate_field"
  | "missing_category"
  | "missing_service"
  | "missing_price"
  | "invalid_price"
  | "unmatched_category"
  | "ambiguous_category"
  | "missing_salesperson"
  | "missing_commission_rate"
  | "past_unresolved_status";

export type SalesCommissionV2MappingRuleInput = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  field: "category" | "service";
  keywords: readonly string[];
  matchMode: "any" | "all";
  priority: number;
};

export type SalesCommissionV2ParsedDescription = {
  status: SalesCommissionV2ParseStatus;
  fields: SalesCommissionV2Fields;
  duplicateFields: readonly (keyof SalesCommissionV2Fields)[];
  reviewReasons: readonly SalesCommissionV2ReviewReason[];
};

export type SalesCommissionV2CategoryInput = {
  id: string;
  name: string;
  normalizedName: string;
};

const EMPTY_FIELDS: SalesCommissionV2Fields = {
  leadSource: null,
  category: null,
  service: null,
  price: null,
  car: null,
  depositStatus: null,
};

const FIELD_BY_NORMALIZED_LABEL: Readonly<
  Record<string, keyof SalesCommissionV2Fields>
> = {
  "lead source": "leadSource",
  category: "category",
  service: "service",
  price: "price",
  car: "car",
  "deposit status": "depositStatus",
};

const USD_TERM_PATTERN = "\\$(?:(?:\\d{1,3}(?:,\\d{3})+)|\\d+)(?:\\.\\d{1,2})?";
const USD_EXPRESSION_PATTERN = new RegExp(
  `^\\s*${USD_TERM_PATTERN}(?:\\s*\\+\\s*${USD_TERM_PATTERN})*\\s*$`,
);

export function parseSalesCommissionV2Price(
  price: string | null,
):
  | { status: "valid"; cents: bigint; formatted: string }
  | { status: "missing" | "invalid"; cents: null; formatted: null } {
  if (!price?.trim()) {
    return { status: "missing", cents: null, formatted: null };
  }
  if (!USD_EXPRESSION_PATTERN.test(price)) {
    return { status: "invalid", cents: null, formatted: null };
  }

  let cents = 0n;
  for (const term of price.split("+")) {
    cents += parseUsdToCents(term.trim().slice(1).replaceAll(",", ""));
  }
  return { status: "valid", cents, formatted: formatUsdCents(cents) };
}

export function parseSalesCommissionV2Description(
  description: string | null,
): SalesCommissionV2ParsedDescription {
  if (!description?.trim()) {
    return {
      status: "missing_description",
      fields: { ...EMPTY_FIELDS },
      duplicateFields: [],
      reviewReasons: ["missing_description"],
    };
  }

  const fields: SalesCommissionV2Fields = { ...EMPTY_FIELDS };
  const duplicateFields = new Set<keyof SalesCommissionV2Fields>();
  const seenFields = new Set<keyof SalesCommissionV2Fields>();
  let recognizedFieldCount = 0;

  for (const line of description.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;
    const field =
      FIELD_BY_NORMALIZED_LABEL[
        normalizeAppointmentText(line.slice(0, separatorIndex))
      ];
    if (!field) continue;

    recognizedFieldCount += 1;
    const value = line.slice(separatorIndex + 1).trim() || null;
    if (seenFields.has(field)) {
      duplicateFields.add(field);
      continue;
    }
    seenFields.add(field);
    fields[field] = value;
  }

  if (recognizedFieldCount === 0) {
    return {
      status: "legacy_description",
      fields,
      duplicateFields: [],
      reviewReasons: ["legacy_description"],
    };
  }

  const reviewReasons: SalesCommissionV2ReviewReason[] = [];
  if (duplicateFields.size > 0) reviewReasons.push("duplicate_field");
  if (!fields.category) reviewReasons.push("missing_category");
  if (!fields.service) reviewReasons.push("missing_service");
  if (!fields.price) {
    reviewReasons.push("missing_price");
  } else if (parseSalesCommissionV2Price(fields.price).status === "invalid") {
    reviewReasons.push("invalid_price");
  }

  return {
    status: reviewReasons.length === 0 ? "structured" : "invalid_structure",
    fields,
    duplicateFields: [...duplicateFields],
    reviewReasons,
  };
}

export type SalesCommissionV2CategoryMatch = {
  status: SalesCommissionV2MatchStatus;
  category: SalesCommissionV2CategoryInput | null;
  rule: SalesCommissionV2MappingRuleInput | null;
  matchedBy: "category_exact" | "service_exact" | "rule" | null;
  matchedKeyword: string | null;
  competingCategoryIds: readonly string[];
};

function exactCategoryMatch(
  rawValue: string,
  categories: readonly SalesCommissionV2CategoryInput[],
): SalesCommissionV2CategoryInput | null {
  const normalizedValue = normalizeAppointmentText(rawValue);
  return (
    categories.find(
      (category) => category.normalizedName === normalizedValue,
    ) ?? null
  );
}

function matchedRuleKeywords(
  normalizedValue: string,
  rule: SalesCommissionV2MappingRuleInput,
): string[] {
  return rule.keywords
    .map(normalizeAppointmentText)
    .filter(
      (keyword) => keyword.length > 0 && normalizedValue.includes(keyword),
    );
}

export function matchSalesCommissionV2Category(input: {
  parsed: SalesCommissionV2ParsedDescription;
  categories: readonly SalesCommissionV2CategoryInput[];
  rules: readonly SalesCommissionV2MappingRuleInput[];
}): SalesCommissionV2CategoryMatch {
  const { fields, duplicateFields } = input.parsed;
  if (
    !fields.category ||
    !fields.service ||
    duplicateFields.includes("category") ||
    duplicateFields.includes("service")
  ) {
    return {
      status: "not_applicable",
      category: null,
      rule: null,
      matchedBy: null,
      matchedKeyword: null,
      competingCategoryIds: [],
    };
  }

  const categoryExact = exactCategoryMatch(fields.category, input.categories);
  if (categoryExact) {
    return {
      status: "matched",
      category: categoryExact,
      rule: null,
      matchedBy: "category_exact",
      matchedKeyword: null,
      competingCategoryIds: [],
    };
  }

  const serviceExact = exactCategoryMatch(fields.service, input.categories);
  if (serviceExact) {
    return {
      status: "matched",
      category: serviceExact,
      rule: null,
      matchedBy: "service_exact",
      matchedKeyword: null,
      competingCategoryIds: [],
    };
  }

  const normalizedFields = {
    category: normalizeAppointmentText(fields.category),
    service: normalizeAppointmentText(fields.service),
  };
  const matchingRules = input.rules
    .map((rule) => ({
      rule,
      matchedKeywords: matchedRuleKeywords(normalizedFields[rule.field], rule),
    }))
    .filter(({ rule, matchedKeywords }) => {
      const normalizedKeywordCount = rule.keywords.filter(
        (keyword) => normalizeAppointmentText(keyword).length > 0,
      ).length;
      return rule.matchMode === "all"
        ? normalizedKeywordCount > 0 &&
            matchedKeywords.length === normalizedKeywordCount
        : matchedKeywords.length > 0;
    })
    .sort(
      (left, right) =>
        right.rule.priority - left.rule.priority ||
        left.rule.name.localeCompare(right.rule.name) ||
        left.rule.id.localeCompare(right.rule.id),
    );
  const first = matchingRules[0];
  if (!first) {
    return {
      status: "unmatched",
      category: null,
      rule: null,
      matchedBy: null,
      matchedKeyword: null,
      competingCategoryIds: [],
    };
  }

  const winners = matchingRules.filter(
    ({ rule }) => rule.priority === first.rule.priority,
  );
  const winningCategoryIds = [
    ...new Set(winners.map(({ rule }) => rule.categoryId)),
  ];
  if (winningCategoryIds.length > 1) {
    return {
      status: "ambiguous",
      category: null,
      rule: null,
      matchedBy: null,
      matchedKeyword: null,
      competingCategoryIds: winningCategoryIds,
    };
  }

  const category =
    input.categories.find(({ id }) => id === first.rule.categoryId) ?? null;
  if (!category) {
    return {
      status: "unmatched",
      category: null,
      rule: null,
      matchedBy: null,
      matchedKeyword: null,
      competingCategoryIds: [],
    };
  }

  return {
    status: "matched",
    category,
    rule: first.rule,
    matchedBy: "rule",
    matchedKeyword: first.matchedKeywords[0] ?? null,
    competingCategoryIds: [],
  };
}

export function calculateSalesCommissionV2Financials(input: {
  appointmentStatus:
    "new" | "confirmed" | "showed" | "cancelled" | "noshow" | "invalid";
  priceCents: bigint | null;
  commissionEligible: boolean;
  commissionValue: string | null;
}) {
  const showed = input.appointmentStatus === "showed";
  const noShow = input.appointmentStatus === "noshow";
  const priceCents = input.priceCents ?? 0n;
  const commissionCents =
    showed && input.commissionEligible && input.commissionValue !== null
      ? parseUsdToCents(input.commissionValue)
      : 0n;

  return {
    attributedRevenue: formatUsdCents(showed ? priceCents : 0n),
    missedRevenue: formatUsdCents(noShow ? priceCents : 0n),
    commission: formatUsdCents(commissionCents),
    missingCommissionRate:
      showed && input.commissionEligible && input.commissionValue === null,
  };
}
