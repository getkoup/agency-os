import { CalendarCheck, CircleDollarSign, Tags } from "lucide-react";
import { notFound } from "next/navigation";

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
    clientId: undefined,
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
        showClient={false}
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
          label="Missing Revenue Rules"
          value={revenue.missingRules.toLocaleString()}
          supporting="Bookings with zero active matches"
          icon={Tags}
        />
      </section>
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Opportunity ledger ({revenue.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {revenue.rows.length ? (
            <Table className="min-w-[48rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Client local date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="pr-6 text-right">
                    Estimated revenue
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 whitespace-nowrap tabular-nums">
                      {formatClientDate(row.wonAt, row.timezone)}
                    </TableCell>
                    <TableCell>{row.client}</TableCell>
                    <TableCell className="font-medium">
                      {row.opportunity ?? "Unnamed opportunity"}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {row.tags.length ? row.tags.join(", ") : "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      ${row.estimatedRevenue}
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
