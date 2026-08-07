import { ChevronRight } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableRow } from "~/components/ui/table";
import { type CampaignClientGroup } from "~/features/campaign-tracker/client-groups";
import {
  CampaignTrackerCampaignCells,
  CampaignTrackerTableHeader,
} from "~/features/campaign-tracker/campaign-tracker-table-parts";
import { type CampaignCplThresholds } from "~/features/campaign-tracker/cpl-thresholds";

export function CampaignTrackerGroupedView({
  averageDays,
  clientGroups,
  dates,
  focusDate,
  thresholds,
}: {
  averageDays: number;
  clientGroups: CampaignClientGroup[];
  dates: string[];
  focusDate: string;
  thresholds: CampaignCplThresholds;
}) {
  return (
    <section className="space-y-3" aria-label="Campaigns grouped by client">
      {clientGroups.map((client) => (
        <details
          key={client.id}
          className="group/client border-border/80 bg-background/55 overflow-hidden rounded-[0.75rem] border shadow-xs"
        >
          <summary className="from-muted/25 to-background/30 hover:from-muted/45 flex cursor-pointer list-none items-center justify-between gap-4 bg-gradient-to-r px-5 py-4 transition-colors [&::-webkit-details-marker]:hidden">
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
                  Active campaign portfolio
                </p>
              </div>
            </div>
            <Badge variant="secondary">
              {client.rows.length} campaign
              {client.rows.length === 1 ? "" : "s"}
            </Badge>
          </summary>
          <div className="border-border/70 border-t">
            <Table className="min-w-[90rem]">
              <CampaignTrackerTableHeader
                averageDays={averageDays}
                dates={dates}
                focusDate={focusDate}
                showClient={false}
              />
              <TableBody>
                {client.rows.map((row) => (
                  <TableRow key={row.id}>
                    <CampaignTrackerCampaignCells
                      row={row}
                      focusDate={focusDate}
                      thresholds={thresholds}
                      padCampaign
                    />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ))}
    </section>
  );
}
