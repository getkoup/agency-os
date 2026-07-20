import { describe, expect, it } from "vitest";

import { decryptGhlToken, encryptGhlToken } from "~/server/ghl/credentials";

const clientId = "00000000-0000-4000-8000-000000000001";
const locationId = "location-1";
const token = "pit-test-private-integration-token";

describe("GHL credential encryption", () => {
  it("round-trips tokens without storing plaintext", () => {
    const encrypted = encryptGhlToken({ clientId, locationId, token });

    expect(encrypted.encryptedToken).not.toContain(token);
    expect(encrypted.tokenLastFour).toBe("oken");
    expect(decryptGhlToken({ clientId, locationId, ...encrypted })).toBe(token);
  });

  it("binds ciphertext to its client and location", () => {
    const encrypted = encryptGhlToken({ clientId, locationId, token });

    expect(() =>
      decryptGhlToken({
        clientId,
        locationId: "different-location",
        ...encrypted,
      }),
    ).toThrow("could not be decrypted");
  });
});
