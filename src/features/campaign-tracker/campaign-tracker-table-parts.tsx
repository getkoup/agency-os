import { format } from "date-fns";

import { Badge } from "~/components/ui/badge";
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getCplHighlightClass } from "~/features/campaign-tracker/cpl-highlight";
import { type CampaignCplThresholds } from "~/features/campaign-tracker/cpl-thresholds";
import { RemarkCell } from "~/features/campaign-tracker/remark-cell";
import { type CampaignTrackerRow } from "~/features/campaign-tracker/server/queries";
import { cn } from "~/lib/utils";

export function formatCampaignTrackerDate(date: string): string {
  return format(new Date(`${date}T12:00:00.000Z`), "d MMM");
}

export function CampaignTrackerTableHeader({
  averageDays,
  dates,
  focusDate,
  showClient,
  sticky = false,
}: {
  averageDays: number;
  dates: string[];
  focusDate: string;
  showClient: boolean;
  sticky?: boolean;
}) {
  return (
    <TableHeader
      className={cn(
        sticky && "[&_th]:bg-muted [&_th]:sticky [&_th]:top-0 [&_th]:z-10",
      )}
    >
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        {showClient ? (
          <TableHead className="min-w-56 pl-5">Client</TableHead>
        ) : null}
        <TableHead className={cn("min-w-72", !showClient && "pl-5")}>
          Campaign
        </TableHead>
        <TableHead className="w-40">Campaign type</TableHead>
        {dates.map((date, index) => (
          <TableHead
            key={date}
            className={cn(
              "w-36 text-center",
              index === dates.length - 1 && "bg-muted border-border border-l",
            )}
          >
            {index === dates.length - 1 ? (
              <span className="text-muted-foreground block text-[0.625rem] font-medium tracking-wide uppercase">
                Latest
              </span>
            ) : null}
            {formatCampaignTrackerDate(date)}
          </TableHead>
        ))}
        <TableHead className="bg-secondary/35 border-border w-40 border-l text-center">
          <span className="block">Average CPL</span>
          <span className="text-muted-foreground text-[0.625rem] font-medium tracking-wide uppercase">
            {averageDays} day{averageDays === 1 ? "" : "s"}
          </span>
        </TableHead>
        <TableHead className="bg-muted border-border min-w-80 border-l pr-5">
          {formatCampaignTrackerDate(focusDate)} remarks
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

export function CampaignTrackerCampaignCells({
  focusDate,
  row,
  thresholds,
  padCampaign = false,
}: {
  focusDate: string;
  row: CampaignTrackerRow;
  thresholds: CampaignCplThresholds;
  padCampaign?: boolean;
}) {
  return (
    <>
      <TableCell className={cn("align-top font-medium", padCampaign && "pl-5")}>
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
            getCplHighlightClass(metrics?.cpl ?? null, thresholds),
            index === row.daily.length - 1 && "border-border border-l",
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
              <p className="text-foreground/70 mt-1 text-[0.6875rem] font-medium whitespace-nowrap">
                {metrics.facebookLeadFormLeads} Form
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                {metrics.dmLeads} DM
              </p>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      ))}
      <TableCell className="bg-secondary/20 border-border h-20 border-l text-center align-middle tabular-nums">
        <p className="font-semibold">
          {row.averageCpl ? `$${row.averageCpl}` : "—"}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">daily CPL</p>
      </TableCell>
      <TableCell className="bg-muted/25 border-border border-l py-3 pr-5 align-top">
        <RemarkCell
          key={`${row.id}:${focusDate}`}
          campaignId={row.id}
          campaignName={row.campaignName}
          date={focusDate}
          initialRemark={row.remark}
        />
      </TableCell>
    </>
  );
}
