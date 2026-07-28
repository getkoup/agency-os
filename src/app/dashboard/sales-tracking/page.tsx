import { format } from "date-fns";
import { Target } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { EmptyState } from "~/features/dashboard/empty-state";
import { PageHeader } from "~/features/dashboard/page-header";
import { GoalCell } from "~/features/sales-tracking/goal-cell";
import { SalesTrackingControls } from "~/features/sales-tracking/sales-tracking-controls";
import { cn } from "~/lib/utils";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

const statusPresentation = {
  needs_attention: {
    label: "Needs attention",
    className: "border-red-500/30 bg-red-500/15 text-red-800 dark:text-red-200",
  },
  needs_monitoring: {
    label: "Needs monitoring",
    className:
      "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-200",
  },
  working_good: {
    label: "Working good",
    className:
      "border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  },
  no_goal: {
    label: "No goal",
    className: "border-border bg-muted/40 text-muted-foreground",
  },
} as const;

function dateLabel(from: string, to: string) {
  const first = format(new Date(`${from}T12:00:00Z`), "d MMM");
  if (from === to) return first;
  return `${first}–${format(new Date(`${to}T12:00:00Z`), "d MMM")}`;
}

export default async function SalesTrackingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const search = await searchParams;
  const rawDate = Array.isArray(search.date) ? search.date[0] : search.date;
  const rawGroup = Array.isArray(search.group) ? search.group[0] : search.group;
  const today = new Date().toISOString().slice(0, 10);
  const date = z.string().date().safeParse(rawDate).data ?? today;
  const groupSize =
    z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .safeParse(rawGroup ?? 1).data ?? 1;
  const result = await api.salesTracking.daily({ date, groupSize });
  const counts = result.rows.reduce(
    (summary, row) => {
      summary[row.status] += 1;
      return summary;
    },
    {
      needs_attention: 0,
      needs_monitoring: 0,
      working_good: 0,
      no_goal: 0,
    },
  );
  const canEdit = user.role === "owner" || user.role === "admin";

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        eyebrow="Sales operations"
        title="Sales Tracking"
        description="Booking creation performance against each client's configured goal."
        meta={
          <Badge variant="secondary" className="rounded-[0.35rem]">
            {result.rows.length} active clients
          </Badge>
        }
      />
      <SalesTrackingControls date={date} groupSize={groupSize} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["needs_attention", counts.needs_attention],
            ["needs_monitoring", counts.needs_monitoring],
            ["working_good", counts.working_good],
            ["no_goal", counts.no_goal],
          ] as const
        ).map(([status, count]) => (
          <Card key={status} className="gap-2 py-5">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {statusPresentation[status].label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tabular-nums">
              {count}
            </CardContent>
          </Card>
        ))}
      </section>
      <Card className="overflow-hidden py-0">
        <CardContent className="overflow-x-auto px-0">
          {result.rows.length ? (
            <Table className="min-w-[64rem]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-16 pl-5">Rank</TableHead>
                  <TableHead className="min-w-56">Client</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                  <TableHead className="w-48">Goal</TableHead>
                  {result.dateGroups.map((dates) => (
                    <TableHead
                      key={dates.join(":")}
                      className="w-44 text-center"
                    >
                      {dateLabel(dates[0]!, dates.at(-1)!)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-5 font-semibold tabular-nums">
                      #{index + 1}
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusPresentation[row.status].className}
                      >
                        {statusPresentation[row.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <GoalCell
                        clientId={row.id}
                        clientName={row.name}
                        initialGoal={row.dailyBookingGoal}
                        canEdit={canEdit}
                      />
                    </TableCell>
                    {row.buckets.map((bucket) => (
                      <TableCell
                        key={`${row.id}:${bucket.from}`}
                        className={cn(
                          "h-24 text-center align-middle",
                          statusPresentation[bucket.status].className,
                        )}
                      >
                        <p className="text-lg font-semibold tabular-nums">
                          {bucket.bookings} bookings
                        </p>
                        <p className="mt-1 text-xs opacity-80">
                          Goal {bucket.goal ?? "not set"}
                        </p>
                        {bucket.goal ? (
                          <p className="mt-0.5 text-xs font-medium tabular-nums">
                            {Math.round((bucket.bookings / bucket.goal) * 100)}%
                          </p>
                        ) : null}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={Target}
                title="No active clients"
                description="No active clients are available for sales tracking."
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
