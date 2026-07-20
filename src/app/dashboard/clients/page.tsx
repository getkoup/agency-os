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
import { DashboardFilters } from "~/features/dashboard/dashboard-filters";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { EmptyState } from "~/features/dashboard/empty-state";
import { PageHeader } from "~/features/dashboard/page-header";
import { Pagination } from "~/features/dashboard/pagination";
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
  const rawSearch = await searchParams;
  const search = resolveDashboardPageSearch(rawSearch);
  const canManage = user.role === "owner" || user.role === "admin";
  const [result, managed, options, unassignedAccounts] = await Promise.all([
    api.dashboard.clients({
      from: search.from,
      to: search.to,
      clientId: undefined,
      page: search.clientPage,
      pageSize: 25,
    }),
    canManage
      ? api.management.clients({ page: 1, pageSize: 100 })
      : Promise.resolve(null),
    api.dashboard.filterOptions({
      from: search.from,
      to: search.to,
    }),
    canManage
      ? api.management.accountAssignments({
          assignment: "unassigned",
          page: 1,
          pageSize: 100,
        })
      : Promise.resolve(null),
  ]);
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Agency"
        title="Clients"
        description="Client-level portfolio totals and access health without exposing private memberships."
        actions={
          managed && unassignedAccounts ? (
            <ClientManagement
              clients={managed.rows}
              unassignedAccounts={unassignedAccounts.rows}
              unassignedAccountTotal={unassignedAccounts.total}
            />
          ) : undefined
        }
      />
      <DashboardFilters
        values={{
          from: search.from,
          to: search.to,
        }}
        options={{ ...options, includeUnassigned: false }}
        showClient={false}
        showPlatform={false}
        showCampaign={false}
        resetPageKeys={["clientPage"]}
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Clients ({result.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {result.rows.length ? (
            <Table className="min-w-[54rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Client</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total leads</TableHead>
                  <TableHead>Facebook forms</TableHead>
                  <TableHead>DM leads</TableHead>
                  <TableHead>Bookings</TableHead>
                  <TableHead className="pr-6">Estimated revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 font-medium">
                      {row.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.health.status === "healthy"
                            ? "default"
                            : row.health.status === "critical"
                              ? "destructive"
                              : "secondary"
                        }
                        className="capitalize"
                      >
                        {row.health.status.replace("_", " ")} ·{" "}
                        {row.health.score}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "active" ? "secondary" : "destructive"
                        }
                        className="capitalize"
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.totalLeads}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.facebookLeadFormLeads}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.dmLeads}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.bookings}
                    </TableCell>
                    <TableCell className="pr-6 tabular-nums">
                      ${row.estimatedRevenue}
                    </TableCell>
                  </TableRow>
                ))}
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
      <Pagination
        pathname="/dashboard/clients"
        searchParams={rawSearch}
        pageKey="clientPage"
        page={search.clientPage}
        pageSize={25}
        total={result.total}
      />
    </div>
  );
}
