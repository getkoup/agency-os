import {
  Activity,
  BadgeDollarSign,
  Megaphone,
  UserRoundSearch,
} from "lucide-react";
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
import { MetricCard } from "~/features/dashboard/metric-card";
import { PageHeader } from "~/features/dashboard/page-header";
import { resolveMonitoringDateRange } from "~/features/dashboard/server/queries";
import { MonitoringClientFilter } from "~/features/monitoring/monitoring-client-filter";
import { api } from "~/trpc/server";

const optionalClientId = z.string().uuid().optional();

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawSearch = await searchParams;
  const rawClientId = Array.isArray(rawSearch.clientId)
    ? rawSearch.clientId[0]
    : rawSearch.clientId;
  const clientId = optionalClientId.safeParse(rawClientId).data;
  const range = resolveMonitoringDateRange();
  const [options, monitoring] = await Promise.all([
    api.dashboard.filterOptions({ ...range, clientId }),
    api.dashboard.monitoring({ ...range, clientId }),
  ]);
  const metrics = [
    {
      label: "Active Campaigns",
      value: monitoring.activeCampaignCount.toLocaleString(),
      supporting: "With activity in this window",
      icon: Megaphone,
    },
    {
      label: "Active Ads",
      value: monitoring.activeAdCount.toLocaleString(),
      supporting: "With Windsor performance rows",
      icon: Activity,
    },
    {
      label: "Three-Day Spend",
      value: `$${monitoring.totalSpend}`,
      supporting: `${monitoring.from} through ${monitoring.to}`,
      icon: BadgeDollarSign,
    },
    {
      label: "Three-Day Leads",
      value: monitoring.totalLeads.toLocaleString(),
      supporting: monitoring.cpl
        ? `$${monitoring.cpl} average CPL`
        : "No CPL yet",
      icon: UserRoundSearch,
    },
  ];

  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Operations"
        title="Monitoring"
        description="Campaign and ad activity across the latest three Windsor reporting dates."
        meta={
          <Badge variant="secondary" className="rounded-full">
            {monitoring.from} through {monitoring.to}
          </Badge>
        }
      />
      <MonitoringClientFilter clients={options.clients} value={clientId} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            supporting={metric.supporting}
            icon={metric.icon}
          />
        ))}
      </section>
      {monitoring.isTruncated ? (
        <p className="border-border bg-muted/40 rounded-xl border px-4 py-3 text-sm">
          Showing the first 500 active ads. Select one client to narrow the
          view.
        </p>
      ) : null}
      <section className="space-y-4">
        {monitoring.campaigns.length ? (
          monitoring.campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5"
            >
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{campaign.clientName}</Badge>
                    <Badge variant="outline">Active in window</Badge>
                  </div>
                  <CardTitle className="tracking-tight">
                    {campaign.name}
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">
                    {campaign.ads.length} active ad
                    {campaign.ads.length === 1 ? "" : "s"}
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-5 text-right text-sm">
                  <div>
                    <dt className="text-muted-foreground">Spend</dt>
                    <dd className="font-semibold tabular-nums">
                      ${campaign.spend}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Leads</dt>
                    <dd className="font-semibold tabular-nums">
                      {campaign.totalLeads}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">CPL</dt>
                    <dd className="font-semibold tabular-nums">
                      {campaign.cpl ? `$${campaign.cpl}` : "—"}
                    </dd>
                  </div>
                </dl>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0">
                <Table className="min-w-[42rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Ad</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="pr-6 text-right">CPL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaign.ads.map((ad) => (
                      <TableRow key={ad.id}>
                        <TableCell className="pl-6 font-medium">
                          {ad.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${ad.spend}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="font-medium">{ad.totalLeads}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {ad.facebookLeadFormLeads} forms · {ad.dmLeads} DM
                          </span>
                        </TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">
                          {ad.cpl ? `$${ad.cpl}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="shadow-sage border-border/80 rounded-[1.25rem]">
            <CardContent className="p-6">
              <EmptyState
                icon={Activity}
                title="No active campaign activity"
                description="No ad performance rows were found for this client in the latest three-day window."
              />
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
