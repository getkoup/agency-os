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
import { api } from "~/trpc/server";

export default async function SynchronizationPage() {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const runs = await api.dashboard.syncRuns({ page: 1, pageSize: 25 });
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Operations"
        title="Synchronization"
        description="Read-only Windsor import history. Synchronization remains server-triggered."
      />
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
