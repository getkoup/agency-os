import { describe, expect, it } from "vitest";

import {
  calculateSalesCommissionV2Financials,
  matchSalesCommissionV2Category,
  parseSalesCommissionV2Description,
  parseSalesCommissionV2Price,
  parseSalesCommissionV2PercentageToBasisPoints,
  type SalesCommissionV2CategoryInput,
  type SalesCommissionV2MappingRuleInput,
} from "~/features/sales-commissions-v2/calculations";

const ceramicDescription = `Lead Source : Dm Lead
Category : cc
Service : cc special
Price : $499
Car : 2024 king ranch dully
Deposit status : $20 Collected Via Cash app

Drop off Friday 9:30 am
pick up Saturday 9:30 am`;

const tintDescription = `Lead Source : Lead form
Category : tint and detail
Service : tint sides and rear + headlight restoration + engine clean
Price : $339 + $80 + $50
Car : Mazda cx5
Deposit status : $20 Collected Via Zelle

Drop off Saturday 9:00 am`;

const categories: SalesCommissionV2CategoryInput[] = [
  {
    id: "ceramic",
    name: "Ceramic Coating",
    normalizedName: "ceramic coating",
  },
  {
    id: "tint-detail",
    name: "Tint and detail",
    normalizedName: "tint and detail",
  },
];

const ceramicRule: SalesCommissionV2MappingRuleInput = {
  id: "ceramic-cc",
  categoryId: "ceramic",
  categoryName: "Ceramic Coating",
  name: "CC abbreviation",
  field: "category",
  keywords: ["cc"],
  matchMode: "any",
  priority: 100,
};

describe("Sales & Commissions v2 calculations", () => {
  it("parses every Martinez field without treating deposit as price", () => {
    const ceramic = parseSalesCommissionV2Description(ceramicDescription);
    expect(ceramic).toEqual({
      status: "structured",
      fields: {
        leadSource: "Dm Lead",
        category: "cc",
        service: "cc special",
        price: "$499",
        car: "2024 king ranch dully",
        depositStatus: "$20 Collected Via Cash app",
      },
      duplicateFields: [],
      reviewReasons: [],
    });
    expect(parseSalesCommissionV2Price(ceramic.fields.price)).toEqual({
      status: "valid",
      cents: 49_900n,
      formatted: "499.00",
    });

    const tint = parseSalesCommissionV2Description(tintDescription);
    expect(tint.fields).toEqual({
      leadSource: "Lead form",
      category: "tint and detail",
      service: "tint sides and rear + headlight restoration + engine clean",
      price: "$339 + $80 + $50",
      car: "Mazda cx5",
      depositStatus: "$20 Collected Via Zelle",
    });
    expect(parseSalesCommissionV2Price(tint.fields.price)).toEqual({
      status: "valid",
      cents: 46_900n,
      formatted: "469.00",
    });
  });

  it("accepts only complete non-negative dollar expressions", () => {
    expect(parseSalesCommissionV2Price("$1,234.5 + $0.05")).toEqual({
      status: "valid",
      cents: 123_455n,
      formatted: "1234.55",
    });
    for (const invalid of [
      "339 + 80",
      "$339 +",
      "$339,00",
      "$12,34",
      "$1.234",
      "-$20",
      "$20 deposit",
      "$20 - $5",
    ]) {
      expect(parseSalesCommissionV2Price(invalid), invalid).toEqual({
        status: "invalid",
        cents: null,
        formatted: null,
      });
    }
    expect(parseSalesCommissionV2Price(null)).toEqual({
      status: "missing",
      cents: null,
      formatted: null,
    });
  });

  it("marks missing, legacy, partial, invalid, and duplicate descriptions precisely", () => {
    expect(parseSalesCommissionV2Description(null)).toMatchObject({
      status: "missing_description",
      reviewReasons: ["missing_description"],
    });
    expect(
      parseSalesCommissionV2Description("Appointment title and notes only"),
    ).toMatchObject({
      status: "legacy_description",
      reviewReasons: ["legacy_description"],
    });
    expect(
      parseSalesCommissionV2Description("Category: Ceramic"),
    ).toMatchObject({
      status: "invalid_structure",
      reviewReasons: ["missing_service", "missing_price"],
    });
    expect(
      parseSalesCommissionV2Description(
        "Category: Ceramic\nService: Ceramic\nPrice: 499",
      ),
    ).toMatchObject({
      status: "invalid_structure",
      reviewReasons: ["invalid_price"],
    });
    expect(
      parseSalesCommissionV2Description(
        "Category: Ceramic\nService: Ceramic\nPrice:\nPrice: $499",
      ),
    ).toMatchObject({
      status: "invalid_structure",
      duplicateFields: ["price"],
      reviewReasons: ["duplicate_field", "missing_price"],
    });
  });

  it("uses exact Category before exact Service and rules", () => {
    const tint = parseSalesCommissionV2Description(tintDescription);
    expect(
      matchSalesCommissionV2Category({
        parsed: tint,
        categories,
        rules: [
          {
            ...ceramicRule,
            field: "service",
            keywords: ["tint"],
            priority: 1_000,
          },
        ],
      }),
    ).toMatchObject({
      status: "matched",
      category: { id: "tint-detail" },
      rule: null,
      matchedBy: "category_exact",
    });

    const serviceExact = parseSalesCommissionV2Description(
      "Category: unknown\nService: Ceramic Coating\nPrice: $499",
    );
    expect(
      matchSalesCommissionV2Category({
        parsed: serviceExact,
        categories,
        rules: [{ ...ceramicRule, categoryId: "tint-detail", priority: 1_000 }],
      }),
    ).toMatchObject({
      status: "matched",
      category: { id: "ceramic" },
      matchedBy: "service_exact",
    });
  });

  it("matches field-scoped any/all rules by priority", () => {
    const parsed = parseSalesCommissionV2Description(
      "Category: custom\nService: tint sides and rear\nPrice: $100",
    );
    const rules: SalesCommissionV2MappingRuleInput[] = [
      {
        ...ceramicRule,
        id: "wrong-field",
        field: "category",
        keywords: ["tint"],
        priority: 1_000,
      },
      {
        ...ceramicRule,
        id: "any-rule",
        field: "service",
        keywords: ["sides", "missing"],
        matchMode: "any",
        priority: 20,
      },
      {
        ...ceramicRule,
        id: "all-rule",
        name: "All service terms",
        field: "service",
        keywords: ["tint", "rear"],
        matchMode: "all",
        priority: 30,
      },
    ];
    expect(
      matchSalesCommissionV2Category({ parsed, categories, rules }),
    ).toMatchObject({
      status: "matched",
      rule: { id: "all-rule" },
      matchedKeyword: "tint",
    });
  });

  it("handles equal-priority ambiguity and same-category determinism", () => {
    const parsed = parseSalesCommissionV2Description(ceramicDescription);
    const competing = {
      ...ceramicRule,
      id: "tint-cc",
      name: "Competing CC",
      categoryId: "tint-detail",
      categoryName: "Tint and detail",
    };
    expect(
      matchSalesCommissionV2Category({
        parsed,
        categories,
        rules: [ceramicRule, competing],
      }),
    ).toMatchObject({
      status: "ambiguous",
      competingCategoryIds: ["ceramic", "tint-detail"],
    });

    expect(
      matchSalesCommissionV2Category({
        parsed,
        categories,
        rules: [
          { ...ceramicRule, id: "z", name: "Z rule" },
          { ...ceramicRule, id: "a", name: "A rule" },
        ],
      }),
    ).toMatchObject({
      status: "matched",
      rule: { id: "a" },
      category: { id: "ceramic" },
    });

    const duplicateCategory = parseSalesCommissionV2Description(
      "Category: cc\nCategory: ceramic\nService: coating\nPrice: $499",
    );
    expect(
      matchSalesCommissionV2Category({
        parsed: duplicateCategory,
        categories,
        rules: [ceramicRule],
      }).status,
    ).toBe("not_applicable");
  });

  it("calculates one client percentage for every showed appointment", () => {
    const ceramicPrice = parseSalesCommissionV2Price(
      parseSalesCommissionV2Description(ceramicDescription).fields.price,
    );
    const tintPrice = parseSalesCommissionV2Price(
      parseSalesCommissionV2Description(tintDescription).fields.price,
    );
    if (ceramicPrice.status !== "valid" || tintPrice.status !== "valid") {
      throw new Error("Martinez prices must be valid");
    }

    expect(
      calculateSalesCommissionV2Financials({
        appointmentStatus: "confirmed",
        priceCents: ceramicPrice.cents,
        commissionEligible: true,
        commissionPercentage: "10.00",
      }),
    ).toEqual({
      attributedRevenue: "0.00",
      missedRevenue: "0.00",
      commission: "0.00",
      missingCommissionPercentage: false,
    });

    const ceramic = calculateSalesCommissionV2Financials({
      appointmentStatus: "showed",
      priceCents: ceramicPrice.cents,
      commissionEligible: true,
      commissionPercentage: "10.00",
    });
    const tint = calculateSalesCommissionV2Financials({
      appointmentStatus: "showed",
      priceCents: tintPrice.cents,
      commissionEligible: true,
      commissionPercentage: "10.00",
    });
    expect(ceramic).toMatchObject({
      attributedRevenue: "499.00",
      commission: "49.90",
    });
    expect(tint).toMatchObject({
      attributedRevenue: "469.00",
      commission: "46.90",
    });
    expect(
      Number(ceramic.attributedRevenue) + Number(tint.attributedRevenue),
    ).toBe(968);
    expect(Number(ceramic.commission) + Number(tint.commission)).toBe(96.8);
  });

  it("rounds percentage commissions to the nearest cent", () => {
    expect(
      calculateSalesCommissionV2Financials({
        appointmentStatus: "showed",
        priceCents: 49_900n,
        commissionEligible: true,
        commissionPercentage: "12.50",
      }).commission,
    ).toBe("62.38");
    expect(parseSalesCommissionV2PercentageToBasisPoints("0")).toBe(0n);
    expect(parseSalesCommissionV2PercentageToBasisPoints("100.00")).toBe(
      10_000n,
    );
    expect(() =>
      parseSalesCommissionV2PercentageToBasisPoints("100.01"),
    ).toThrow("between 0 and 100");
    expect(() => parseSalesCommissionV2PercentageToBasisPoints("-1")).toThrow(
      "between 0 and 100",
    );
  });

  it("records no-show loss and flags only an eligible showed client without a percentage", () => {
    expect(
      calculateSalesCommissionV2Financials({
        appointmentStatus: "noshow",
        priceCents: 49_900n,
        commissionEligible: true,
        commissionPercentage: "10.00",
      }),
    ).toEqual({
      attributedRevenue: "0.00",
      missedRevenue: "499.00",
      commission: "0.00",
      missingCommissionPercentage: false,
    });
    expect(
      calculateSalesCommissionV2Financials({
        appointmentStatus: "showed",
        priceCents: null,
        commissionEligible: true,
        commissionPercentage: null,
      }),
    ).toEqual({
      attributedRevenue: "0.00",
      missedRevenue: "0.00",
      commission: "0.00",
      missingCommissionPercentage: true,
    });
    expect(
      calculateSalesCommissionV2Financials({
        appointmentStatus: "showed",
        priceCents: 49_900n,
        commissionEligible: false,
        commissionPercentage: null,
      }).missingCommissionPercentage,
    ).toBe(false);
  });
});
