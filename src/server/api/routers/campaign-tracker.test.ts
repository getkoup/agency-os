import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveCampaignRemark } from "~/features/campaign-tracker/server/actions";
import { getCampaignTrackerRows } from "~/features/campaign-tracker/server/queries";
import { type UserRole } from "~/lib/roles";
import { campaignTrackerRouter } from "~/server/api/routers/campaign-tracker";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("~/features/campaign-tracker/server/actions", () => ({
  saveCampaignRemark: vi.fn(),
}));
vi.mock("~/features/campaign-tracker/server/queries", () => ({
  getCampaignTrackerRows: vi.fn(),
}));

const createCaller = createCallerFactory(campaignTrackerRouter);

function callerFor(role: UserRole | null) {
  const currentUser = role
    ? {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        role,
        status: "active" as const,
      }
    : null;
  return createCaller({
    db,
    headers: new Headers(),
    session: currentUser
      ? {
          user: currentUser,
          expires: new Date(Date.now() + 60_000).toISOString(),
        }
      : null,
    currentUser,
  });
}

const date = "2026-07-18";
const campaignId = "00000000-0000-4000-8000-000000000001";

describe("campaign tracker router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCampaignTrackerRows).mockResolvedValue({
      focusDate: date,
      dates: ["2026-07-15", "2026-07-16", "2026-07-17", date],
      rows: [],
      isTruncated: false,
    });
    vi.mocked(saveCampaignRemark).mockResolvedValue({ success: true });
  });

  it.each(["owner", "admin", "manager"] as const)(
    "allows %s access",
    async (role) => {
      await expect(callerFor(role).daily({ date })).resolves.toMatchObject({
        focusDate: date,
      });
    },
  );

  it("lets managers save dated remarks", async () => {
    await expect(
      callerFor("manager").saveRemark({
        campaignId,
        date,
        remark: "Budget adjusted",
      }),
    ).resolves.toEqual({ success: true });
    expect(saveCampaignRemark).toHaveBeenCalledWith({
      campaignId,
      date,
      remark: "Budget adjusted",
      userId: "user-1",
    });
  });

  it("rejects client access", async () => {
    await expect(callerFor("client").daily({ date })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      callerFor("client").saveRemark({ campaignId, date, remark: "No" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects anonymous access", async () => {
    await expect(callerFor(null).daily({ date })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
