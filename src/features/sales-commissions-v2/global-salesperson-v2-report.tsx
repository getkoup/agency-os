import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { type RouterOutputs } from "~/trpc/react";

type GlobalSalespersonGroup =
  RouterOutputs["salesCommissionsV2"]["report"]["globalSalespersonGroups"][number];

export function GlobalSalespersonV2Report({
  groups,
}: {
  groups: GlobalSalespersonGroup[];
}) {
  if (!groups.length) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">
          No global salesperson results match these filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-label="V2 sales grouped by salesperson">
      {groups.map((person, index) => (
        <details
          key={person.id ?? `unassigned-${index}`}
          open={groups.length === 1 || index === 0}
          className="group/person border-border/80 bg-card overflow-hidden rounded-[1.1rem] border shadow-sm"
        >
          <summary className="from-primary/[0.06] via-secondary/25 to-card hover:from-primary/[0.1] cursor-pointer list-none bg-gradient-to-r px-5 py-4 [&::-webkit-details-marker]:hidden">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold tracking-tight">
                    {person.name}
                  </h2>
                  {person.isUnnamed ? (
                    <Badge variant="outline">Unnamed</Badge>
                  ) : person.hasCustomDisplayName ? (
                    <Badge variant="secondary">Global display name</Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {person.clients.length} client
                  {person.clients.length === 1 ? "" : "s"} ·{" "}
                  {person.summary.appointments} appointments
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <SummaryValue
                  label="Showed"
                  value={String(person.summary.showed)}
                />
                <SummaryValue
                  label="Revenue"
                  value={`$${person.summary.attributedRevenue}`}
                />
                <SummaryValue
                  label="Missed"
                  value={`$${person.summary.missedRevenue}`}
                />
                <SummaryValue
                  label="Commission"
                  value={`$${person.summary.commission}`}
                />
              </div>
            </div>
          </summary>
          <div className="border-border/70 overflow-x-auto border-t">
            <Table className="min-w-[64rem]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-5">Client</TableHead>
                  <TableHead>Client salesperson name</TableHead>
                  <TableHead className="text-right">Booked</TableHead>
                  <TableHead className="text-right">Showed</TableHead>
                  <TableHead className="text-right">No-show</TableHead>
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
                    <TableCell className="text-right tabular-nums">
                      {client.summary.appointments}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {client.summary.showed}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {client.summary.noShows}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(client.summary.showRate * 100)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${client.summary.attributedRevenue}
                    </TableCell>
                    <TableCell className="pr-5 text-right font-semibold tabular-nums">
                      ${client.summary.commission}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ))}
    </section>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-muted-foreground text-[0.6875rem] uppercase">
        {label}
      </p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
