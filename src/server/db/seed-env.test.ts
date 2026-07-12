import { describe, expect, it } from "vitest";

import { parseSeedEnvironment } from "./seed-env";

const validEnvironment = {
  SEED_OWNER_EMAIL: "OWNER@EXAMPLE.COM",
  SEED_OWNER_PASSWORD: "owner-password-123",
  SEED_OWNER_NAME: "Agency Owner",
  SEED_ADMIN_EMAIL: "ADMIN@EXAMPLE.COM",
  SEED_ADMIN_PASSWORD: "admin-password-123",
  SEED_ADMIN_NAME: "Agency Admin",
  SEED_CLIENT_EMAIL: "client@example.com",
  SEED_CLIENT_PASSWORD: "client-password-123",
  SEED_CLIENT_NAME: "Client User",
  SEED_CLIENT_EXTERNAL_ACCOUNT_ID: "facebook__123",
};

describe("seed environment", () => {
  it("normalizes emails and accepts distinct credentials", () => {
    const parsed = parseSeedEnvironment(validEnvironment);
    expect(parsed.SEED_OWNER_EMAIL).toBe("owner@example.com");
    expect(parsed.SEED_ADMIN_EMAIL).toBe("admin@example.com");
    expect(parsed.SEED_CLIENT_EMAIL).toBe("client@example.com");
  });

  it("rejects colliding emails and short passwords", () => {
    expect(() =>
      parseSeedEnvironment({
        ...validEnvironment,
        SEED_CLIENT_EMAIL: " admin@example.com ",
      }),
    ).toThrow();
    expect(() =>
      parseSeedEnvironment({
        ...validEnvironment,
        SEED_CLIENT_PASSWORD: "short",
      }),
    ).toThrow();
  });
});
