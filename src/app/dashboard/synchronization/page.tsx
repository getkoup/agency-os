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
import { api } from "~/trpc/server";

export default async function SynchronizationPage() {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const runs = await api.dashboard.syncRuns({ page: 1, pageSize: 25 });
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-primary text-sm font-medium">Operations</p>
        <h1 className="text-3xl font-semibold">Synchronization</h1>
        <p className="text-muted-foreground">
          Read-only Windsor import history. Synchronization remains
          server-triggered.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent runs ({runs.total})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead>Performance</TableHead>
                <TableHead>Leads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.rows.length ? (
                runs.rows.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{run.startedAt.toISOString()}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          run.status === "failed" ? "destructive" : "outline"
                        }
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {run.completedAt
                        ? `${Math.max(0, Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000))}s`
                        : "Running"}
                    </TableCell>
                    <TableCell>{run.discoveredAccountCount}</TableCell>
                    <TableCell>{run.performanceRowCount}</TableCell>
                    <TableCell>{run.leadRowCount}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground py-12 text-center"
                  >
                    No synchronization runs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
