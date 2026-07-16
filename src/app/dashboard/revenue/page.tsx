import Link from "next/link";
import { CalendarCheck, CircleDollarSign, Tags } from "lucide-react";
import { notFound } from "next/navigation";

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
import { DashboardFilters } from "~/features/dashboard/dashboard-filters";
import { formatClientDate } from "~/features/dashboard/date-format";
import { EmptyState } from "~/features/dashboard/empty-state";
import { MetricCard } from "~/features/dashboard/metric-card";
import { PageHeader } from "~/features/dashboard/page-header";
import { Pagination } from "~/features/dashboard/pagination";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const rawSearch = await searchParams;
  const search = resolveDashboardPageSearch(rawSearch);
  const filters = {
    from: search.from,
    to: search.to,
    clientId: search.clientId,
  };
  const [options, revenue] = await Promise.all([
    api.dashboard.filterOptions(filters),
    api.dashboard.revenue({
      ...filters,
      page: search.revenuePage,
      pageSize: 25,
    }),
  ]);

  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Commercial intelligence"
        title="Revenue"
        description="Auditable estimated revenue from active client tag rules on won GHL opportunities."
        meta={
          <span className="text-muted-foreground text-xs">
            {search.from} through {search.to} · client-local dates · USD
          </span>
        }
      />
      <DashboardFilters
        values={filters}
        options={options}
        showPlatform={false}
        showCampaign={false}
        resetPageKeys={["revenuePage"]}
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Estimated Revenue"
          value={`$${revenue.estimatedRevenue}`}
          supporting="Active tag rules only"
          icon={CircleDollarSign}
          highlighted
        />
        <MetricCard
          label="Bookings Counted"
          value={revenue.bookings.toLocaleString()}
          supporting="Won GHL opportunities"
          icon={CalendarCheck}
        />
        <MetricCard
          label="Missing Rules"
          value={revenue.missingRules.toLocaleString()}
          supporting="Bookings with zero active matches"
          icon={Tags}
        />
      </section>
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="tracking-tight">
              Opportunity ledger ({revenue.total})
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Each booking sums every distinct matching tag rule.
            </p>
          </div>
          {revenue.missingRules > 0 ? (
            <Link
              href="/dashboard/settings"
              className="text-primary text-sm font-medium hover:underline"
            >
              Manage revenue rules
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {revenue.rows.length ? (
            <Table className="min-w-[72rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Created locally</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Opportunity / Contact</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Matched services</TableHead>
                  <TableHead className="text-right">
                    Estimated revenue
                  </TableHead>
                  <TableHead className="pr-6">Rule status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 whitespace-nowrap tabular-nums">
                      {formatClientDate(row.wonAt, row.timezone)}
                    </TableCell>
                    <TableCell>{row.client}</TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {row.opportunity ?? "Unnamed opportunity"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {row.contact ?? row.email ?? "Unknown contact"}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {row.tags.length ? row.tags.join(", ") : "—"}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {row.matchedServices.length
                        ? row.matchedServices.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.estimatedRevenue}
                    </TableCell>
                    <TableCell className="pr-6">
                      <Badge
                        variant={
                          row.ruleStatus === "matched"
                            ? "default"
                            : "destructive"
                        }
                        className="capitalize"
                      >
                        {row.ruleStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={CircleDollarSign}
              title="No bookings found"
              description="No won opportunities match the selected client and date range."
            />
          )}
        </CardContent>
        <Pagination
          pathname="/dashboard/revenue"
          searchParams={rawSearch}
          pageKey="revenuePage"
          page={search.revenuePage}
          pageSize={25}
          total={revenue.total}
        />
      </Card>
    </div>
  );
}
