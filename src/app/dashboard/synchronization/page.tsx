import { ChevronDown, RefreshCw } from "lucide-react";
import { notFound } from "next/navigation";

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
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { EmptyState } from "~/features/dashboard/empty-state";
import { PageHeader } from "~/features/dashboard/page-header";
import { RetryClientSyncButton } from "~/features/synchronization/retry-client-sync-button";
import { SyncAllClientsButton } from "~/features/synchronization/sync-all-clients-button";
import { isAllClientSyncRunActive } from "~/server/sync/run-status";
import { api } from "~/trpc/server";

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
  target: { clientId: string | null; id: string; status: string },
  targets: Array<{ clientId: string | null; id: string; status: string }>,
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
  runs: Array<{
    id: string;
    targets: Array<{ clientId: string | null }>;
  }>,
) {
  return (
    runs.find((run) =>
      run.targets.some((target) => target.clientId === clientId),
    )?.id === runId
  );
}

export default async function SynchronizationPage() {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const [runs, aggregateRuns] = await Promise.all([
    api.dashboard.syncRuns({ page: 1, pageSize: 25 }),
    api.dashboard.allClientSyncRuns(),
  ]);
  const serverRunIsActive = aggregateRuns.some((run) =>
    isAllClientSyncRunActive(run),
  );
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Operations"
        title="Synchronization"
        description="Run Windsor and configured GoHighLevel imports, then retry individual client failures without repeating completed work."
        actions={<SyncAllClientsButton serverRunIsActive={serverRunIsActive} />}
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Synchronization runs ({aggregateRuns.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {aggregateRuns.length ? (
            aggregateRuns.map((run, index) => (
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
                      <span className="text-sm font-medium">
                        {run.requesterName ?? run.requesterEmail}
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
                        {run.discoveredAccountCount} accounts ·{" "}
                        {run.leadRowCount} leads · {run.opportunityRowCount}{" "}
                        wins
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
                            {isFirstFailedTargetForClient(
                              target,
                              run.targets,
                            ) &&
                            target.clientId &&
                            isLatestRunForClient(
                              run.id,
                              target.clientId,
                              aggregateRuns,
                            ) ? (
                              <RetryClientSyncButton
                                clientId={target.clientId}
                                clientName={target.clientName}
                                disabled={serverRunIsActive}
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
              description="Use Sync all clients to start the first manual import."
            />
          )}
        </CardContent>
      </Card>
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Recent runs ({runs.total})
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
                {runs.rows.length
                  ? runs.rows.map((run) => (
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
                    ))
                  : null}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={RefreshCw}
              title="No synchronization runs"
              description="Import history will appear after the first server-triggered synchronization."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
