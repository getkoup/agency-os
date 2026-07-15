import { Building2 } from "lucide-react";
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
import { EmptyState } from "~/features/dashboard/empty-state";
import { PageHeader } from "~/features/dashboard/page-header";
import {
  ClientEditButton,
  ClientManagement,
} from "~/features/management/client-management";
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
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Agency"
        title="Clients"
        description="Client-level portfolio totals and access health without exposing private memberships."
        actions={managed ? <ClientManagement /> : undefined}
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Clients ({result.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {result.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Platform leads</TableHead>
                  <TableHead>Captured leads</TableHead>
                  {managed ? <TableHead>Client users</TableHead> : null}
                  {managed ? (
                    <TableHead className="pr-6 text-right">Actions</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => {
                  const counts = managed?.rows.find(({ id }) => id === row.id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="pl-6 font-medium">
                        {row.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "active"
                              ? "secondary"
                              : "destructive"
                          }
                          className="capitalize"
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.sourceAccountCount}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        ${row.spend}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.platformLeads}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.capturedLeads}
                      </TableCell>
                      {managed ? (
                        <TableCell className="tabular-nums">
                          {counts?.activeClientUserCount ?? 0}
                        </TableCell>
                      ) : null}
                      {counts ? (
                        <TableCell className="pr-6 text-right">
                          <ClientEditButton row={counts} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Building2}
              title="No clients found"
              description="No client workspaces match the current view."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
