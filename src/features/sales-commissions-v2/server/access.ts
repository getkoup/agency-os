import "server-only";

import { eq } from "drizzle-orm";

import { type UserRole } from "~/lib/roles";
import { db } from "~/server/db";
import { agencySettings } from "~/server/db/schema";

const AGENCY_SETTING_ID = 1;

export async function getSalesCommissionV2AccessSettings() {
  const [settings] = await db
    .select({
      adminEnabled: agencySettings.salesCommissionsV2AdminEnabled,
    })
    .from(agencySettings)
    .where(eq(agencySettings.id, AGENCY_SETTING_ID))
    .limit(1);

  return { adminEnabled: settings?.adminEnabled ?? false };
}

export async function canAccessSalesCommissionV2(role: UserRole) {
  if (role === "owner") return true;
  if (role !== "admin") return false;
  const settings = await getSalesCommissionV2AccessSettings();
  return settings.adminEnabled;
}
