import { RefreshCw } from "lucide-react";

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
import { type getSyncRuns } from "~/features/dashboard/server/queries";

type WindsorRuns = Awaited<ReturnType<typeof getSyncRuns>>;

const syncDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatSyncDate(value: Date) {
  return `${syncDateFormatter.format(value)} UTC`;
}

function formatDuration(startedAt: Date, completedAt: Date | null) {
  return completedAt
    ? `${Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000))}s`
    : "Running";
}

export function WindsorRunHistory({ runs }: { runs: WindsorRuns }) {
  return (
    <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
      <CardHeader>
        <CardTitle className="tracking-tight">
          Recent Windsor runs ({runs.total})
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        {runs.rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead>Performance</TableHead>
                <TableHead>Leads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.rows.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="pl-6 whitespace-nowrap tabular-nums">
                    {formatSyncDate(run.startedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        run.status === "failed"
                          ? "destructive"
                          : run.status === "succeeded"
                            ? "secondary"
                            : "outline"
                      }
                      className="capitalize"
                    >
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDuration(run.startedAt, run.completedAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {run.discoveredAccountCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {run.performanceRowCount}
                  </TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">
                    {run.leadRowCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={RefreshCw}
            title="No Windsor runs"
            description="Windsor history appears after synchronization."
          />
        )}
      </CardContent>
    </Card>
  );
}
