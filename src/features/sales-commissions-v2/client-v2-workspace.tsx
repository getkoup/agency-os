import { useMemo } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  HandCoins,
  Percent,
  type LucideIcon,
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
import {
  aggregateClientV2Categories,
  type ClientV2Group,
} from "~/features/sales-commissions-v2/client-v2-presentation";
import {
  formatSalesCommissionV2Cents,
  formatSalesCommissionV2Money,
} from "~/features/sales-commissions-v2/salesperson-v2-presentation";

export function ClientV2Workspace({ client }: { client: ClientV2Group }) {
  const categoryContributions = useMemo(
    () => aggregateClientV2Categories(client),
    [client],
  );
  const readyRecords = client.summary.appointments - client.summary.needsReview;
  const readiness =
    client.summary.appointments === 0
      ? 0
      : Math.round((readyRecords / client.summary.appointments) * 100);

  return (
    <div className="space-y-5">
      <Card className="from-primary/[0.08] via-card to-card border-primary/15 bg-gradient-to-r shadow-sm">
        <CardContent className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <span className="bg-primary text-primary-foreground grid size-14 shrink-0 place-items-center rounded-2xl">
              <Building2 className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-2xl font-medium">
                {client.name}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {client.salespeople.length} salesperson
                {client.salespeople.length === 1 ? "" : " groups"} ·{" "}
                {client.summary.appointments} appointments
              </p>
            </div>
          </div>
          <Badge
            className={
              client.summary.needsAttention > 0
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
            }
          >
            {client.summary.needsAttention > 0
              ? `${client.summary.needsAttention} flagged`
              : "Ready"}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactMetric
          label="Appointments"
          value={client.summary.appointments.toLocaleString()}
          supporting={`${client.summary.showed.toLocaleString()} showed`}
          icon={CalendarCheck}
        />
        <CompactMetric
          label="Show rate"
          value={`${Math.round(client.summary.showRate * 100)}%`}
          supporting={`${client.summary.noShows.toLocaleString()} no-shows`}
          icon={Percent}
        />
        <CompactMetric
          label="Revenue"
          value={formatSalesCommissionV2Money(client.summary.attributedRevenue)}
          supporting="Attributed revenue"
          icon={CircleDollarSign}
        />
        <CompactMetric
          label="Commission"
          value={formatSalesCommissionV2Money(client.summary.commission)}
          supporting={`${client.summary.needsAttention} bookings flagged`}
          icon={HandCoins}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.7fr)]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Category contribution</CardTitle>
            <p className="text-muted-foreground text-sm">
              Attributed revenue by category across this client&apos;s
              salespeople.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {categoryContributions.length ? (
              categoryContributions.map((category) => (
                <div key={category.key}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{category.name}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {category.showed} showed · {category.appointments}{" "}
                        booked · {category.share.toFixed(1)}% of revenue
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {formatSalesCommissionV2Cents(category.revenueCents)}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                        {formatSalesCommissionV2Cents(category.commissionCents)}{" "}
                        commission
                      </p>
                    </div>
                  </div>
                  <div className="bg-muted mt-2.5 h-2.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${category.share}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No category revenue for this client.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Record readiness</CardTitle>
                <p className="text-muted-foreground mt-1 text-sm">
                  Booking records clear of review flags.
                </p>
              </div>
              {client.summary.needsReview > 0 ? (
                <AlertTriangle
                  className="size-5 text-amber-700"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  className="size-5 text-emerald-700"
                  aria-hidden="true"
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-heading text-4xl font-medium tracking-tight">
                  {readiness}%
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {readyRecords} of {client.summary.appointments} records ready
                </p>
              </div>
              <Badge
                variant={
                  client.summary.needsReview === 0 ? "secondary" : "outline"
                }
              >
                {client.summary.needsReview} open
              </Badge>
            </div>
            <div className="bg-muted mt-5 h-2.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${readiness}%` }}
              />
            </div>
            <div className="mt-5 rounded-xl border p-3">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Missed revenue
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatSalesCommissionV2Money(client.summary.missedRevenue)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle>Salesperson performance</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Revenue, commission, no-shows, and flagged bookings by salesperson.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table className="min-w-[72rem]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Salesperson</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Show rate</TableHead>
                <TableHead className="text-right">No-shows</TableHead>
                <TableHead className="text-right">Flagged</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="pr-5 text-right">Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.salespeople.map((person) => (
                <TableRow key={person.id ?? person.name}>
                  <TableCell className="pl-5 font-medium">
                    {person.name}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-80 flex-wrap gap-1.5">
                      {person.categories.map((category) => (
                        <Badge
                          key={category.id ?? `uncategorized-${category.name}`}
                          variant="outline"
                        >
                          {category.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {person.summary.appointments}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(person.summary.showRate * 100)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {person.summary.noShows}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {person.summary.needsAttention}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSalesCommissionV2Money(
                      person.summary.attributedRevenue,
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right font-semibold tabular-nums">
                    {formatSalesCommissionV2Money(person.summary.commission)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CompactMetric({
  label,
  value,
  supporting,
  icon: Icon,
}: {
  label: string;
  value: string;
  supporting: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="gap-3 py-4 shadow-sm">
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{supporting}</p>
        </div>
        <span className="bg-secondary text-secondary-foreground grid size-9 shrink-0 place-items-center rounded-xl">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}
