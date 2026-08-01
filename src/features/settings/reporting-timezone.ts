import { z } from "zod";

export const DEFAULT_REPORTING_TIMEZONE = "UTC";

export function isValidReportingTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const reportingTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isValidReportingTimezone, "Select a valid IANA timezone");

export function getReportingTimezoneOptions(): string[] {
  return [
    DEFAULT_REPORTING_TIMEZONE,
    ...Intl.supportedValuesOf("timeZone").filter(
      (timezone) => timezone !== DEFAULT_REPORTING_TIMEZONE,
    ),
  ];
}

export function getCalendarDateInTimezone(
  value: Date,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) {
    throw new Error(`Could not resolve a calendar date in ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}
