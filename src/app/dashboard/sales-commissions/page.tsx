import {
  AlertTriangle,
  CalendarCheck,
  CircleDollarSign,
  HandCoins,
  Percent,
  ReceiptText,
  UsersRound,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatReportingDateTime } from "~/features/dashboard/date-format";
import { EmptyState } from "~/features/dashboard/empty-state";
import { MetricCard } from "~/features/dashboard/metric-card";
import { PageHeader } from "~/features/dashboard/page-header";
import { Pagination } from "~/features/dashboard/pagination";
import { GlobalSalespersonReport } from "~/features/sales-commissions/global-salesperson-report";
import { SalesCommissionFilters } from "~/features/sales-commissions/sales-commission-filters";
import { cn } from "~/lib/utils";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

const searchSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  view: z.enum(["client", "salesperson"]).default("salesperson"),
  clientId: z.string().uuid().optional(),
  globalSalespersonId: z
    .union([z.string().uuid(), z.literal("unassigned")])
    .optional(),
  appointmentStatus: z
    .enum(["new", "confirmed", "showed", "cancelled", "noshow", "invalid"])
    .optional(),
  categoryId: z.string().uuid().optional(),
  classificationStatus: z
    .enum(["matched", "unmatched", "ambiguous", "missing_description"])
    .optional(),
  salesCommissionPage: z.coerce.number().int().positive().default(1),
});

const statusPresentation = {
  showed: { label: "Showed", className: "bg-emerald-500/15 text-emerald-800" },
  noshow: { label: "No-show", className: "bg-red-500/15 text-red-800" },
  confirmed: { label: "Confirmed", className: "bg-blue-500/15 text-blue-800" },
  new: { label: "New", className: "bg-sky-500/15 text-sky-800" },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
  invalid: { label: "Invalid", className: "bg-muted text-muted-foreground" },
} as const;

const classificationLabels = {
  matched: "Matched",
  unmatched: "Uncategorized",
  ambiguous: "Ambiguous",
  missing_description: "Missing text",
} as const;

function defaultDates(today: string) {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function reportViewHref(
  search: Record<string, string | string[] | undefined>,
  view: "client" | "salesperson",
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    } else if (value !== undefined) {
      next.set(key, value);
    }
  }
  next.set("view", view);
  next.delete("salespersonId");
  next.set("salesCommissionPage", "1");
  return `/dashboard/sales-commissions?${next.toString()}`;
}

export default async function SalesCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const [rawSearch, reportingContext] = await Promise.all([
    searchParams,
    api.dashboard.reportingContext(),
  ]);
  const defaults = defaultDates(reportingContext.today);
  const parsed = searchSchema.safeParse({
    from: rawSearch.from ?? defaults.from,
    to: rawSearch.to ?? defaults.to,
    view: rawSearch.view,
    clientId: rawSearch.clientId,
    globalSalespersonId: rawSearch.globalSalespersonId,
    appointmentStatus: rawSearch.appointmentStatus,
    categoryId: rawSearch.categoryId,
    classificationStatus: rawSearch.classificationStatus,
    salesCommissionPage: rawSearch.salesCommissionPage,
  });
  const search = parsed.success
    ? parsed.data
    : searchSchema.parse({ ...defaults, salesCommissionPage: 1 });
  const report = await api.salesCommissions.report({
    from: search.from,
    to: search.to,
    clientId: search.clientId,
    globalSalespersonId: search.globalSalespersonId,
    status: search.appointmentStatus,
    categoryId: search.categoryId,
    classificationStatus: search.classificationStatus,
    page: search.salesCommissionPage,
    pageSize: 25,
  });
  const canConfigure = user.role === "owner" || user.role === "admin";

  return (
    <div className="mx-auto max-w-[100rem] space-y-7">
      <PageHeader
        eyebrow="Sales operations"
        title="Sales & Commissions"
        description="Booking-date reporting with salesperson, client, revenue, no-show, and commission breakdowns."
        meta={
          canConfigure ? (
            <Button asChild>
              <Link href="/dashboard/sales-commissions/setup">Configure</Link>
            </Button>
          ) : (
            <Badge variant="secondary">Read only</Badge>
          )
        }
      />
      <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-2">
        <div className="px-2">
          <p className="text-sm font-semibold">Report view</p>
          <p className="text-muted-foreground text-xs">
            Global salesperson is the default; client view remains available.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            asChild
            variant={search.view === "salesperson" ? "default" : "ghost"}
          >
            <Link href={reportViewHref(rawSearch, "salesperson")}>
              <UsersRound aria-hidden="true" /> By salesperson
            </Link>
          </Button>
          <Button
            asChild
            variant={search.view === "client" ? "default" : "ghost"}
          >
            <Link href={reportViewHref(rawSearch, "client")}>
              <ReceiptText aria-hidden="true" /> By client
            </Link>
          </Button>
        </div>
      </div>
      <SalesCommissionFilters
        values={{
          from: search.from,
          to: search.to,
          clientId: search.clientId,
          globalSalespersonId: search.globalSalespersonId,
          status: search.appointmentStatus,
          categoryId: search.categoryId,
          classificationStatus: search.classificationStatus,
        }}
        options={{
          ...report.options,
          reportingTimezone: report.reportingTimezone,
          today: report.today,
        }}
      />
      {report.isTruncated ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          This range exceeds 10,000 appointments. Narrow the dates or client to
          keep totals complete.
        </div>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Appointments"
          value={report.summary.appointments.toLocaleString()}
          supporting={`${report.summary.showed.toLocaleString()} showed`}
          icon={CalendarCheck}
        />
        <MetricCard
          label="Show Rate"
          value={`${Math.round(report.summary.showRate * 100)}%`}
          supporting={`${report.summary.noShows.toLocaleString()} no-shows`}
          icon={Percent}
        />
        <MetricCard
          label="Attributed Revenue"
          value={`$${report.summary.attributedRevenue}`}
          supporting="Showed bookings"
          icon={CircleDollarSign}
          highlighted
        />
        <MetricCard
          label="Earned Commission"
          value={`$${report.summary.commission}`}
          supporting="Fixed category rates"
          icon={HandCoins}
          highlighted
        />
        <MetricCard
          label="Potential Missed Revenue"
          value={`$${report.summary.missedRevenue}`}
          supporting="Classified no-shows"
          icon={ReceiptText}
        />
        <MetricCard
          label="Showed"
          value={report.summary.showed.toLocaleString()}
          supporting="Revenue-eligible appointments"
          icon={UserRoundCheck}
        />
        <MetricCard
          label="No-shows"
          value={report.summary.noShows.toLocaleString()}
          supporting="Commission is always $0"
          icon={UserRoundX}
        />
        <MetricCard
          label="Needs Review"
          value={report.summary.needsReview.toLocaleString()}
          supporting="Missing attribution or rules"
          icon={AlertTriangle}
        />
      </section>

      {search.view === "salesperson" ? (
        <GlobalSalespersonReport groups={report.globalSalespersonGroups} />
      ) : report.clientGroups.length ? (
        <section className="space-y-4" aria-label="Sales grouped by client">
          {report.clientGroups.map((client) => (
            <details
              key={client.id}
              open={report.clientGroups.length === 1}
              className="group/client border-border/80 bg-card overflow-hidden rounded-[1.1rem] border shadow-sm"
            >
              <summary className="from-primary/[0.06] via-secondary/25 to-card hover:from-primary/[0.1] cursor-pointer list-none bg-gradient-to-r px-5 py-4 [&::-webkit-details-marker]:hidden">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div>
                    <h2 className="font-semibold tracking-tight">
                      {client.name}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {client.summary.appointments} appointments ·{" "}
                      {client.salespeople.length} salesperson groups
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <SummaryValue
                      label="Showed"
                      value={String(client.summary.showed)}
                    />
                    <SummaryValue
                      label="Revenue"
                      value={`$${client.summary.attributedRevenue}`}
                    />
                    <SummaryValue
                      label="Missed"
                      value={`$${client.summary.missedRevenue}`}
                    />
                    <SummaryValue
                      label="Commission"
                      value={`$${client.summary.commission}`}
                    />
                  </div>
                </div>
              </summary>
              <div className="border-border/70 overflow-x-auto border-t">
                <Table className="min-w-[70rem]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-5">Salesperson</TableHead>
                      <TableHead className="text-right">Booked</TableHead>
                      <TableHead className="text-right">Showed</TableHead>
                      <TableHead className="text-right">No-show</TableHead>
                      <TableHead className="text-right">Show rate</TableHead>
                      <TableHead>Categories</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="pr-5 text-right">
                        Commission
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.salespeople.map((person) => (
                      <TableRow key={person.id ?? "unassigned"}>
                        <TableCell className="pl-5 font-medium">
                          <div className="flex items-center gap-2">
                            {person.name}
                            {person.isUnnamed ? (
                              <Badge variant="outline">Unnamed</Badge>
                            ) : person.hasCustomDisplayName ? (
                              <Badge variant="secondary">Display name</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {person.summary.appointments}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {person.summary.showed}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {person.summary.noShows}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(person.summary.showRate * 100)}%
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-md flex-wrap gap-1.5">
                            {person.categories.length
                              ? person.categories.map((category) => (
                                  <Badge key={category.id} variant="secondary">
                                    {category.name}: {category.summary.showed}
                                  </Badge>
                                ))
                              : "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${person.summary.attributedRevenue}
                        </TableCell>
                        <TableCell className="pr-5 text-right font-semibold tabular-nums">
                          ${person.summary.commission}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          ))}
        </section>
      ) : null}

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 border-b px-6 py-5">
          <CardTitle>Booking ledger ({report.total})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {report.rows.length ? (
            <Table className="min-w-[100rem]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-6">Booked / appointment</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Lead/customer</TableHead>
                  <TableHead>Salesperson</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-72">Description</TableHead>
                  <TableHead>Offer / category</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Missed</TableHead>
                  <TableHead className="pr-6 text-right">Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      row.status === "noshow" &&
                        "bg-red-500/10 hover:bg-red-500/15",
                    )}
                  >
                    <TableCell className="pl-6 whitespace-nowrap">
                      <p>
                        {formatReportingDateTime(row.bookedAt, row.timezone)}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Appointment{" "}
                        {formatReportingDateTime(row.startsAt, row.timezone)}
                      </p>
                    </TableCell>
                    <TableCell>{row.clientName}</TableCell>
                    <TableCell className="font-medium">
                      {row.contactName ?? "Unnamed contact"}
                    </TableCell>
                    <TableCell>
                      {row.salesperson?.name ?? "Unassigned / widget"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={statusPresentation[row.status].className}
                      >
                        {statusPresentation[row.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-96 whitespace-normal">
                      <p className="line-clamp-2">
                        {row.classificationText ?? "No appointment description"}
                      </p>
                      {row.classificationStatus !== "matched" ? (
                        <Badge
                          variant="outline"
                          className="mt-2 border-amber-500/40 text-amber-800"
                        >
                          {classificationLabels[row.classificationStatus]}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.offer ? (
                        <div>
                          <p className="font-medium">{row.offer.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {row.offer.categoryName}
                          </p>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.attributedRevenue}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.missedRevenue}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      <p className="font-semibold">${row.commission}</p>
                      {row.missingCommissionRate ? (
                        <p className="text-destructive mt-1 text-xs">
                          Missing rate
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={HandCoins}
                title="No bookings"
                description="No synchronized bookings match these filters."
              />
            </div>
          )}
        </CardContent>
        <Pagination
          pathname="/dashboard/sales-commissions"
          searchParams={rawSearch}
          pageKey="salesCommissionPage"
          page={search.salesCommissionPage}
          pageSize={25}
          total={report.total}
        />
      </Card>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-muted-foreground text-[0.6875rem] uppercase">
        {label}
      </p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
