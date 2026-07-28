import { normalizeCampaignText } from "~/features/dashboard/lead-classification";

export type BookingLeadType = "facebook_lead_form" | "dm" | "unknown";

function attributionText(
  source: string | null | undefined,
  attributionSource: Record<string, unknown> | null | undefined,
  lastAttributionSource: Record<string, unknown> | null | undefined,
): string {
  return [
    source,
    ...Object.values(attributionSource ?? {}),
    ...Object.values(lastAttributionSource ?? {}),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function classifyBookingLeadType(
  source: string | null | undefined,
  attributionSource?: Record<string, unknown> | null,
  lastAttributionSource?: Record<string, unknown> | null,
): BookingLeadType {
  const normalized = normalizeCampaignText(
    attributionText(source, attributionSource, lastAttributionSource),
  );
  const identifiesForm = /\bform\b|lead form/.test(normalized);
  const identifiesDm =
    /\bdm\b|conversation/.test(normalized) ||
    (normalized.includes("instagram") && !identifiesForm);
  if (identifiesDm) return "dm";
  if (identifiesForm || normalizeCampaignText(source ?? "") === "facebook") {
    return "facebook_lead_form";
  }
  return "unknown";
}

export function bookingServiceText(input: {
  campaignName: string | null;
  calendarName: string;
  contactTags: readonly string[];
}): string {
  return [input.campaignName, input.calendarName, ...input.contactTags]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
}
