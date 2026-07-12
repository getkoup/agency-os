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
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { ClientManagement } from "~/features/management/client-management";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (user.role === "client") notFound();
  const search = resolveDashboardPageSearch(await searchParams);
  const [result, managed] = await Promise.all([
    api.dashboard.clients({
      from: search.from,
      to: search.to,
      page: 1,
      pageSize: 25,
    }),
    user.role === "owner"
      ? api.management.clients({ page: 1, pageSize: 100 })
      : Promise.resolve(null),
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-medium">Agency</p>
          <h1 className="text-3xl font-semibold">Clients</h1>
          <p className="text-muted-foreground">
            Client-level totals without exposing memberships to read-only
            admins.
          </p>
        </div>
        {managed ? <ClientManagement rows={managed.rows} /> : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Clients ({result.total})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead>Platform leads</TableHead>
                <TableHead>Captured leads</TableHead>
                {managed ? <TableHead>Client users</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.length ? (
                result.rows.map((row) => {
                  const counts = managed?.rows.find(({ id }) => id === row.id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status}</Badge>
                      </TableCell>
                      <TableCell>{row.sourceAccountCount}</TableCell>
                      <TableCell>${row.spend}</TableCell>
                      <TableCell>{row.platformLeads}</TableCell>
                      <TableCell>{row.capturedLeads}</TableCell>
                      {managed ? (
                        <TableCell>
                          {counts?.activeClientUserCount ?? 0}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground py-12 text-center"
                  >
                    No clients match these filters.
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
