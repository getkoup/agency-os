import { describe, expect, it } from "vitest";

import { classifyBookingLeadType } from "~/features/dashboard/booking-source";

describe("classifyBookingLeadType", () => {
  it.each(["Facebook", "facebook lead form", " Facebook Lead Form "])(
    "classifies %s as a Facebook lead-form booking",
    (source) => {
      expect(classifyBookingLeadType(source)).toBe("facebook_lead_form");
    },
  );

  it("uses GHL campaign attribution to distinguish form and DM bookings", () => {
    expect(
      classifyBookingLeadType(null, {
        campaign: "Tint 299 lead form",
        medium: "facebook",
      }),
    ).toBe("facebook_lead_form");
    expect(
      classifyBookingLeadType("Facebook", {
        campaign: "Tint $299 DM",
        medium: "instagram",
      }),
    ).toBe("dm");
  });

  it.each([null, undefined, "", "Google", "Ceramic Coating"])(
    "keeps %s as an unknown-channel booking",
    (source) => {
      expect(classifyBookingLeadType(source)).toBe("unknown");
    },
  );
});
