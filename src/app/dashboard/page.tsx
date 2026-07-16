import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  CircleDollarSign,
  MessageCircle,
  MousePointerClick,
  Gauge,
  Receipt,
  Megaphone,
  UserRoundSearch,
  Percent,
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
import { formatClientDate } from "~/features/dashboard/date-format";
import { EmptyState } from "~/features/dashboard/empty-state";
import { MetricCard } from "~/features/dashboard/metric-card";
import { OverviewChart } from "~/features/dashboard/overview-chart";
import { PageHeader } from "~/features/dashboard/page-header";
import { SyncAllClientsButton } from "~/features/synchronization/sync-all-clients-button";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { api } from "~/trpc/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  const aggregateRuns =
    user.role === "client" ? [] : await api.dashboard.allClientSyncRuns();
  const search = resolveDashboardPageSearch(await searchParams);
  const filters = {
    from: search.from,
    to: search.to,
    clientId: search.clientId,
    platform: search.platform,
    campaignId: search.campaignId,
  };
  const [
    options,
    overview,
    trend,
    campaigns,
    accounts,
    recentLeads,
    clientHealth,
    creativeRows,
  ] = await Promise.all([
    api.dashboard.filterOptions({
      from: search.from,
      to: search.to,
      clientId: search.clientId,
      platform: search.platform,
    }),
    api.dashboard.overview(filters),
    api.dashboard.trend(filters),
    api.dashboard.topCampaigns(filters),
    api.dashboard.accountSummary({
      clientId: search.clientId,
      platform: search.platform,
    }),
    api.dashboard.recentLeads(filters),
    api.dashboard.clientHealth(filters),
    api.dashboard.performance({ ...filters, page: 1, pageSize: 5 }),
  ]);
  const kpis = [
    {
      title: "Total Clients",
      value: overview.activeClientCount.toLocaleString(),
      detail: "Active in scope",
      icon: Users,
    },
    {
      title: "Total Spend",
      value: `$${overview.spend}`,
      detail: "Selected local date range",
      icon: Receipt,
    },
    {
      title: "Total Leads",
      value: overview.capturedLeads.toLocaleString(),
      detail: "Captured lead events",
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
        overview.capturedLeads === 0
          ? "—"
          : `${(overview.conversion * 100).toFixed(1)}%`,
      detail: "Bookings / captured leads",
      icon: Percent,
    },
    {
      title: "Estimated Revenue",
      value: `$${overview.estimatedRevenue}`,
      detail:
        overview.missingRuleCount === 0
          ? "All bookings matched"
          : `${overview.missingRuleCount} missing rules`,
      icon: CircleDollarSign,
    },
    {
      title: "Average CPC",
      value: overview.cpc ? `$${overview.cpc}` : "—",
      detail: "Spend / link clicks",
      icon: MousePointerClick,
    },
    {
      title: "CPL",
      value: overview.cpl ? `$${overview.cpl}` : "—",
      detail: "Spend / captured leads",
      icon: Gauge,
    },
  ];
  const secondaryKpis = [
    {
      title: "Platform Leads",
      value: overview.platformLeads.toLocaleString(),
      detail: "Reported conversions",
      icon: BarChart3,
    },
    {
      title: "Messaging Conversations",
      value: overview.messagingConversations.toLocaleString(),
      detail: "Started conversations",
      icon: MessageCircle,
    },
    {
      title: "Link Clicks",
      value: overview.linkClicks.toLocaleString(),
      detail: "Tracked link clicks",
      icon: MousePointerClick,
    },
  ];
  const coverage =
    accounts.total === 0
      ? 0
      : Math.round((accounts.assigned / accounts.total) * 100);

  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Portfolio intelligence"
        title="Your agency, at a glance."
        description="A calm, current view of spend, demand, and account coverage across your portfolio."
        meta={
          <>
            <Badge variant="secondary" className="rounded-full">
              {search.from} through {search.to} · client-local dates
            </Badge>
            {overview.latestSync ? (
              <Badge variant="outline" className="rounded-full capitalize">
                Sync {overview.latestSync.status}
              </Badge>
            ) : null}
          </>
        }
        actions={
          user.role === "client" ? null : (
            <SyncAllClientsButton
              serverRunIsActive={aggregateRuns.some(
                (run) => run.status === "running",
              )}
            />
          )
        }
      />
      <DashboardFilters values={filters} options={options} />
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
      <section className="grid gap-4 sm:grid-cols-3">
        {secondaryKpis.map(({ title, value, detail, icon }) => (
          <MetricCard
            key={title}
            label={title}
            value={value}
            supporting={detail}
            icon={icon}
          />
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card className="shadow-sage border-border/80 gap-3 rounded-[1.25rem] py-5">
          <CardHeader>
            <CardTitle className="tracking-tight">Daily performance</CardTitle>
            <p className="text-muted-foreground text-sm">
              Spend and lead activity across each client&apos;s local dates.
            </p>
          </CardHeader>
          <CardContent>
            <OverviewChart rows={trend} />
          </CardContent>
        </Card>
        <Card className="shadow-sage border-border/80 gap-4 rounded-[1.25rem] p-5">
          <CardHeader className="px-0">
            <CardTitle className="tracking-tight">Account coverage</CardTitle>
            <p className="text-muted-foreground text-sm">
              Assignment health across connected ad accounts.
            </p>
          </CardHeader>
          <CardContent className="space-y-6 px-0">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div
                className="grid size-32 shrink-0 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(var(--chart-2) ${coverage}%, var(--secondary) ${coverage}% 100%)`,
                }}
                role="img"
                aria-label={`${coverage}% of accounts assigned`}
              >
                <div className="bg-card grid size-24 place-items-center rounded-full text-center">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {coverage}%
                    </p>
                    <p className="text-muted-foreground text-[0.65rem] tracking-wider uppercase">
                      Assigned
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">
                  {accounts.assigned} of {accounts.total} accounts
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  Client assignments make portfolio reporting and access
                  boundaries explicit.
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {Object.entries(accounts).map(([label, value]) => (
                <div
                  key={label}
                  className="border-border/70 flex items-center justify-between gap-2 border-b pb-2"
                >
                  <dt className="text-muted-foreground capitalize">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-6 2xl:grid-cols-2">
        <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
          <CardHeader>
            <CardTitle className="tracking-tight">Client health</CardTitle>
            <p className="text-muted-foreground text-sm">
              Trend, volume, and booking conversion across active clients.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            {clientHealth.length ? (
              <Table className="min-w-[42rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Client</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Conversion</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="pr-6 text-right">Score</TableHead>
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
                        {row.capturedLeads}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.bookings}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.capturedLeads === 0
                          ? "—"
                          : `${(row.conversion * 100).toFixed(1)}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${row.estimatedRevenue}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {row.health.score}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={Gauge}
                title="No client health data"
                description="No active clients are available in the selected scope."
              />
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="tracking-tight">Recent creatives</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Latest ad performance rows in the selected range.
              </p>
            </div>
            <Link
              href="/dashboard/performance"
              className="text-primary text-sm font-medium hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            {creativeRows.rows.length ? (
              <Table className="min-w-[36rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Creative / Ad</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="pr-6 text-right">Leads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creativeRows.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="pl-6 font-medium">
                        {row.ad}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.campaign}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${row.spend}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {row.capturedLeads}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={Megaphone}
                title="No creative data"
                description="No ads match the selected filters and date range."
              />
            )}
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-6 2xl:grid-cols-2">
        <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
          <CardHeader>
            <CardTitle className="tracking-tight">Top campaigns</CardTitle>
            <p className="text-muted-foreground text-sm">
              Highest-spend campaigns in the selected range.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            {campaigns.length ? (
              <Table className="min-w-[42rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Campaign</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="pr-6 text-right">CPL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="pl-6 font-medium">
                        {row.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.client ?? "Unassigned"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${row.spend}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.platformLeads}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {row.cpl ? `$${row.cpl}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={Megaphone}
                title="No campaign data"
                description="No campaigns match the selected filters and date range."
              />
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sage border-border/80 gap-3 rounded-[1.25rem] py-5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="tracking-tight">Recent leads</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Latest captured lead events.
              </p>
            </div>
            <Link
              href="/dashboard/leads"
              className="text-primary text-sm font-medium hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentLeads.length ? (
              recentLeads.map((lead) => {
                const leadName = lead.fullName ?? lead.email ?? "Unnamed lead";
                const initials = leadName
                  .split(/\s|@/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("");
                return (
                  <div
                    key={lead.id}
                    className="border-border/70 flex items-center gap-3 border-b py-3 last:border-0"
                  >
                    <span className="bg-secondary text-secondary-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold">
                      {initials || "L"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{leadName}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {lead.campaign ?? lead.sourceAccount}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 self-start text-[0.7rem] tabular-nums sm:self-center sm:text-xs">
                      {formatClientDate(lead.occurredAt, lead.timezone)}
                    </span>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={UserRoundSearch}
                title="No recent leads"
                description="No captured leads match the selected filters."
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
