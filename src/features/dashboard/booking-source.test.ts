import { describe, expect, it } from "vitest";

import { classifyBookingLeadType } from "~/features/dashboard/booking-source";

describe("classifyBookingLeadType", () => {
  it.each(["Facebook", "facebook lead form", " Facebook Lead Form "])(
    "classifies %s as a Facebook lead-form booking",
    (source) => {
      expect(classifyBookingLeadType(source)).toBe("facebook_lead_form");
    },
  );

  it.each([null, undefined, "", "Google", "Ceramic Coating"])(
    "classifies %s as a DM booking",
    (source) => {
      expect(classifyBookingLeadType(source)).toBe("dm");
    },
  );
});
