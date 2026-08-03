import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "~/components/ui/table";
import { type CampaignClientGroup } from "~/features/campaign-tracker/client-groups";
import {
  CampaignTrackerCampaignCells,
  CampaignTrackerTableHeader,
} from "~/features/campaign-tracker/campaign-tracker-table-parts";
import { type CampaignCplThresholds } from "~/features/campaign-tracker/cpl-thresholds";
import { cn } from "~/lib/utils";

export function CampaignTrackerTableView({
  clientGroups,
  dates,
  focusDate,
  thresholds,
}: {
  clientGroups: CampaignClientGroup[];
  dates: string[];
  focusDate: string;
  thresholds: CampaignCplThresholds;
}) {
  return (
    <Table
      aria-label="Campaign performance grouped by client"
      className="min-w-[92rem]"
      containerClassName="border-border max-h-[72vh] overflow-auto rounded-[0.75rem] border"
    >
      <CampaignTrackerTableHeader
        dates={dates}
        focusDate={focusDate}
        showClient
        sticky
      />
      <TableBody>
        {clientGroups.flatMap((client, clientIndex) =>
          client.rows.map((row, rowIndex) => (
            <TableRow
              key={row.id}
              className={cn(clientIndex > 0 && rowIndex === 0 && "border-t-2")}
            >
              {rowIndex === 0 ? (
                <TableCell
                  rowSpan={client.rows.length}
                  className="bg-muted/15 border-border min-w-56 border-r pl-5 align-top"
                >
                  <p className="font-semibold tracking-tight">{client.name}</p>
                  <Badge variant="secondary" className="mt-2">
                    {client.rows.length} campaign
                    {client.rows.length === 1 ? "" : "s"}
                  </Badge>
                </TableCell>
              ) : null}
              <CampaignTrackerCampaignCells
                row={row}
                focusDate={focusDate}
                thresholds={thresholds}
              />
            </TableRow>
          )),
        )}
      </TableBody>
    </Table>
  );
}
