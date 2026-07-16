import { describe, expect, it } from "vitest";

import { parseGhlConfig } from "~/server/ghl/env";

const validEnvironment = {
  GHL_API_BASE_URL: "https://services.leadconnectorhq.com",
  GHL_TINT_LAB_LOCATION_ID: "tint-location",
  GHL_TINT_LAB_PRIVATE_INTEGRATION_TOKEN: "tint-token",
  GHL_DIAMOND_LOCATION_ID: "diamond-location",
  GHL_DIAMOND_PRIVATE_INTEGRATION_TOKEN: "diamond-token",
};

describe("parseGhlConfig", () => {
  it("maps exact immutable client slugs", () => {
    const config = parseGhlConfig(validEnvironment);
    expect(
      config.mappings.map(({ clientSlug, locationId }) => ({
        clientSlug,
        locationId,
      })),
    ).toEqual([
      { clientSlug: "tint-lab", locationId: "tint-location" },
      {
        clientSlug: "diamond-auto-restoration",
        locationId: "diamond-location",
      },
    ]);
  });

  it("rejects unsafe URLs and colliding location identities", () => {
    expect(() =>
      parseGhlConfig({
        ...validEnvironment,
        GHL_API_BASE_URL: "http://services.leadconnectorhq.com",
      }),
    ).toThrow();
    expect(() =>
      parseGhlConfig({
        ...validEnvironment,
        GHL_DIAMOND_LOCATION_ID: "tint-location",
      }),
    ).toThrow("GHL location IDs must be unique");
  });
});
