import Link from "next/link";
import { WalletCards } from "lucide-react";
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
import { EmptyState } from "~/features/dashboard/empty-state";
import { PageHeader } from "~/features/dashboard/page-header";
import { Pagination } from "~/features/dashboard/pagination";
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
  const canManage = user.role === "owner";
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
    canManage
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
    canManage
      ? api.management.clientOptions({ limit: 50 })
      : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Inventory"
        title="Source accounts"
        description="Connection health, client ownership, and access across your ad account portfolio."
      />
      <AccountFilters
        clients={options.clients}
        platforms={options.platforms}
        includeUnassigned={options.includeUnassigned}
      />
      <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
        <CardHeader>
          <CardTitle className="tracking-tight">
            Accounts ({accounts.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="grid gap-3 px-5 lg:hidden">
            {accounts.rows.map((row) => (
              <Card
                key={row.id}
                className="border-border/80 rounded-[1.1rem] shadow-none"
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex justify-between gap-3">
                    <strong>{row.name}</strong>
                    <Badge
                      variant={
                        row.status === "disconnected"
                          ? "destructive"
                          : "secondary"
                      }
                      className="capitalize"
                    >
                      {row.status}
                    </Badge>
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
          <div className="hidden overflow-x-auto lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Account</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sync</TableHead>
                  {managed ? <TableHead>Client access</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.rows.length
                  ? accounts.rows.map((row) => {
                      const management = managed?.rows.find(
                        ({ id }) => id === row.id,
                      );
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="pl-6 font-medium">
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
                            <Badge
                              variant={
                                row.status === "disconnected"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="capitalize"
                            >
                              {row.status}
                            </Badge>
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
                  : null}
              </TableBody>
            </Table>
          </div>
          {!accounts.rows.length ? (
            <EmptyState
              icon={WalletCards}
              title="No accounts found"
              description="No source accounts match the current filters."
            />
          ) : null}
        </CardContent>
        <Pagination
          pathname="/dashboard/accounts"
          searchParams={raw}
          pageKey="accountPage"
          page={search.accountPage}
          pageSize={25}
          total={accounts.total}
        />
      </Card>
    </div>
  );
}
