import { describe, expect, it } from "vitest";

import {
  calculateAppointmentFinancials,
  classifyAppointment,
  resolveCreditedExternalUserId,
  type SalesOfferInput,
} from "~/features/sales-commissions/calculations";

const offers: SalesOfferInput[] = [
  {
    id: "ceramic-299",
    categoryId: "ceramic",
    categoryName: "Ceramic",
    name: "Ceramic $299",
    keywords: ["299", "NC299"],
    matchMode: "any",
    priority: 10,
    revenueValue: "299.00",
  },
  {
    id: "tint-499",
    categoryId: "tint",
    categoryName: "Tint",
    name: "Tint $499",
    keywords: ["499"],
    matchMode: "any",
    priority: 5,
    revenueValue: "499.00",
  },
];

describe("sales commission calculations", () => {
  it("classifies NC299 with the higher-priority Ceramic offer", () => {
    expect(
      classifyAppointment({
        description: "Customer selected NC299 ceramic package",
        notes: null,
        title: null,
        offers,
      }),
    ).toMatchObject({
      status: "matched",
      matchedKeyword: "299",
      offer: { id: "ceramic-299", categoryName: "Ceramic" },
    });
  });

  it("uses notes and then title when description is absent", () => {
    expect(
      classifyAppointment({
        description: null,
        notes: "499 tint package",
        title: "299 fallback title",
        offers,
      }).offer?.id,
    ).toBe("tint-499");
  });

  it("marks equal-priority competing offers as ambiguous", () => {
    const competing = offers.map((offer) => ({ ...offer, priority: 10 }));
    expect(
      classifyAppointment({
        description: "Bundle 299 and 499",
        notes: null,
        title: null,
        offers: competing,
      }),
    ).toMatchObject({
      status: "ambiguous",
      offer: null,
      competingOfferIds: ["ceramic-299", "tint-499"],
    });
  });

  it("keeps missing and unmatched descriptions visible", () => {
    expect(
      classifyAppointment({
        description: null,
        notes: null,
        title: null,
        offers,
      }).status,
    ).toBe("missing_description");
    expect(
      classifyAppointment({
        description: "Unconfigured package",
        notes: null,
        title: null,
        offers,
      }).status,
    ).toBe("unmatched");
  });

  it("resolves the configured salesperson attribution source", () => {
    const identity = {
      createdByUserExternalId: "creator",
      assignedUserExternalId: "assignee",
    };
    expect(
      resolveCreditedExternalUserId({ ...identity, mode: "created_by" }),
    ).toBe("creator");
    expect(
      resolveCreditedExternalUserId({ ...identity, mode: "assigned_user" }),
    ).toBe("assignee");
    expect(
      resolveCreditedExternalUserId({
        ...identity,
        createdByUserExternalId: null,
        mode: "created_by_then_assigned",
      }),
    ).toBe("assignee");
  });

  it("counts revenue and commission only for showed appointments", () => {
    expect(
      calculateAppointmentFinancials({
        appointmentStatus: "showed",
        offerRevenueValue: "299.00",
        commissionValue: "20.00",
      }),
    ).toEqual({
      attributedRevenue: "299.00",
      missedRevenue: "0.00",
      commission: "20.00",
      missingCommissionRate: false,
    });
  });

  it("records potential missed revenue and zero commission for no-shows", () => {
    expect(
      calculateAppointmentFinancials({
        appointmentStatus: "noshow",
        offerRevenueValue: "499.00",
        commissionValue: "20.00",
      }),
    ).toEqual({
      attributedRevenue: "0.00",
      missedRevenue: "499.00",
      commission: "0.00",
      missingCommissionRate: false,
    });
  });

  it("calculates the requested $70 commission example", () => {
    const tint = calculateAppointmentFinancials({
      appointmentStatus: "showed",
      offerRevenueValue: "200.00",
      commissionValue: "10.00",
    });
    const ceramic = calculateAppointmentFinancials({
      appointmentStatus: "showed",
      offerRevenueValue: "299.00",
      commissionValue: "20.00",
    });
    const total = Number(tint.commission) * 3 + Number(ceramic.commission) * 2;
    expect(total).toBe(70);
  });
});
