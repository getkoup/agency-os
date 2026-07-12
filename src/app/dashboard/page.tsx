import Link from "next/link";
import {
  BarChart3,
  MessageCircle,
  MousePointerClick,
  Receipt,
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
import { OverviewChart } from "~/features/dashboard/overview-chart";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { api } from "~/trpc/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = resolveDashboardPageSearch(await searchParams);
  const filters = {
    from: search.from,
    to: search.to,
    clientId: search.clientId,
    platform: search.platform,
    campaignId: search.campaignId,
  };
  const [options, overview, trend, campaigns, accounts, recentLeads] =
    await Promise.all([
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
    ]);
  const kpis = [
    {
      title: "Spend",
      value: `$${overview.spend}`,
      detail: overview.cpl ? `CPL $${overview.cpl}` : "CPL —",
      icon: Receipt,
    },
    {
      title: "Platform Leads",
      value: overview.platformLeads.toLocaleString(),
      detail: "Reported conversions",
      icon: BarChart3,
    },
    {
      title: "Captured Leads",
      value: overview.capturedLeads.toLocaleString(),
      detail: "Individual lead events",
      icon: Users,
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
      detail: overview.cpc ? `CPC $${overview.cpc}` : "CPC —",
      icon: MousePointerClick,
    },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-sm font-medium">Overview</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Agency performance
          </h1>
          <p className="text-muted-foreground">
            {search.from} through {search.to}, inclusive UTC.
          </p>
        </div>
        {overview.latestSync ? (
          <Badge variant="outline">Sync {overview.latestSync.status}</Badge>
        ) : null}
      </div>
      <DashboardFilters values={filters} options={options} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map(({ title, value, detail, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <Icon className="text-primary size-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
              <p className="text-muted-foreground text-xs">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Daily trend</CardTitle>
          </CardHeader>
          <CardContent>
            <OverviewChart rows={trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account coverage</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            {Object.entries(accounts).map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <div className="text-muted-foreground capitalize">{label}</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {value}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top campaigns</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.length ? (
                  campaigns.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.client ?? "Unassigned"}</TableCell>
                      <TableCell>${row.spend}</TableCell>
                      <TableCell>{row.platformLeads}</TableCell>
                      <TableCell>{row.cpl ? `$${row.cpl}` : "—"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No campaign data.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent leads</CardTitle>
            <Link href="/dashboard/leads" className="text-primary text-sm">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLeads.length ? (
              recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-4 border-b pb-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {lead.fullName ?? lead.email ?? "Unnamed lead"}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {lead.campaign ?? lead.sourceAccount}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {lead.occurredAt.toISOString().slice(0, 10)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No leads for these filters.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
