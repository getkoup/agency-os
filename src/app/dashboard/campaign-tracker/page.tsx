import { TableProperties } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { CampaignCplThresholdSettings } from "~/features/campaign-tracker/campaign-cpl-threshold-settings";
import { CampaignTrackerDateFilter } from "~/features/campaign-tracker/campaign-tracker-date-filter";
import { CampaignTrackerGroupedView } from "~/features/campaign-tracker/campaign-tracker-grouped-view";
import { CampaignTrackerSearch } from "~/features/campaign-tracker/campaign-tracker-search";
import { CampaignTrackerTableView } from "~/features/campaign-tracker/campaign-tracker-table-view";
import { CampaignTrackerViewToggle } from "~/features/campaign-tracker/campaign-tracker-view-toggle";
import {
  filterCampaignClientGroups,
  groupCampaignsByClient,
} from "~/features/campaign-tracker/client-groups";
import { formatCplThresholdLabel } from "~/features/campaign-tracker/cpl-thresholds";
import { campaignTrackerViewSchema } from "~/features/campaign-tracker/view";
import { EmptyState } from "~/features/dashboard/empty-state";
import { PageHeader } from "~/features/dashboard/page-header";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

export default async function CampaignTrackerPage({
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
  const rawDate = Array.isArray(rawSearch.date)
    ? rawSearch.date[0]
    : rawSearch.date;
  const rawView = Array.isArray(rawSearch.view)
    ? rawSearch.view[0]
    : rawSearch.view;
  const rawQuery = Array.isArray(rawSearch.query)
    ? rawSearch.query[0]
    : rawSearch.query;
  const focusDate =
    z.string().date().safeParse(rawDate).data ?? reportingContext.today;
  const view = campaignTrackerViewSchema.safeParse(rawView).data ?? "grouped";
  const query = z.string().trim().max(100).safeParse(rawQuery).data ?? "";
  const [result, thresholds] = await Promise.all([
    api.campaignTracker.daily({ date: focusDate }),
    api.campaignTracker.cplThresholds(),
  ]);
  const clientGroups = filterCampaignClientGroups(
    groupCampaignsByClient(result.rows),
    query,
  );
  const visibleCampaignCount = clientGroups.reduce(
    (total, client) => total + client.rows.length,
    0,
  );
  const canConfigureThresholds = user.role === "owner" || user.role === "admin";

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Campaign Tracker"
        description="Daily CPL and lead movement for campaigns with activity in the four-day window."
        meta={
          <Badge variant="secondary" className="rounded-[0.35rem]">
            {query
              ? `${visibleCampaignCount} of ${result.rows.length}`
              : result.rows.length}{" "}
            active campaign{result.rows.length === 1 ? "" : "s"} ·{" "}
            {result.reportingTimezone}
          </Badge>
        }
      />
      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card gap-0 border-b bg-gradient-to-r px-6 py-5">
          <div className="space-y-1">
            <CardTitle className="tracking-tight">
              Four-day campaign performance
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Review daily CPL, lead movement, campaign type, and operator
              remarks by client in {result.reportingTimezone}.
            </p>
          </div>
        </CardHeader>
        <div className="border-border/70 bg-card/70 border-b px-6 py-4">
          <div className="grid w-full items-end gap-4 sm:grid-cols-2 xl:flex xl:flex-row">
            <CampaignTrackerSearch key={query} initialQuery={query} />
            <CampaignTrackerViewToggle
              date={focusDate}
              query={query}
              view={view}
            />
            {canConfigureThresholds ? (
              <CampaignCplThresholdSettings
                key={`${thresholds.warningThreshold}:${thresholds.criticalThreshold}`}
                initialThresholds={thresholds}
              />
            ) : null}
            <CampaignTrackerDateFilter date={focusDate} />
          </div>
        </div>
        <div className="border-border/70 bg-muted/15 text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-6 py-3 text-xs">
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-[0.2rem] bg-orange-500/40" /> CPL
            over {formatCplThresholdLabel(thresholds.warningThreshold)}
          </span>
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-[0.2rem] bg-red-500/40" /> CPL over{" "}
            {formatCplThresholdLabel(thresholds.criticalThreshold)}
          </span>
          <span>Each date cell shows CPL and total leads.</span>
        </div>
        <CardContent className="space-y-4 p-4 sm:p-5">
          {result.isTruncated ? (
            <p className="border-border bg-muted/40 rounded-lg border px-4 py-3 text-sm">
              Showing the first 500 active campaigns.
            </p>
          ) : null}
          {clientGroups.length ? (
            view === "table" ? (
              <CampaignTrackerTableView
                clientGroups={clientGroups}
                dates={result.dates}
                focusDate={result.focusDate}
                thresholds={thresholds}
              />
            ) : (
              <CampaignTrackerGroupedView
                clientGroups={clientGroups}
                dates={result.dates}
                focusDate={result.focusDate}
                thresholds={thresholds}
              />
            )
          ) : (
            <EmptyState
              icon={TableProperties}
              title={query ? "No matching campaigns" : "No active campaigns"}
              description={
                query
                  ? `No client or campaign matches “${query}”.`
                  : "No campaign performance was recorded in the selected four-day window."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
