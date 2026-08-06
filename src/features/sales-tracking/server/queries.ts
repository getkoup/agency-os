import "server-only";

import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

import {
  agencyReportingTimezoneSql,
  getAgencyReportingContext,
} from "~/features/settings/server/reporting-timezone";
import { db } from "~/server/db";
import {
  clients,
  ghlAppointments,
  ghlCalendars,
  integrationMappings,
} from "~/server/db/schema";

export type SalesStatus =
  "needs_attention" | "needs_monitoring" | "working_good" | "no_goal";

export function resolveSalesTrackingDates(
  focusDate: string,
  groupSize = 1,
): string[] {
  const end = new Date(`${focusDate}T00:00:00.000Z`);
  if (
    Number.isNaN(end.getTime()) ||
    end.toISOString().slice(0, 10) !== focusDate
  ) {
    throw new Error("Invalid sales tracking date");
  }
  if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 90) {
    throw new Error("Invalid sales tracking group size");
  }
  const dateCount = groupSize * 4;
  return Array.from({ length: dateCount }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (dateCount - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

export function salesStatus(
  bookings: number,
  goal: number | null,
): SalesStatus {
  if (goal === null) return "no_goal";
  if (bookings >= goal) return "working_good";
  if (bookings <= goal / 2) return "needs_attention";
  return "needs_monitoring";
}

export function groupSalesDates(dates: string[], groupSize: number) {
  const groups: string[][] = [];
  for (let index = 0; index < dates.length; index += groupSize) {
    groups.push(dates.slice(index, index + groupSize));
  }
  return groups;
}

export async function getSalesTrackingRows(input: {
  date: string;
  groupSize: number;
}) {
  const dates = resolveSalesTrackingDates(input.date, input.groupSize);
  const from = dates[0];
  if (!from) throw new Error("Sales tracking date range is empty");
  const appointmentCreatedDate = sql<string>`timezone(${agencyReportingTimezoneSql}, ${ghlAppointments.providerCreatedAt})::date`;
  const [reportingContext, clientRows, bookingRows] = await Promise.all([
    getAgencyReportingContext(),
    db
      .select({
        id: clients.id,
        name: clients.name,
        dailyBookingGoal: clients.dailyBookingGoal,
      })
      .from(clients)
      .where(eq(clients.status, "active"))
      .orderBy(asc(clients.name)),
    db
      .select({
        clientId: integrationMappings.clientId,
        date: sql<string>`to_char(${appointmentCreatedDate}, 'YYYY-MM-DD')`,
        calendarName: ghlCalendars.name,
        bookings: sql<number>`count(*)::int`,
      })
      .from(ghlAppointments)
      .innerJoin(
        integrationMappings,
        eq(ghlAppointments.integrationMappingId, integrationMappings.id),
      )
      .innerJoin(ghlCalendars, eq(ghlAppointments.calendarId, ghlCalendars.id))
      .where(
        and(
          eq(ghlAppointments.deleted, false),
          gte(appointmentCreatedDate, from),
          lte(appointmentCreatedDate, input.date),
        ),
      )
      .groupBy(
        integrationMappings.clientId,
        sql`to_char(${appointmentCreatedDate}, 'YYYY-MM-DD')`,
        ghlCalendars.name,
      ),
  ]);
  const bookingsByClientDate = new Map<string, typeof bookingRows>();
  for (const booking of bookingRows) {
    const key = `${booking.clientId}:${booking.date}`;
    const existingBookings = bookingsByClientDate.get(key);
    if (existingBookings) {
      existingBookings.push(booking);
    } else {
      bookingsByClientDate.set(key, [booking]);
    }
  }
  const dateGroups = groupSalesDates(dates, input.groupSize);
  const rows = clientRows.map((client) => {
    const buckets = dateGroups.map((groupDates) => {
      const bookingsByCalendar = new Map<string, number>();
      for (const date of groupDates) {
        for (const booking of bookingsByClientDate.get(
          `${client.id}:${date}`,
        ) ?? []) {
          bookingsByCalendar.set(
            booking.calendarName,
            (bookingsByCalendar.get(booking.calendarName) ?? 0) +
              booking.bookings,
          );
        }
      }
      const calendarBreakdown = [...bookingsByCalendar]
        .map(([calendarName, bookings]) => ({ calendarName, bookings }))
        .sort((left, right) =>
          left.calendarName.localeCompare(right.calendarName),
        );
      const bookings = calendarBreakdown.reduce(
        (total, calendar) => total + calendar.bookings,
        0,
      );
      return {
        from: groupDates[0]!,
        to: groupDates.at(-1)!,
        bookings,
        calendarBreakdown,
        goal: client.dailyBookingGoal,
        status: salesStatus(bookings, client.dailyBookingGoal),
      };
    });
    const latest = buckets.at(-1)!;
    return {
      ...client,
      buckets,
      status: latest.status,
      attainment:
        client.dailyBookingGoal === null
          ? null
          : latest.bookings / client.dailyBookingGoal,
    };
  });
  const severity: Record<SalesStatus, number> = {
    needs_attention: 0,
    needs_monitoring: 1,
    working_good: 2,
    no_goal: 3,
  };
  rows.sort(
    (left, right) =>
      severity[left.status] - severity[right.status] ||
      (left.attainment ?? Number.POSITIVE_INFINITY) -
        (right.attainment ?? Number.POSITIVE_INFINITY) ||
      left.name.localeCompare(right.name),
  );
  return {
    ...reportingContext,
    focusDate: input.date,
    dates,
    dateGroups,
    rows,
  };
}
