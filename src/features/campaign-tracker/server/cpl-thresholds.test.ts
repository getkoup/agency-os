import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CAMPAIGN_CPL_THRESHOLDS } from "~/features/campaign-tracker/cpl-thresholds";
import {
  getCampaignCplThresholds,
  updateCampaignCplThresholds,
} from "~/features/campaign-tracker/server/cpl-thresholds";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

const userId = "campaign-cpl-threshold-admin-test";

beforeAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.insert(users).values({
    id: userId,
    email: "campaign-cpl-threshold-admin@example.com",
    role: "admin",
  });
  await updateCampaignCplThresholds({
    ...DEFAULT_CAMPAIGN_CPL_THRESHOLDS,
    userId,
  });
});

afterAll(async () => {
  await updateCampaignCplThresholds({
    ...DEFAULT_CAMPAIGN_CPL_THRESHOLDS,
    userId,
  });
  await db.delete(users).where(eq(users.id, userId));
});

describe("campaign CPL threshold persistence", () => {
  beforeEach(async () => {
    await updateCampaignCplThresholds({
      warningThreshold: "20",
      criticalThreshold: "30.5",
      userId,
    });
  });

  it("stores normalized thresholds", async () => {
    await expect(
      updateCampaignCplThresholds({
        warningThreshold: "20",
        criticalThreshold: "30.5",
        userId,
      }),
    ).resolves.toEqual({
      warningThreshold: "20.00",
      criticalThreshold: "30.50",
    });
    await expect(getCampaignCplThresholds()).resolves.toEqual({
      warningThreshold: "20.00",
      criticalThreshold: "30.50",
    });
  });

  it("rejects invalid ordering without replacing stored thresholds", async () => {
    await expect(
      updateCampaignCplThresholds({
        warningThreshold: "40",
        criticalThreshold: "30",
        userId,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(getCampaignCplThresholds()).resolves.toEqual({
      warningThreshold: "20.00",
      criticalThreshold: "30.50",
    });
  });
});
