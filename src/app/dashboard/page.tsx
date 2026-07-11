import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
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
import { DashboardFilters } from "~/features/dashboard/dashboard-filters";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { auth, signOut } from "~/server/auth";
import { getCurrentUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const currentUser = await getCurrentUser(session.user.id).catch(() => null);
  if (!currentUser) redirect("/login");

  const search = resolveDashboardPageSearch(await searchParams);
  const filters = {
    from: search.from,
    to: search.to,
    clientId: search.clientId,
    platform: search.platform,
    campaignId: search.campaignId,
  };
  const [options, overview, performance, leadRows] = await Promise.all([
    api.dashboard.filterOptions({
      from: search.from,
      to: search.to,
      clientId: search.clientId,
      platform: search.platform,
    }),
    api.dashboard.overview(filters),
    api.dashboard.performance({
      ...filters,
      page: search.performancePage,
      pageSize: 50,
    }),
    api.dashboard.leads({ ...filters, page: search.leadPage, pageSize: 50 }),
  ]);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const performancePages = Math.max(1, Math.ceil(performance.total / 50));
  const leadPages = Math.max(1, Math.ceil(leadRows.total / 50));

  return (
    <main className="bg-muted/30 min-h-screen">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">Agency OS</h1>
            <p className="text-muted-foreground text-sm">
              {currentUser.name ?? currentUser.email} ·{" "}
              {currentUser.role.replace("_", " ")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {overview.latestSync ? (
              <Badge variant="outline">Sync {overview.latestSync.status}</Badge>
            ) : null}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="outline" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {currentUser.role === "agency_admin" &&
        overview.latestSync?.status === "failed" ? (
          <Alert variant="destructive">
            <AlertTitle>Latest synchronization failed</AlertTitle>
            <AlertDescription>
              Run the server synchronization command again or inspect server
              logs.
            </AlertDescription>
          </Alert>
        ) : null}

        <DashboardFilters values={filters} options={options} />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [
              "Spend",
              `$${overview.spend}`,
              overview.cpl ? `CPL $${overview.cpl}` : "CPL —",
            ],
            [
              "Platform Leads",
              overview.platformLeads.toLocaleString(),
              "Reported by Windsor",
            ],
            [
              "Captured Leads",
              overview.capturedLeads.toLocaleString(),
              "Individual lead events",
            ],
            [
              "Messaging Conversations",
              overview.messagingConversations.toLocaleString(),
              "Started conversations",
            ],
            [
              "Link Clicks",
              overview.linkClicks.toLocaleString(),
              overview.cpc ? `CPC $${overview.cpc}` : "CPC —",
            ],
          ].map(([title, value, supporting]) => (
            <Card key={title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-muted-foreground text-xs">{supporting}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Daily Performance ({performance.total})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad group</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Clicks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.rows.length ? (
                  performance.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.client ?? "Unassigned"}</TableCell>
                      <TableCell>{row.sourceAccount}</TableCell>
                      <TableCell>{row.campaign}</TableCell>
                      <TableCell>{row.adGroup}</TableCell>
                      <TableCell>{row.ad}</TableCell>
                      <TableCell>${row.spend}</TableCell>
                      <TableCell>{row.platformLeads}</TableCell>
                      <TableCell>{row.messagingConversations}</TableCell>
                      <TableCell>{row.linkClicks}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No performance data for these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={search.performancePage <= 1}
              >
                <Link
                  href={`/dashboard?${new URLSearchParams({ ...Object.fromEntries(query), performancePage: String(Math.max(1, search.performancePage - 1)) })}`}
                >
                  Previous
                </Link>
              </Button>
              <span className="text-sm">
                Page {search.performancePage} of {performancePages}
              </span>
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={search.performancePage >= performancePages}
              >
                <Link
                  href={`/dashboard?${new URLSearchParams({ ...Object.fromEntries(query), performancePage: String(Math.min(performancePages, search.performancePage + 1)) })}`}
                >
                  Next
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Leads ({leadRows.total})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Captured</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Ad group</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadRows.rows.length ? (
                  leadRows.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.occurredAt.toISOString()}</TableCell>
                      <TableCell>{row.client ?? "Unassigned"}</TableCell>
                      <TableCell>{row.sourceAccount}</TableCell>
                      <TableCell>{row.campaign ?? "—"}</TableCell>
                      <TableCell>{row.adGroup ?? "—"}</TableCell>
                      <TableCell>{row.ad ?? "—"}</TableCell>
                      <TableCell>{row.fullName ?? "—"}</TableCell>
                      <TableCell>{row.email ?? "—"}</TableCell>
                      <TableCell>{row.phoneNumber ?? "—"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No leads for these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={search.leadPage <= 1}
              >
                <Link
                  href={`/dashboard?${new URLSearchParams({ ...Object.fromEntries(query), leadPage: String(Math.max(1, search.leadPage - 1)) })}`}
                >
                  Previous
                </Link>
              </Button>
              <span className="text-sm">
                Page {search.leadPage} of {leadPages}
              </span>
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={search.leadPage >= leadPages}
              >
                <Link
                  href={`/dashboard?${new URLSearchParams({ ...Object.fromEntries(query), leadPage: String(Math.min(leadPages, search.leadPage + 1)) })}`}
                >
                  Next
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
