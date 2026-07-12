import Link from "next/link";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { AccountFilters } from "~/features/dashboard/account-filters";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { AccountAssignment } from "~/features/management/account-assignment";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

const searchSchema = z.object({
  query: z.string().optional(),
  status: z.enum(["active", "disconnected", "ignored"]).optional(),
  assignment: z.enum(["assigned", "unassigned"]).optional(),
  accountPage: z.coerce.number().int().positive().default(1),
});

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const base = resolveDashboardPageSearch(raw);
  const search = searchSchema.parse(raw);
  const user = await getAuthenticatedUser();
  const [options, accounts, managed, clientOptions] = await Promise.all([
    api.dashboard.filterOptions({
      from: base.from,
      to: base.to,
      clientId: base.clientId,
      platform: base.platform,
    }),
    api.dashboard.sourceAccounts({
      query: search.query,
      clientId: base.clientId,
      platform: base.platform,
      status: search.status,
      assignment: search.assignment,
      page: search.accountPage,
      pageSize: 25,
    }),
    user.role === "owner"
      ? api.management.accountAssignments({
          query: search.query,
          clientId: base.clientId,
          platform: base.platform,
          status: search.status,
          assignment: search.assignment,
          page: search.accountPage,
          pageSize: 25,
        })
      : Promise.resolve(null),
    user.role === "owner"
      ? api.management.clientOptions({ limit: 50 })
      : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-primary text-sm font-medium">Inventory</p>
        <h1 className="text-3xl font-semibold">Source accounts</h1>
        <p className="text-muted-foreground">
          Connection health and client ownership for accessible accounts.
        </p>
      </div>
      <AccountFilters
        clients={options.clients}
        platforms={options.platforms}
        includeUnassigned={options.includeUnassigned}
      />
      <Card>
        <CardHeader>
          <CardTitle>Accounts ({accounts.total})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:hidden">
            {accounts.rows.map((row) => (
              <Card key={row.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex justify-between gap-3">
                    <strong>{row.name}</strong>
                    <Badge variant="outline">{row.status}</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {row.client?.name ?? "Unassigned"} · {row.platform}
                  </p>
                  {managed ? (
                    <AccountAssignment
                      sourceAccountId={row.id}
                      currentClientId={row.client?.id ?? null}
                      clients={clientOptions}
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sync</TableHead>
                  {managed ? <TableHead>Client access</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.rows.length ? (
                  accounts.rows.map((row) => {
                    const management = managed?.rows.find(
                      ({ id }) => id === row.id,
                    );
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.name}
                          <div className="text-muted-foreground text-xs">
                            {row.connector}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.client?.name ?? "Unassigned"}
                        </TableCell>
                        <TableCell>{row.platform}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {row.lastSyncedAt?.toISOString() ?? "—"}
                        </TableCell>
                        {managed ? (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <AccountAssignment
                                sourceAccountId={row.id}
                                currentClientId={row.client?.id ?? null}
                                clients={clientOptions}
                              />
                              {management?.client &&
                              management.clientUserCount === 0 ? (
                                <>
                                  <Badge variant="destructive">
                                    No client users
                                  </Badge>
                                  <Button asChild size="sm" variant="ghost">
                                    <Link
                                      href={`/dashboard/users?clientId=${management.client.id}`}
                                    >
                                      Add client user
                                    </Link>
                                  </Button>
                                </>
                              ) : management?.client ? (
                                <Button asChild size="sm" variant="ghost">
                                  <Link
                                    href={`/dashboard/users?clientId=${management.client.id}`}
                                  >
                                    {management.clientUserCount} users
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground py-12 text-center"
                    >
                      No accounts match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
