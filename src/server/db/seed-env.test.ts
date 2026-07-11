import { describe, expect, it } from "vitest";

import { parseSeedEnvironment } from "./seed-env";

const validEnvironment = {
  SEED_ADMIN_EMAIL: "ADMIN@EXAMPLE.COM",
  SEED_ADMIN_PASSWORD: "admin-password-123",
  SEED_ADMIN_NAME: "Agency Admin",
  SEED_CLIENT_EMAIL: "viewer@example.com",
  SEED_CLIENT_PASSWORD: "viewer-password-123",
  SEED_CLIENT_NAME: "Client Viewer",
  SEED_CLIENT_EXTERNAL_ACCOUNT_ID: "facebook__123",
};

describe("seed environment", () => {
  it("normalizes emails and accepts distinct credentials", () => {
    expect(parseSeedEnvironment(validEnvironment).SEED_ADMIN_EMAIL).toBe(
      "admin@example.com",
    );
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
