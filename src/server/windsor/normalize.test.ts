import { describe, expect, it } from "vitest";

import {
  chunkValues,
  normalizeEmail,
  normalizePhone,
  normalizeSuggestionKey,
  parseConnectorAccountId,
  parseNullableInteger,
  parseNullableNumber,
  parseOccurredAt,
} from "./normalize";

describe("Windsor normalization", () => {
  it("keeps missing contact fields nullable and prefers meaningful values", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(" Person@Example.COM ")).toBe("person@example.com");
    expect(normalizePhone(" ")).toBeNull();
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("555-1234")).toBe("5551234");
  });

  it("normalizes names only as suggestion keys", () => {
    expect(normalizeSuggestionKey(" Diamond Auto Restoration ")).toBe(
      "diamondautorestoration",
    );
    expect(normalizeSuggestionKey("719AutoCustoms")).toBe("719autocustoms");
  });

  it("parses numeric strings and null without producing NaN", () => {
    expect(parseNullableNumber("12.50")).toBe(12.5);
    expect(parseNullableNumber(null)).toBeNull();
    expect(parseNullableNumber("not-a-number")).toBeNull();
    expect(parseNullableInteger("12.9")).toBe(12);
  });

  it("requires explicit timestamp offsets", () => {
    expect(parseOccurredAt("2026-07-10T12:30:00+0000").toISOString()).toBe(
      "2026-07-10T12:30:00.000Z",
    );
    expect(() => parseOccurredAt("2026-07-10T12:30:00")).toThrow();
  });

  it("uses connector selectors as identities and chunks deterministically", () => {
    expect(parseConnectorAccountId("facebook_leads__123")).toEqual({
      connector: "facebook_leads",
      externalAccountId: "123",
    });
    expect(() => parseConnectorAccountId("google__123")).toThrow();
    expect(chunkValues([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("does not collapse distinct source lead IDs sharing contact data", () => {
    const fixture = [
      { id: "lead-1", email: "same@example.com", phone_number: "+1 555 1234" },
      { id: "lead-2", email: "same@example.com", phone_number: "+1 555 1234" },
    ];
    expect(new Set(fixture.map((row) => row.id)).size).toBe(2);
  });
});
