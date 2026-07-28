import { normalizeCampaignText } from "~/features/dashboard/lead-classification";

export type BookingLeadType = "facebook_lead_form" | "dm";

const FACEBOOK_LEAD_FORM_SOURCES = new Set(["facebook", "facebook lead form"]);

export function classifyBookingLeadType(
  source: string | null | undefined,
): BookingLeadType {
  const normalizedSource = source ? normalizeCampaignText(source) : "";
  return FACEBOOK_LEAD_FORM_SOURCES.has(normalizedSource)
    ? "facebook_lead_form"
    : "dm";
}
