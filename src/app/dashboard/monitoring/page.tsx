import { Activity, ChevronRight } from "lucide-react";

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
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { resolveMonitoringDateRange } from "~/features/dashboard/server/queries";
import { MonitoringFilters } from "~/features/monitoring/monitoring-filters";
import { api } from "~/trpc/server";

function SummaryMetric({
  label,
  value,
  supporting,
}: {
  label: string;
  value: string;
  supporting?: string;
}) {
  return (
    <div className="border-border/70 border-b p-4 last:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b-0">
      <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wider uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {supporting ? (
        <p className="text-muted-foreground mt-0.5 text-xs">{supporting}</p>
      ) : null}
    </div>
  );
}

function PerformanceSummary({
  spend,
  totalLeads,
  cpl,
  conversations,
  costPerConversation,
}: {
  spend: string;
  totalLeads: number;
  cpl: string | null;
  conversations: number;
  costPerConversation: string | null;
}) {
  const items = [
    { label: "Spend", value: `$${spend}` },
    {
      label: "Leads",
      value: cpl ? `${totalLeads} · $${cpl} CPL` : `${totalLeads}`,
    },
    { label: "Conversations", value: conversations.toLocaleString() },
    {
      label: "Cost / conversation",
      value: costPerConversation ? `$${costPerConversation}` : "—",
    },
  ];
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-right">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-muted-foreground text-[0.625rem] font-medium tracking-wide uppercase">
            {item.label}
          </dt>
          <dd className="text-sm font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawSearch = await searchParams;
  const defaultRange = resolveMonitoringDateRange();
  const search = resolveDashboardPageSearch({
    ...rawSearch,
    from: rawSearch.from ?? defaultRange.from,
    to: rawSearch.to ?? defaultRange.to,
  });
  const filters = {
    from: search.from,
    to: search.to,
    clientId: search.clientId,
  };
  const [options, monitoring] = await Promise.all([
    api.dashboard.filterOptions(filters),
    api.dashboard.monitoring(filters),
  ]);
  const summary = [
    {
      label: "Campaigns",
      value: monitoring.activeCampaignCount.toLocaleString(),
    },
    {
      label: "Ad sets",
      value: monitoring.activeAdSetCount.toLocaleString(),
    },
    { label: "Ads", value: monitoring.activeAdCount.toLocaleString() },
    { label: "Spend", value: `$${monitoring.totalSpend}` },
    {
      label: "Total leads",
      value: monitoring.totalLeads.toLocaleString(),
      supporting: monitoring.cpl ? `$${monitoring.cpl} CPL` : "No CPL",
    },
    {
      label: "Conversations",
      value: monitoring.dmLeads.toLocaleString(),
      supporting: monitoring.costPerConversationStarted
        ? `$${monitoring.costPerConversationStarted} each`
        : "No cost yet",
    },
  ];

  return (
    <div className="mx-auto max-w-[90rem] space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Monitoring"
        description="Campaign, ad set, and ad performance for the selected reporting dates."
        meta={
          <span className="text-muted-foreground text-xs">
            {monitoring.from} through {monitoring.to}
          </span>
        }
      />
      <MonitoringFilters clients={options.clients} values={filters} />
      <section
        aria-label="Monitoring summary"
        className="border-border bg-card grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-6"
      >
        {summary.map((item) => (
          <SummaryMetric key={item.label} {...item} />
        ))}
      </section>
      {monitoring.isTruncated ? (
        <p className="border-border bg-muted/40 rounded-lg border px-4 py-3 text-sm">
          Showing the first 500 active ads. Select one client or a shorter date
          range to narrow the view.
        </p>
      ) : null}
      <section className="space-y-3" aria-label="Campaign performance">
        {monitoring.campaigns.length ? (
          monitoring.campaigns.map((campaign, campaignIndex) => (
            <details
              key={campaign.id}
              open={campaignIndex === 0}
              className="group/campaign border-border bg-card overflow-hidden rounded-xl border"
            >
              <summary className="hover:bg-muted/25 flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 px-4 py-3 transition-colors [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-3">
                  <ChevronRight
                    className="text-muted-foreground size-4 shrink-0 transition-transform group-open/campaign:rotate-90"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-muted-foreground truncate text-[0.6875rem] font-medium tracking-wide uppercase">
                      {campaign.clientName} · Campaign
                    </p>
                    <h2 className="truncate font-semibold tracking-tight">
                      {campaign.name}
                    </h2>
                    <p className="text-muted-foreground text-xs">
                      {campaign.activeAdSetCount} ad set
                      {campaign.activeAdSetCount === 1 ? "" : "s"} ·{" "}
                      {campaign.activeAdCount} ad
                      {campaign.activeAdCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <PerformanceSummary
                  spend={campaign.spend}
                  totalLeads={campaign.totalLeads}
                  cpl={campaign.cpl}
                  conversations={campaign.dmLeads}
                  costPerConversation={campaign.costPerConversationStarted}
                />
              </summary>
              <div className="border-border/70 bg-muted/20 space-y-2 border-t p-3">
                {campaign.adSets.map((adSet, adSetIndex) => (
                  <details
                    key={adSet.id}
                    open={campaignIndex === 0 && adSetIndex === 0}
                    className="group/adset border-border/80 bg-background/75 overflow-hidden rounded-lg border"
                  >
                    <summary className="hover:bg-muted/30 flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 px-4 py-3 transition-colors [&::-webkit-details-marker]:hidden">
                      <div className="flex min-w-0 items-center gap-3">
                        <ChevronRight
                          className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open/adset:rotate-90"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-muted-foreground text-[0.625rem] font-medium tracking-wide uppercase">
                            Ad set
                          </p>
                          <h3 className="truncate text-sm font-semibold">
                            {adSet.name}
                          </h3>
                          <p className="text-muted-foreground text-xs">
                            {adSet.ads.length} ad
                            {adSet.ads.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <PerformanceSummary
                        spend={adSet.spend}
                        totalLeads={adSet.totalLeads}
                        cpl={adSet.cpl}
                        conversations={adSet.dmLeads}
                        costPerConversation={adSet.costPerConversationStarted}
                      />
                    </summary>
                    <div className="border-border/70 overflow-x-auto border-t">
                      <Table className="min-w-[66rem]">
                        <TableHeader>
                          <TableRow className="bg-muted/20">
                            <TableHead className="pl-10">Ad</TableHead>
                            <TableHead className="text-right">Spend</TableHead>
                            <TableHead className="text-right">Leads</TableHead>
                            <TableHead className="text-right">CPL</TableHead>
                            <TableHead className="text-right">
                              Conversations
                            </TableHead>
                            <TableHead className="pr-4 text-right">
                              Cost / conversation
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {adSet.ads.map((ad) => (
                            <TableRow key={ad.id}>
                              <TableCell className="pl-10 font-medium">
                                {ad.name}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                ${ad.spend}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className="font-medium">
                                  {ad.totalLeads}
                                </span>
                                <span className="text-muted-foreground ml-1.5 text-xs">
                                  ({ad.facebookLeadFormLeads} forms,{" "}
                                  {ad.dmLeads} DM)
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {ad.cpl ? `$${ad.cpl}` : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {ad.dmLeads}
                              </TableCell>
                              <TableCell className="pr-4 text-right tabular-nums">
                                {ad.costPerConversationStarted
                                  ? `$${ad.costPerConversationStarted}`
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))
        ) : (
          <div className="border-border bg-card rounded-xl border p-6">
            <EmptyState
              icon={Activity}
              title="No campaign activity"
              description="No ad performance rows match the selected client and date range."
            />
          </div>
        )}
      </section>
    </div>
  );
}
