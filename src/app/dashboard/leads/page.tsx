import {
  CalendarCheck,
  ClipboardList,
  MessageCircle,
  UserRoundSearch,
} from "lucide-react";
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
        description="Total lead events combine Facebook lead forms and attributed DM conversations."
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
        showPlatform={false}
        showCampaign={false}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Leads"
          value={analytics.totalLeads.toLocaleString()}
          supporting="Facebook forms + DM conversations"
          icon={UserRoundSearch}
          highlighted
        />
        <MetricCard
          label="Facebook Lead Forms"
          value={analytics.facebookLeadFormLeads.toLocaleString()}
          supporting="Individual form submissions"
          icon={ClipboardList}
        />
        <MetricCard
          label="DM Leads"
          value={analytics.dmLeads.toLocaleString()}
          supporting="Messaging conversations started"
          icon={MessageCircle}
        />
        <MetricCard
          label="Total Bookings"
          value={analytics.totalBookings.toLocaleString()}
          supporting={
            analytics.totalLeads === 0
              ? "Won GHL opportunities"
              : `${(analytics.conversion * 100).toFixed(1)}% of total leads`
          }
          icon={CalendarCheck}
        />
      </section>
      <section className="grid gap-6 2xl:grid-cols-2">
        <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
          <CardHeader>
            <CardTitle className="tracking-tight">
              Lead type breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Lead type</TableHead>
                  <TableHead className="text-right">Lead events</TableHead>
                  <TableHead className="pr-6 text-right">
                    Share of all leads
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.leadTypes.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell className="pl-6 font-medium">
                      {row.type}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.leads}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {analytics.totalLeads === 0
                        ? "—"
                        : `${((row.leads / analytics.totalLeads) * 100).toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                  <TableHead className="text-right">Facebook forms</TableHead>
                  <TableHead className="text-right">DM leads</TableHead>
                  <TableHead className="text-right">Total leads</TableHead>
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
                      {row.facebookLeadFormLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.dmLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.bookings}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {row.totalLeads === 0
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
            Facebook Lead Form details ({leads.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {leads.rows.length ? (
            <Table className="min-w-[68rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Client</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Client local created</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead className="pr-6">UTC created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6">
                      {row.client ?? "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {row.fullName ?? row.email ?? "Unnamed lead"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {row.email ?? "No email"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.booked ? "default" : "secondary"}>
                        {row.booked ? "Booked" : "Not booked"}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.sourceAccount}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                      {formatClientDateTime(row.occurredAt, row.timezone)}
                    </TableCell>
                    <TableCell>{row.timezone}</TableCell>
                    <TableCell className="text-muted-foreground pr-6 whitespace-nowrap tabular-nums">
                      {row.occurredAt.toISOString()}
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
