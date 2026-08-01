import "server-only";

import { eq, sql } from "drizzle-orm";

import {
  DEFAULT_REPORTING_TIMEZONE,
  getCalendarDateInTimezone,
} from "~/features/settings/reporting-timezone";
import { db } from "~/server/db";
import { agencySettings } from "~/server/db/schema";

export const AGENCY_SETTING_ID = 1;

// Inline constants keep repeated SELECT/GROUP BY expressions structurally identical in Postgres.
export const agencyReportingTimezoneSql = sql<string>`coalesce((
  select setting."reportingTimezone"
  from ${agencySettings} setting
  where setting."id" = 1
  limit 1
), 'UTC')`;

export async function getAgencyReportingSettings() {
  const [settings] = await db
    .select({
      reportingTimezone: agencySettings.reportingTimezone,
      updatedAt: agencySettings.updatedAt,
    })
    .from(agencySettings)
    .where(eq(agencySettings.id, AGENCY_SETTING_ID))
    .limit(1);
  return (
    settings ?? {
      reportingTimezone: DEFAULT_REPORTING_TIMEZONE,
      updatedAt: null,
    }
  );
}

export async function getAgencyReportingContext(now = new Date()) {
  const settings = await getAgencyReportingSettings();
  return {
    reportingTimezone: settings.reportingTimezone,
    today: getCalendarDateInTimezone(now, settings.reportingTimezone),
  };
}
