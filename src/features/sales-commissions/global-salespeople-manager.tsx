import { Search, UsersRound } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Pagination } from "~/features/dashboard/pagination";
import {
  GlobalIdentityActions,
  GlobalSalespersonNameControl,
} from "~/features/sales-commissions/global-salesperson-controls";
import { type RouterOutputs } from "~/trpc/react";

type GlobalSalespeopleResult =
  RouterOutputs["salesCommissions"]["globalSalespeople"];
type GlobalSalesperson = GlobalSalespeopleResult["people"][number];

export function GlobalSalespeopleManager({
  result,
  search,
  searchParams,
}: {
  result: GlobalSalespeopleResult;
  search?: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Global salespeople"
          value={result.summary.globalSalespeople}
        />
        <SummaryCard
          label="Client assignments"
          value={result.summary.clientAssignments}
        />
        <SummaryCard
          label="Across multiple clients"
          value={result.summary.sharedSalespeople}
        />
      </section>

      <Card className="shadow-sage border-border/80 gap-0 rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 border-b px-6 py-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <CardTitle>Global salesperson identities</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Exact GHL user IDs are linked automatically. Different IDs can
                be linked or separated here without changing client data.
              </p>
            </div>
            <form
              action="/dashboard/sales-commissions/setup"
              className="flex w-full max-w-md gap-2"
            >
              <input type="hidden" name="section" value="global" />
              <div className="relative flex-1">
                <Search
                  className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  name="search"
                  defaultValue={search}
                  maxLength={100}
                  placeholder="Search name, client, or GHL identity"
                  className="pl-9"
                />
              </div>
              <Button variant="outline">Search</Button>
            </form>
          </div>
        </CardHeader>
        {result.isTruncated ? (
          <div className="border-border border-b px-6 py-3 text-sm text-amber-800">
            This management list reached its safety limit. Refine the search to
            find a specific salesperson.
          </div>
        ) : null}
        <CardContent className="space-y-4 p-5">
          {result.people.length ? (
            result.people.map((person) => (
              <GlobalSalespersonCard
                key={person.id}
                person={person}
                targetOptions={result.targetOptions}
              />
            ))
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
              <UsersRound className="size-8" aria-hidden="true" />
              No global salespeople match this search.
            </div>
          )}
        </CardContent>
        <Pagination
          pathname="/dashboard/sales-commissions/setup"
          searchParams={searchParams}
          pageKey="globalPage"
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
        />
      </Card>
    </div>
  );
}

function GlobalSalespersonCard({
  person,
  targetOptions,
}: {
  person: GlobalSalesperson;
  targetOptions: GlobalSalespeopleResult["targetOptions"];
}) {
  const identities = groupAssignmentsByExternalIdentity(person);

  return (
    <div className="border-border/80 overflow-hidden rounded-xl border">
      <div className="bg-muted/30 flex flex-col justify-between gap-4 px-5 py-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{person.name}</h3>
            {person.isUnnamed ? (
              <Badge variant="outline">Unnamed</Badge>
            ) : person.displayName ? (
              <Badge variant="secondary">Global display name</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {person.clientCount} client{person.clientCount === 1 ? "" : "s"} ·{" "}
            {person.externalIdentityCount} GHL identit
            {person.externalIdentityCount === 1 ? "y" : "ies"}
          </p>
        </div>
        <GlobalSalespersonNameControl
          globalSalespersonId={person.id}
          displayName={person.displayName}
        />
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[66rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">GHL identity</TableHead>
              <TableHead>GHL name</TableHead>
              <TableHead>Client assignments</TableHead>
              <TableHead>Local display names</TableHead>
              <TableHead className="pr-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {identities.map((identity) => (
              <TableRow key={identity.externalUserId}>
                <TableCell className="pl-5 font-mono text-xs">
                  ••••{identity.externalUserId.slice(-6)}
                </TableCell>
                <TableCell className="font-medium">
                  {identity.providerName ?? "Unnamed / removed user"}
                </TableCell>
                <TableCell>
                  <div className="flex max-w-xl flex-wrap gap-1.5">
                    {identity.assignments.map((assignment) => (
                      <Badge key={assignment.salespersonId} variant="outline">
                        {assignment.clientName}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {identity.localDisplayNames.length
                    ? identity.localDisplayNames.join(", ")
                    : "—"}
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <GlobalIdentityActions
                    salespersonId={identity.salespersonId}
                    currentGlobalSalespersonId={person.id}
                    externalUserIdSuffix={identity.externalUserId.slice(-6)}
                    sourceName={identity.providerName ?? person.name}
                    clientCount={identity.assignments.length}
                    canSeparate={person.externalIdentityCount > 1}
                    targetOptions={targetOptions}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function groupAssignmentsByExternalIdentity(person: GlobalSalesperson) {
  const identities = new Map<
    string,
    {
      externalUserId: string;
      salespersonId: string;
      providerName: string | null;
      localDisplayNames: string[];
      assignments: GlobalSalesperson["assignments"];
    }
  >();
  for (const assignment of person.assignments) {
    const existing = identities.get(assignment.externalUserId);
    if (existing) {
      existing.assignments.push(assignment);
      if (
        assignment.displayName &&
        !existing.localDisplayNames.includes(assignment.displayName)
      ) {
        existing.localDisplayNames.push(assignment.displayName);
      }
      if (!existing.providerName && assignment.providerName) {
        existing.providerName = assignment.providerName;
      }
      continue;
    }
    identities.set(assignment.externalUserId, {
      externalUserId: assignment.externalUserId,
      salespersonId: assignment.salespersonId,
      providerName: assignment.providerName,
      localDisplayNames: assignment.displayName ? [assignment.displayName] : [],
      assignments: [assignment],
    });
  }
  return [...identities.values()].sort((left, right) =>
    (left.providerName ?? left.externalUserId).localeCompare(
      right.providerName ?? right.externalUserId,
    ),
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="shadow-sage border-border/80">
      <CardContent className="p-5">
        <p className="text-muted-foreground text-xs uppercase">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
