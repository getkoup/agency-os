import {
  CalendarCheck,
  ClipboardList,
  ListFilter,
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
import { formatReportingDateTime } from "~/features/dashboard/date-format";
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
  const [rawSearch, reportingContext] = await Promise.all([
    searchParams,
    api.dashboard.reportingContext(),
  ]);
  const search = resolveDashboardPageSearch(
    rawSearch,
    new Date(),
    reportingContext.reportingTimezone,
  );
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
            {search.from} through {search.to} · {options.reportingTimezone}
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
              ? "GHL calendar appointments"
              : `${(analytics.conversion * 100).toFixed(1)}% of total leads`
          }
          icon={CalendarCheck}
        />
      </section>
      <section className="grid gap-6 2xl:grid-cols-[minmax(24rem,1fr)_minmax(52rem,2fr)]">
        <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
          <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
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
        <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
          <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
            <CardTitle className="tracking-tight">
              Service category breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            {analytics.serviceCategories.length ? (
              <Table className="min-w-[60rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Category</TableHead>
                    <TableHead className="text-right">Form leads</TableHead>
                    <TableHead className="text-right">Form bookings</TableHead>
                    <TableHead className="text-right">
                      Form conversion
                    </TableHead>
                    <TableHead className="text-right">DM leads</TableHead>
                    <TableHead className="text-right">DM bookings</TableHead>
                    <TableHead className="text-right">DM conversion</TableHead>
                    <TableHead className="pr-6 text-right">
                      Unknown bookings
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.serviceCategories.map((row) => (
                    <TableRow key={row.categoryName}>
                      <TableCell className="pl-6 font-medium">
                        {row.categoryName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.facebookLeadFormLeads}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.facebookLeadFormBookings}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.facebookLeadFormConversion === null
                          ? "—"
                          : `${(row.facebookLeadFormConversion * 100).toFixed(1)}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.dmLeads}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.dmBookings}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.dmConversion === null
                          ? "—"
                          : `${(row.dmConversion * 100).toFixed(1)}%`}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {row.unknownBookings}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={ListFilter}
                title="No classified lead events"
                description="No campaign-attributed form or DM lead events match this range."
              />
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0 2xl:col-span-2">
          <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
            <CardTitle className="tracking-tight">
              Booking breakdown by calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            {analytics.bookingBreakdown.length ? (
              <Table className="min-w-[52rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Calendar</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Confirmed</TableHead>
                    <TableHead className="text-right">Showed</TableHead>
                    <TableHead className="text-right">Cancelled</TableHead>
                    <TableHead className="pr-6 text-right">No-show</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.bookingBreakdown.map((row) => (
                    <TableRow key={row.calendar}>
                      <TableCell className="pl-6 font-medium">
                        {row.calendar}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.total}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.new}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.confirmed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.showed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.cancelled}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {row.noshow}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                icon={CalendarCheck}
                title="No calendar bookings"
                description="No GHL calendar appointments match this range."
              />
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0 2xl:col-span-2">
          <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
            <CardTitle className="tracking-tight">
              Daily lead conversion
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[24rem] overflow-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">
                    {options.reportingTimezone} date
                  </TableHead>
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
      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
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
                  <TableHead>Agency reporting created</TableHead>
                  <TableHead>Reporting timezone</TableHead>
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
                      {formatReportingDateTime(row.occurredAt, row.timezone)}
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
