import { RefreshCw } from "lucide-react";
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
import { SyncAllClientsButton } from "~/features/synchronization/sync-all-clients-button";
import { api } from "~/trpc/server";

export default async function SynchronizationPage() {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const [runs, aggregateRuns] = await Promise.all([
    api.dashboard.syncRuns({ page: 1, pageSize: 25 }),
    api.dashboard.allClientSyncRuns(),
  ]);
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Operations"
        title="Synchronization"
        description="Run Windsor and configured GoHighLevel imports for every active client."
        actions={
          <SyncAllClientsButton
            serverRunIsActive={aggregateRuns.some(
              (run) => run.status === "running",
            )}
          />
        }
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            All-client runs ({aggregateRuns.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {aggregateRuns.length ? (
            aggregateRuns.map((run) => (
              <section
                key={run.id}
                className="border-border/70 overflow-hidden rounded-2xl border"
              >
                <div className="bg-muted/35 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
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
                      {run.startedAt.toISOString()} ·{" "}
                      {run.completedAt
                        ? `${Math.max(0, Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000))}s`
                        : "Running"}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {run.discoveredAccountCount} accounts ·{" "}
                    {run.performanceRowCount} performance · {run.leadRowCount}{" "}
                    leads · {run.opportunityRowCount} wins ·{" "}
                    {run.matchedOpportunityCount} matched
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Records</TableHead>
                        <TableHead>Context</TableHead>
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
                            {target.errorMessage ?? "Completed"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ))
          ) : (
            <EmptyState
              icon={RefreshCw}
              title="No all-client runs"
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
                          {run.startedAt.toISOString()}
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
                          {run.completedAt
                            ? `${Math.max(0, Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000))}s`
                            : "Running"}
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
