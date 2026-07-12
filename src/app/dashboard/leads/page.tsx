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
import { api } from "~/trpc/server";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = resolveDashboardPageSearch(await searchParams);
  const filters = {
    from: search.from,
    to: search.to,
    clientId: search.clientId,
    platform: search.platform,
    campaignId: search.campaignId,
  };
  const [options, leads] = await Promise.all([
    api.dashboard.filterOptions({
      from: search.from,
      to: search.to,
      clientId: search.clientId,
      platform: search.platform,
    }),
    api.dashboard.leads({ ...filters, page: search.leadPage, pageSize: 50 }),
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-primary text-sm font-medium">Analytics</p>
        <h1 className="text-3xl font-semibold">Leads</h1>
        <p className="text-muted-foreground">
          Newest captured lead events and nullable contact details.
        </p>
      </div>
      <DashboardFilters
        values={filters}
        options={options}
        resetPageKeys={["leadPage"]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Captured leads ({leads.total})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Captured</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Ad group</TableHead>
                <TableHead>Ad</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.rows.length ? (
                leads.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.occurredAt.toISOString()}</TableCell>
                    <TableCell>{row.client ?? "Unassigned"}</TableCell>
                    <TableCell>{row.sourceAccount}</TableCell>
                    <TableCell>{row.campaign ?? "—"}</TableCell>
                    <TableCell>{row.adGroup ?? "—"}</TableCell>
                    <TableCell>{row.ad ?? "—"}</TableCell>
                    <TableCell>{row.fullName ?? "—"}</TableCell>
                    <TableCell>{row.email ?? "—"}</TableCell>
                    <TableCell>{row.phoneNumber ?? "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground py-12 text-center"
                  >
                    No leads for these filters.
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
