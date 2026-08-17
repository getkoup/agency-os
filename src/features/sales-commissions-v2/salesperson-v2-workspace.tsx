import { useMemo } from "react";
import {
  AlertTriangle,
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
  aggregateSalespersonV2Categories,
  formatSalesCommissionV2Cents,
  formatSalesCommissionV2Money,
  getSalespersonInitials,
  type GlobalSalespersonV2Group,
} from "~/features/sales-commissions-v2/salesperson-v2-presentation";

export function SalespersonV2Workspace({
  person,
}: {
  person: GlobalSalespersonV2Group;
}) {
  const categoryContributions = useMemo(
    () => aggregateSalespersonV2Categories(person),
    [person],
  );
  const readyRecords = person.summary.appointments - person.summary.needsReview;
  const readiness =
    person.summary.appointments === 0
      ? 0
      : Math.round((readyRecords / person.summary.appointments) * 100);

  return (
    <div className="space-y-5">
      <Card className="from-primary/[0.08] via-card to-card border-primary/15 bg-gradient-to-r shadow-sm">
        <CardContent className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <span className="bg-primary text-primary-foreground grid size-14 shrink-0 place-items-center rounded-2xl text-sm font-semibold">
              {getSalespersonInitials(person.name)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-2xl font-medium">
                  {person.name}
                </h2>
                {person.isUnnamed ? (
                  <Badge variant="outline">Unnamed</Badge>
                ) : person.hasCustomDisplayName ? (
                  <Badge variant="secondary">Global display name</Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {person.clients.length} client
                {person.clients.length === 1 ? "" : "s"} ·{" "}
                {person.summary.appointments} appointments
              </p>
            </div>
          </div>
          <Badge
            className={
              person.summary.needsReview > 0
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
            }
          >
            {person.summary.needsReview > 0
              ? `${person.summary.needsReview} need review`
              : "Ready"}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactMetric
          label="Appointments"
          value={person.summary.appointments.toLocaleString()}
          supporting={`${person.summary.showed.toLocaleString()} showed`}
          icon={CalendarCheck}
        />
        <CompactMetric
          label="Show rate"
          value={`${Math.round(person.summary.showRate * 100)}%`}
          supporting={`${person.summary.noShows.toLocaleString()} no-shows`}
          icon={Percent}
        />
        <CompactMetric
          label="Revenue"
          value={formatSalesCommissionV2Money(person.summary.attributedRevenue)}
          supporting="Attributed revenue"
          icon={CircleDollarSign}
        />
        <CompactMetric
          label="Commission"
          value={formatSalesCommissionV2Money(person.summary.commission)}
          supporting={`${person.summary.needsReview} records need review`}
          icon={HandCoins}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.7fr)]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Category contribution</CardTitle>
            <p className="text-muted-foreground text-sm">
              Attributed revenue by category across this salesperson&apos;s
              clients.
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
                No category revenue for this salesperson.
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
              {person.summary.needsReview > 0 ? (
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
                  {readyRecords} of {person.summary.appointments} records ready
                </p>
              </div>
              <Badge
                variant={
                  person.summary.needsReview === 0 ? "secondary" : "outline"
                }
              >
                {person.summary.needsReview} open
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
                {formatSalesCommissionV2Money(person.summary.missedRevenue)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle>Client performance</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Revenue, commission, and attribution by client account.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table className="min-w-[68rem]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-5">Client</TableHead>
                <TableHead>Client salesperson name</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Show rate</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="pr-5 text-right">Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {person.clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="pl-5 font-medium">
                    {client.name}
                  </TableCell>
                  <TableCell>
                    {client.localSalespersonNames.length
                      ? client.localSalespersonNames.join(", ")
                      : "Unassigned / widget"}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-80 flex-wrap gap-1.5">
                      {client.categories.map((category) => (
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
                    {client.summary.appointments}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(client.summary.showRate * 100)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSalesCommissionV2Money(
                      client.summary.attributedRevenue,
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right font-semibold tabular-nums">
                    {formatSalesCommissionV2Money(client.summary.commission)}
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
    <Card className="gap-3 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {label}
        </p>
        <Icon className="text-primary size-4" aria-hidden="true" />
      </div>
      <p className="font-heading text-2xl font-medium tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground text-xs">{supporting}</p>
    </Card>
  );
}
