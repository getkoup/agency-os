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
        title="Creatives"
        description="Daily creative and ad-level results across every account you can access."
        meta={
          <span className="text-muted-foreground text-xs">
            {search.from} through {search.to} · client-local dates
          </span>
        }
      />
      <DashboardFilters
        values={filters}
        options={options}
        resetPageKeys={["performancePage"]}
        showClient={false}
        showPlatform={false}
        showCampaign={false}
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Creative performance ({performance.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {performance.rows.length ? (
            <Table className="min-w-[76rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Creative / Ad</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Total leads</TableHead>
                  <TableHead className="text-right">Facebook forms</TableHead>
                  <TableHead className="text-right">DM leads</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="pr-6 text-right">CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 tabular-nums">
                      {row.date}
                    </TableCell>
                    <TableCell className="font-medium">{row.ad}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.client ?? "Unassigned"}
                    </TableCell>
                    <TableCell>{row.campaign}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.linkClicks}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.spend}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.facebookLeadFormLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.dmLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.ctr ? `${row.ctr}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.cpc ? `$${row.cpc}` : "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {row.cpl ? `$${row.cpl}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={ChartNoAxesCombined}
              title="No creative data"
              description="No creative performance rows match these filters."
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
