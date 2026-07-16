import { CalendarCheck, Layers3, Percent, UserRoundSearch } from "lucide-react";
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
import { formatClientDateTime } from "~/features/dashboard/date-format";
import { EmptyState } from "~/features/dashboard/empty-state";
import { MetricCard } from "~/features/dashboard/metric-card";
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
  const [options, leads, analytics] = await Promise.all([
    api.dashboard.filterOptions({
      from: search.from,
      to: search.to,
      clientId: search.clientId,
      platform: search.platform,
    }),
    api.dashboard.leads({ ...filters, page: search.leadPage, pageSize: 50 }),
    api.dashboard.leadAnalytics(filters),
  ]);
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Demand capture"
        title="Leads"
        description="Newest captured lead events with the source context your team needs."
        meta={
          <span className="text-muted-foreground text-xs">
            {search.from} through {search.to} · client-local dates
          </span>
        }
      />
      <DashboardFilters
        values={filters}
        options={options}
        resetPageKeys={["leadPage"]}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Leads"
          value={analytics.totalLeads.toLocaleString()}
          supporting="Captured Windsor leads"
          icon={UserRoundSearch}
          highlighted
        />
        <MetricCard
          label="Total Bookings"
          value={analytics.totalBookings.toLocaleString()}
          supporting="Won GHL opportunities"
          icon={CalendarCheck}
        />
        <MetricCard
          label="Conversion Rate"
          value={
            analytics.totalLeads === 0
              ? "—"
              : `${(analytics.conversion * 100).toFixed(1)}%`
          }
          supporting="Bookings / captured leads"
          icon={Percent}
        />
        <MetricCard
          label="Source Categories"
          value={analytics.sourceCount.toLocaleString()}
          supporting="Including unattributed bookings"
          icon={Layers3}
        />
      </section>
      <section className="grid gap-6 2xl:grid-cols-2">
        <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
          <CardHeader>
            <CardTitle className="tracking-tight">Source breakdown</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            {analytics.sources.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Source</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="pr-6 text-right">
                      Conversion
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.sources.map((row) => (
                    <TableRow key={row.source}>
                      <TableCell className="pl-6 font-medium">
                        {row.source}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.leads}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.bookings}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {row.leads === 0
                          ? "—"
                          : `${(row.conversion * 100).toFixed(1)}%`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={Layers3}
                title="No source data"
                description="No lead or booking sources match these filters."
              />
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
          <CardHeader>
            <CardTitle className="tracking-tight">
              Daily lead conversion
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[24rem] overflow-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Local date</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="pr-6 text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.daily.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell className="pl-6 tabular-nums">
                      {row.date}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.leads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.bookings}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {row.leads === 0
                        ? "—"
                        : `${(row.conversion * 100).toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Captured leads ({leads.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {leads.rows.length ? (
            <Table className="min-w-[76rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Lead</TableHead>
                  <TableHead>Captured</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Booking status</TableHead>
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
                      {formatClientDateTime(row.occurredAt, row.timezone)}
                    </TableCell>
                    <TableCell>{row.client ?? "Unassigned"}</TableCell>
                    <TableCell>
                      <Badge variant={row.booked ? "default" : "secondary"}>
                        {row.booked ? "Booked" : "Not booked"}
                      </Badge>
                    </TableCell>
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
