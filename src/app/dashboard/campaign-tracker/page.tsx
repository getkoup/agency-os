import { format } from "date-fns";
import { ChevronRight, TableProperties } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { CampaignTrackerDateFilter } from "~/features/campaign-tracker/campaign-tracker-date-filter";
import { getCplHighlightClass } from "~/features/campaign-tracker/cpl-highlight";
import { RemarkCell } from "~/features/campaign-tracker/remark-cell";
import { EmptyState } from "~/features/dashboard/empty-state";
import { PageHeader } from "~/features/dashboard/page-header";
import { cn } from "~/lib/utils";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

function formatDate(date: string) {
  return format(new Date(`${date}T12:00:00.000Z`), "d MMM");
}

export default async function CampaignTrackerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const rawSearch = await searchParams;
  const rawDate = Array.isArray(rawSearch.date)
    ? rawSearch.date[0]
    : rawSearch.date;
  const today = new Date().toISOString().slice(0, 10);
  const focusDate = z.string().date().safeParse(rawDate).data ?? today;
  const result = await api.campaignTracker.daily({ date: focusDate });
  const clientGroupsById = new Map<
    string,
    {
      id: string;
      name: string;
      rows: typeof result.rows;
    }
  >();
  for (const row of result.rows) {
    const group = clientGroupsById.get(row.clientId) ?? {
      id: row.clientId,
      name: row.clientName,
      rows: [],
    };
    group.rows.push(row);
    clientGroupsById.set(row.clientId, group);
  }
  const clientGroups = [...clientGroupsById.values()];

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Campaign Tracker"
        description="Daily CPL and lead movement for campaigns with activity in the four-day window."
        meta={
          <Badge variant="secondary" className="rounded-full">
            {result.rows.length} active campaign
            {result.rows.length === 1 ? "" : "s"}
          </Badge>
        }
      />
      <CampaignTrackerDateFilter date={focusDate} />
      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-orange-500/40" /> CPL over $15
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-red-500/40" /> CPL over $25
        </span>
        <span>Each date cell shows CPL and total leads.</span>
      </div>
      {result.isTruncated ? (
        <p className="border-border bg-muted/40 rounded-lg border px-4 py-3 text-sm">
          Showing the first 500 active campaigns.
        </p>
      ) : null}
      {clientGroups.length ? (
        <section className="space-y-3" aria-label="Campaigns grouped by client">
          {clientGroups.map((client) => (
            <details
              key={client.id}
              className="group/client border-border bg-card overflow-hidden rounded-xl border"
            >
              <summary className="hover:bg-muted/25 flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-3">
                  <ChevronRight
                    className="text-muted-foreground size-4 shrink-0 transition-transform group-open/client:rotate-90"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold tracking-tight">
                      {client.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {client.rows.length} active campaign
                      {client.rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">
                  {client.rows.length} campaign
                  {client.rows.length === 1 ? "" : "s"}
                </Badge>
              </summary>
              <div className="border-border/70 overflow-x-auto border-t">
                <Table className="min-w-[80rem]">
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="min-w-72 pl-5">Campaign</TableHead>
                      <TableHead className="w-40">Campaign type</TableHead>
                      {result.dates.map((date, index) => (
                        <TableHead
                          key={date}
                          className={cn(
                            "w-36 text-center",
                            index === result.dates.length - 1 &&
                              "bg-muted border-border border-l",
                          )}
                        >
                          {index === result.dates.length - 1 ? (
                            <span className="text-muted-foreground block text-[0.625rem] font-medium tracking-wide uppercase">
                              Latest
                            </span>
                          ) : null}
                          {formatDate(date)}
                        </TableHead>
                      ))}
                      <TableHead className="bg-muted border-border min-w-80 border-l pr-5">
                        {formatDate(result.focusDate)} remarks
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="pl-5 align-top">
                          {row.campaignName}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline">{row.campaignType}</Badge>
                        </TableCell>
                        {row.daily.map(({ date, metrics }, index) => (
                          <TableCell
                            key={date}
                            className={cn(
                              "h-20 text-center align-middle tabular-nums",
                              getCplHighlightClass(metrics?.cpl ?? null),
                              index === row.daily.length - 1 &&
                                "border-border border-l",
                            )}
                          >
                            {metrics ? (
                              <div>
                                <p className="font-semibold">
                                  {metrics.cpl ? `$${metrics.cpl}` : "—"}
                                </p>
                                <p className="text-muted-foreground mt-1 text-xs">
                                  {metrics.totalLeads} lead
                                  {metrics.totalLeads === 1 ? "" : "s"}
                                </p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="bg-muted/25 border-border border-l py-3 pr-5 align-top">
                          <RemarkCell
                            key={`${row.id}:${result.focusDate}`}
                            campaignId={row.id}
                            campaignName={row.campaignName}
                            date={result.focusDate}
                            initialRemark={row.remark}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          ))}
        </section>
      ) : (
        <div className="border-border bg-card rounded-xl border p-6">
          <EmptyState
            icon={TableProperties}
            title="No active campaigns"
            description="No campaign performance was recorded in the selected four-day window."
          />
        </div>
      )}
    </div>
  );
}
