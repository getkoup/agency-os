import {
  CalendarCheck,
  CircleDollarSign,
  Gauge,
  MousePointerClick,
  Percent,
  Receipt,
  UserRoundSearch,
  Users,
} from "lucide-react";

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
import { EmptyState } from "~/features/dashboard/empty-state";
import { MetricCard } from "~/features/dashboard/metric-card";
import { OverviewChart } from "~/features/dashboard/overview-chart";
import { PageHeader } from "~/features/dashboard/page-header";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { api } from "~/trpc/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [rawSearch, reportingContext] = await Promise.all([
    searchParams,
    api.dashboard.reportingContext(),
  ]);
  const search = resolveDashboardPageSearch(
    rawSearch,
    new Date(),
    reportingContext.reportingTimezone,
  );
  const filters = {
    from: search.from,
    to: search.to,
    clientId: search.clientId,
    platform: undefined,
    campaignId: undefined,
  };
  const [options, overview, trend, clientHealth] = await Promise.all([
    api.dashboard.filterOptions({
      from: search.from,
      to: search.to,
      clientId: search.clientId,
    }),
    api.dashboard.overview(filters),
    api.dashboard.trend(filters),
    api.dashboard.clientHealth(filters),
  ]);
  const kpis = [
    {
      title: "Total Clients",
      value: overview.activeClientCount.toLocaleString(),
      detail: "Active clients",
      icon: Users,
    },
    {
      title: "Total Spend",
      value: `$${overview.spend}`,
      detail: `Selected ${options.reportingTimezone} date range`,
      icon: Receipt,
    },
    {
      title: "Total Leads",
      value: overview.totalLeads.toLocaleString(),
      detail: `${overview.facebookLeadFormLeads.toLocaleString()} Facebook forms · ${overview.dmLeads.toLocaleString()} DM`,
      icon: UserRoundSearch,
    },
    {
      title: "Total Bookings",
      value: overview.bookings.toLocaleString(),
      detail: "Won GHL opportunities",
      icon: CalendarCheck,
    },
    {
      title: "Conversion Rate",
      value:
        overview.totalLeads === 0
          ? "—"
          : `${(overview.conversion * 100).toFixed(1)}%`,
      detail: "Bookings / leads",
      icon: Percent,
    },
    {
      title: "Estimated Revenue",
      value: `$${overview.estimatedRevenue}`,
      detail: "Active revenue rules",
      icon: CircleDollarSign,
    },
    {
      title: "Average CPC",
      value: overview.cpc ? `$${overview.cpc}` : "—",
      detail: "Spend / link clicks",
      icon: MousePointerClick,
    },
    {
      title: "Cost Per Lead",
      value: overview.cpl ? `$${overview.cpl}` : "—",
      detail: "Spend / leads",
      icon: Gauge,
    },
  ];

  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Portfolio intelligence"
        title="Agency Overview"
        description="Internal performance snapshot across the clients you can access."
        meta={
          <Badge variant="secondary" className="rounded-[0.35rem]">
            {search.from} through {search.to} · {options.reportingTimezone}
          </Badge>
        }
      />
      <DashboardFilters
        values={filters}
        options={options}
        showPlatform={false}
        showCampaign={false}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ title, value, detail, icon }) => (
          <MetricCard
            key={title}
            label={title}
            value={value}
            supporting={detail}
            icon={icon}
            highlighted={title === "Estimated Revenue"}
          />
        ))}
      </section>
      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
          <CardTitle className="tracking-tight">Daily performance</CardTitle>
          <p className="text-muted-foreground text-sm">
            Spend and total lead events by {options.reportingTimezone} date.
            Total leads combine Facebook lead forms and DM conversations. Won
            opportunities use GHL timestamps grouped in the agency reporting
            timezone.
          </p>
        </CardHeader>
        <CardContent className="p-6">
          <OverviewChart rows={trend} />
        </CardContent>
      </Card>
      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
          <CardTitle className="tracking-tight">Client performance</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {clientHealth.length ? (
            <Table className="min-w-[58rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Client</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Total leads</TableHead>
                  <TableHead className="text-right">Facebook forms</TableHead>
                  <TableHead className="text-right">DM leads</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                  <TableHead className="pr-6 text-right">
                    Estimated revenue
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientHealth.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 font-medium">
                      {row.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.health.status === "healthy"
                            ? "default"
                            : row.health.status === "critical"
                              ? "destructive"
                              : "secondary"
                        }
                        className="capitalize"
                      >
                        {row.health.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.spend}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.facebookLeadFormLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.dmLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.bookings}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalLeads === 0
                        ? "—"
                        : `${(row.conversion * 100).toFixed(1)}%`}
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
              icon={Gauge}
              title="No client performance data"
              description="No active clients are available in the selected range."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
