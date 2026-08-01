import {
  formatUsdCents,
  parseUsdToCents,
} from "~/features/revenue/calculations";

export type AppointmentClassificationStatus =
  "matched" | "unmatched" | "ambiguous" | "missing_description";

export type SalespersonAttributionMode =
  "created_by" | "assigned_user" | "created_by_then_assigned";

export interface SalesOfferInput {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  keywords: readonly string[];
  matchMode: "any" | "all";
  priority: number;
  revenueValue: string;
}

export interface AppointmentClassification {
  status: AppointmentClassificationStatus;
  classificationText: string | null;
  offer: SalesOfferInput | null;
  matchedKeyword: string | null;
  competingOfferIds: string[];
}

export function normalizeAppointmentText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function appointmentClassificationText(input: {
  description: string | null;
  notes: string | null;
  title: string | null;
}): string | null {
  for (const value of [input.description, input.notes, input.title]) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function matchingKeywords(
  normalizedText: string,
  offer: SalesOfferInput,
): string[] {
  return offer.keywords.filter((keyword) => {
    const normalizedKeyword = normalizeAppointmentText(keyword);
    return (
      normalizedKeyword.length > 0 && normalizedText.includes(normalizedKeyword)
    );
  });
}

export function classifyAppointment(input: {
  description: string | null;
  notes: string | null;
  title: string | null;
  offers: readonly SalesOfferInput[];
}): AppointmentClassification {
  const classificationText = appointmentClassificationText(input);
  if (!classificationText) {
    return {
      status: "missing_description",
      classificationText: null,
      offer: null,
      matchedKeyword: null,
      competingOfferIds: [],
    };
  }

  const normalizedText = normalizeAppointmentText(classificationText);
  const matching = input.offers
    .map((offer) => ({
      offer,
      keywords: matchingKeywords(normalizedText, offer),
    }))
    .filter(({ offer, keywords }) =>
      offer.matchMode === "all"
        ? offer.keywords.length > 0 && keywords.length === offer.keywords.length
        : keywords.length > 0,
    )
    .sort(
      (left, right) =>
        right.offer.priority - left.offer.priority ||
        left.offer.name.localeCompare(right.offer.name) ||
        left.offer.id.localeCompare(right.offer.id),
    );
  const first = matching[0];
  if (!first) {
    return {
      status: "unmatched",
      classificationText,
      offer: null,
      matchedKeyword: null,
      competingOfferIds: [],
    };
  }

  const highestPriority = first.offer.priority;
  const winners = matching.filter(
    ({ offer }) => offer.priority === highestPriority,
  );
  if (winners.length > 1) {
    return {
      status: "ambiguous",
      classificationText,
      offer: null,
      matchedKeyword: null,
      competingOfferIds: winners.map(({ offer }) => offer.id),
    };
  }

  return {
    status: "matched",
    classificationText,
    offer: first.offer,
    matchedKeyword: first.keywords[0] ?? null,
    competingOfferIds: [],
  };
}

export function resolveCreditedExternalUserId(input: {
  mode: SalespersonAttributionMode;
  createdByUserExternalId: string | null;
  assignedUserExternalId: string | null;
}): string | null {
  if (input.mode === "assigned_user") return input.assignedUserExternalId;
  if (input.mode === "created_by_then_assigned") {
    return input.createdByUserExternalId ?? input.assignedUserExternalId;
  }
  return input.createdByUserExternalId;
}

export function calculateAppointmentFinancials(input: {
  appointmentStatus:
    "new" | "confirmed" | "showed" | "cancelled" | "noshow" | "invalid";
  offerRevenueValue: string | null;
  commissionValue: string | null;
}) {
  const offerRevenueCents = input.offerRevenueValue
    ? parseUsdToCents(input.offerRevenueValue)
    : 0n;
  const commissionCents = input.commissionValue
    ? parseUsdToCents(input.commissionValue)
    : 0n;
  const showed = input.appointmentStatus === "showed";
  const noShow = input.appointmentStatus === "noshow";

  return {
    attributedRevenue: formatUsdCents(showed ? offerRevenueCents : 0n),
    missedRevenue: formatUsdCents(noShow ? offerRevenueCents : 0n),
    commission: formatUsdCents(showed ? commissionCents : 0n),
    missingCommissionRate:
      showed &&
      input.offerRevenueValue !== null &&
      input.commissionValue === null,
  };
}
