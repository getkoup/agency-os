import { ChartNoAxesCombined } from "lucide-react";
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
import { EmptyState } from "~/features/dashboard/empty-state";
import { PageHeader } from "~/features/dashboard/page-header";
import { Pagination } from "~/features/dashboard/pagination";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { api } from "~/trpc/server";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawSearch = await searchParams;
  const search = resolveDashboardPageSearch(rawSearch);
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
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Analytics"
        title="Performance"
        description="Daily ad-level results across every account you can access."
        meta={
          <span className="text-muted-foreground text-xs">
            {search.from} through {search.to} · inclusive UTC
          </span>
        }
      />
      <DashboardFilters
        values={filters}
        options={options}
        resetPageKeys={["performancePage"]}
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Daily performance ({performance.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {performance.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad group</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Messages</TableHead>
                  <TableHead className="pr-6 text-right">Clicks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 tabular-nums">
                      {row.date}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.client ?? "Unassigned"}
                    </TableCell>
                    <TableCell>{row.sourceAccount}</TableCell>
                    <TableCell className="font-medium">
                      {row.campaign}
                    </TableCell>
                    <TableCell>{row.adGroup}</TableCell>
                    <TableCell>{row.ad}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.spend}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.platformLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.messagingConversations}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {row.linkClicks}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={ChartNoAxesCombined}
              title="No performance data"
              description="No daily performance rows match these filters."
            />
          )}
        </CardContent>
        <Pagination
          pathname="/dashboard/performance"
          searchParams={rawSearch}
          pageKey="performancePage"
          page={search.performancePage}
          pageSize={50}
          total={performance.total}
        />
      </Card>
    </div>
  );
}
