import { ChevronDown, RefreshCw } from "lucide-react";

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
import { RetryClientSyncButton } from "~/features/synchronization/retry-client-sync-button";
import { type getAllClientSyncRuns } from "~/features/synchronization/server/queries";

type SynchronizationRun = Awaited<
  ReturnType<typeof getAllClientSyncRuns>
>[number];

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

function isFirstFailedTargetForClient(
  target: SynchronizationRun["targets"][number],
  targets: SynchronizationRun["targets"],
) {
  if (target.status !== "failed" || !target.clientId) return false;
  return (
    targets.find(
      (candidate) =>
        candidate.status === "failed" && candidate.clientId === target.clientId,
    )?.id === target.id
  );
}

function isLatestRunForClient(
  runId: string,
  clientId: string,
  runs: SynchronizationRun[],
) {
  return (
    runs.find((run) =>
      run.targets.some((target) => target.clientId === clientId),
    )?.id === runId
  );
}

export function SynchronizationRunHistory({
  activeClientIds,
  runs,
}: {
  activeClientIds: ReadonlySet<string>;
  runs: SynchronizationRun[];
}) {
  return (
    <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
      <CardHeader>
        <CardTitle className="tracking-tight">
          Synchronization runs ({runs.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {runs.length ? (
          runs.map((run, index) => (
            <details
              key={run.id}
              className="group/run border-border/70 overflow-hidden rounded-[0.75rem] border"
              open={index === 0 ? true : undefined}
            >
              <summary className="bg-muted/25 hover:bg-muted/45 flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
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
                    <Badge variant="outline" className="capitalize">
                      {run.mode}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {run.trigger}
                    </Badge>
                    <span className="text-sm font-medium">
                      {run.requesterName ?? run.requesterEmail ?? "System"}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs tabular-nums">
                    {formatSyncDate(run.startedAt)} ·{" "}
                    {formatDuration(run.startedAt, run.completedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-muted-foreground hidden text-right text-xs tabular-nums lg:block">
                    <p>
                      {run.discoveredAccountCount} accounts · {run.leadRowCount}{" "}
                      leads · {run.opportunityRowCount} appointments
                    </p>
                    <p className="mt-1">
                      {run.performanceRowCount} performance ·{" "}
                      {run.matchedOpportunityCount} matched
                    </p>
                  </div>
                  <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-open/run:rotate-180" />
                </div>
              </summary>
              <div className="border-border/70 overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Records</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.targets.map((target) => (
                      <TableRow key={target.id}>
                        <TableCell className="font-medium">
                          {target.clientName}
                        </TableCell>
                        <TableCell className="capitalize">
                          {target.provider}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              target.status === "failed"
                                ? "destructive"
                                : target.status === "succeeded"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="capitalize"
                          >
                            {target.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {target.performanceRowCount +
                            target.leadRowCount +
                            target.contactRowCount +
                            target.opportunityRowCount}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-md text-xs">
                          {target.errorMessage ??
                            (target.status === "pending"
                              ? "Waiting for worker"
                              : target.status === "running"
                                ? "Processing"
                                : "Completed")}
                        </TableCell>
                        <TableCell className="text-right">
                          {isFirstFailedTargetForClient(target, run.targets) &&
                          target.clientId &&
                          isLatestRunForClient(
                            run.id,
                            target.clientId,
                            runs,
                          ) ? (
                            <RetryClientSyncButton
                              clientId={target.clientId}
                              clientName={target.clientName}
                              disabled={activeClientIds.has(target.clientId)}
                              sourceRunId={run.id}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          ))
        ) : (
          <EmptyState
            icon={RefreshCw}
            title="No synchronization runs"
            description="Use Fresh sync all to queue the first import."
          />
        )}
      </CardContent>
    </Card>
  );
}
