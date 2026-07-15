import { UserRoundSearch } from "lucide-react";
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

export default async function LeadsPage({
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
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Demand capture"
        title="Leads"
        description="Newest captured lead events with the source context your team needs."
        meta={
          <span className="text-muted-foreground text-xs">
            {search.from} through {search.to} · UTC
          </span>
        }
      />
      <DashboardFilters
        values={filters}
        options={options}
        resetPageKeys={["leadPage"]}
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Captured leads ({leads.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {leads.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Lead</TableHead>
                  <TableHead>Captured</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad group</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead className="pr-6">Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6">
                      <p className="font-medium">
                        {row.fullName ?? row.email ?? "Unnamed lead"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {row.email ?? "No email"}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                      {row.occurredAt.toISOString()}
                    </TableCell>
                    <TableCell>{row.client ?? "Unassigned"}</TableCell>
                    <TableCell>{row.sourceAccount}</TableCell>
                    <TableCell>{row.campaign ?? "—"}</TableCell>
                    <TableCell>{row.adGroup ?? "—"}</TableCell>
                    <TableCell>{row.ad ?? "—"}</TableCell>
                    <TableCell className="pr-6">
                      {row.phoneNumber ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={UserRoundSearch}
              title="No leads found"
              description="No captured leads match the selected filters."
            />
          )}
        </CardContent>
        <Pagination
          pathname="/dashboard/leads"
          searchParams={rawSearch}
          pageKey="leadPage"
          page={search.leadPage}
          pageSize={50}
          total={leads.total}
        />
      </Card>
    </div>
  );
}
