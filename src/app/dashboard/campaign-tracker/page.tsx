import { TableProperties } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { CampaignCplThresholdSettings } from "~/features/campaign-tracker/campaign-cpl-threshold-settings";
import { CampaignTrackerDateFilter } from "~/features/campaign-tracker/campaign-tracker-date-filter";
import { CampaignTrackerGroupedView } from "~/features/campaign-tracker/campaign-tracker-grouped-view";
import { CampaignTrackerTableView } from "~/features/campaign-tracker/campaign-tracker-table-view";
import { CampaignTrackerViewToggle } from "~/features/campaign-tracker/campaign-tracker-view-toggle";
import { groupCampaignsByClient } from "~/features/campaign-tracker/client-groups";
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
  const focusDate =
    z.string().date().safeParse(rawDate).data ?? reportingContext.today;
  const view = campaignTrackerViewSchema.safeParse(rawView).data ?? "grouped";
  const [result, thresholds] = await Promise.all([
    api.campaignTracker.daily({ date: focusDate }),
    api.campaignTracker.cplThresholds(),
  ]);
  const clientGroups = groupCampaignsByClient(result.rows);
  const canConfigureThresholds = user.role === "owner" || user.role === "admin";

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Campaign Tracker"
        description="Daily CPL and lead movement for campaigns with activity in the four-day window."
        meta={
          <Badge variant="secondary" className="rounded-[0.35rem]">
            {result.rows.length} active campaign
            {result.rows.length === 1 ? "" : "s"} · {result.reportingTimezone}
          </Badge>
        }
      />
      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card flex flex-col gap-5 border-b bg-gradient-to-r px-6 py-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <CardTitle className="tracking-tight">
              Four-day campaign performance
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Review daily CPL, lead movement, campaign type, and operator
              remarks by client in {result.reportingTimezone}.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-end gap-3 xl:w-auto xl:justify-end">
            <CampaignTrackerViewToggle date={focusDate} view={view} />
            {canConfigureThresholds ? (
              <CampaignCplThresholdSettings
                key={`${thresholds.warningThreshold}:${thresholds.criticalThreshold}`}
                initialThresholds={thresholds}
              />
            ) : null}
            <CampaignTrackerDateFilter date={focusDate} />
          </div>
        </CardHeader>
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
              title="No active campaigns"
              description="No campaign performance was recorded in the selected four-day window."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
