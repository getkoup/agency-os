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

export default async function PerformancePage({
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
  const [options, performance] = await Promise.all([
    api.dashboard.filterOptions({
      from: search.from,
      to: search.to,
      clientId: search.clientId,
      platform: search.platform,
    }),
    api.dashboard.performance({
      ...filters,
      page: search.performancePage,
      pageSize: 50,
    }),
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-primary text-sm font-medium">Analytics</p>
        <h1 className="text-3xl font-semibold">Performance</h1>
        <p className="text-muted-foreground">
          Daily ad-level results across accessible accounts.
        </p>
      </div>
      <DashboardFilters
        values={filters}
        options={options}
        resetPageKeys={["performancePage"]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Daily performance ({performance.total})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Ad group</TableHead>
                <TableHead>Ad</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Clicks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.rows.length ? (
                performance.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.client ?? "Unassigned"}</TableCell>
                    <TableCell>{row.sourceAccount}</TableCell>
                    <TableCell>{row.campaign}</TableCell>
                    <TableCell>{row.adGroup}</TableCell>
                    <TableCell>{row.ad}</TableCell>
                    <TableCell className="tabular-nums">${row.spend}</TableCell>
                    <TableCell>{row.platformLeads}</TableCell>
                    <TableCell>{row.messagingConversations}</TableCell>
                    <TableCell>{row.linkClicks}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-muted-foreground py-12 text-center"
                  >
                    No performance data for these filters.
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
