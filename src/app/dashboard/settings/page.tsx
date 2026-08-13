import Link from "next/link";
import {
  Building2,
  Clock3,
  HandCoins,
  ListFilter,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { PageHeader } from "~/features/dashboard/page-header";
import { Pagination } from "~/features/dashboard/pagination";
import { resolveDashboardPageSearch } from "~/features/dashboard/page-search";
import { AgencyReportingTimezoneForm } from "~/features/settings/agency-reporting-timezone-form";
import { GhlConfigurationManager } from "~/features/settings/ghl-configuration-manager";
import { LeadClassificationManager } from "~/features/settings/lead-classification-manager";
import { RevenueRuleManager } from "~/features/settings/revenue-rule-manager";
import { SalesCommissionsV2AccessForm } from "~/features/settings/sales-commissions-v2-access-form";
import { getReportingTimezoneOptions } from "~/features/settings/reporting-timezone";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

const optionalUuid = z.string().uuid().optional();
const optionalStatus = z.enum(["active", "inactive"]).optional();

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (user.role !== "owner" && user.role !== "admin") notFound();
  const rawSearch = await searchParams;
  const search = resolveDashboardPageSearch(rawSearch);
  const rawClientId = Array.isArray(rawSearch.settingsClientId)
    ? rawSearch.settingsClientId[0]
    : rawSearch.settingsClientId;
  const rawStatus = Array.isArray(rawSearch.ruleStatus)
    ? rawSearch.ruleStatus[0]
    : rawSearch.ruleStatus;
  const rawClassificationClientId = Array.isArray(
    rawSearch.classificationClientId,
  )
    ? rawSearch.classificationClientId[0]
    : rawSearch.classificationClientId;
  const clientId = optionalUuid.safeParse(rawClientId).data;
  const classificationClientId = optionalUuid.safeParse(
    rawClassificationClientId,
  ).data;
  const status = optionalStatus.safeParse(rawStatus).data;
  const [
    reportingSettings,
    classificationRules,
    rules,
    ghlStatus,
    salesCommissionsV2Access,
  ] = await Promise.all([
    api.settings.reportingTimezone(),
    api.settings.leadClassificationRules({
      clientId: classificationClientId,
      limit: 100,
    }),
    api.settings.revenueRules({
      clientId,
      status,
      page: search.rulePage,
      pageSize: 25,
    }),
    user.role === "owner"
      ? api.settings.ghlConfigurationStatus()
      : Promise.resolve([]),
    api.settings.salesCommissionsV2Access(),
  ]);
  const operations = [
    {
      title: "Clients",
      description:
        "Manage workspaces, account assignments, and reporting ownership.",
      href: "/dashboard/clients",
      icon: Building2,
      available: true,
    },
    {
      title: "Synchronization",
      description:
        "Run universal synchronization and inspect both history views.",
      href: "/dashboard/synchronization",
      icon: RefreshCw,
      available: true,
    },
    {
      title: "Users & Access",
      description: "Manage roles, memberships, and credentials.",
      href: "/dashboard/users",
      icon: Users,
      available: user.role === "owner",
    },
  ];

  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Agency operations"
        title="Settings"
        description="Agency reporting, operational destinations, revenue rules, and redacted integration health."
      />
      <section className="grid gap-4 md:grid-cols-3">
        {operations.map((operation) => {
          const Icon = operation.icon;
          const content = (
            <Card className="shadow-sage border-border/80 hover:border-primary/30 h-full rounded-[1.25rem] transition-colors">
              <CardContent className="space-y-3 p-5">
                <div className="bg-secondary text-primary grid size-10 place-items-center rounded-xl">
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{operation.title}</h2>
                    {!operation.available ? (
                      <Badge variant="secondary">Owner only</Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    {operation.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
          return operation.available ? (
            <Link key={operation.title} href={operation.href}>
              {content}
            </Link>
          ) : (
            <div key={operation.title} aria-disabled="true">
              {content}
            </div>
          );
        })}
      </section>
      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary ring-primary/10 grid size-10 shrink-0 place-items-center rounded-[0.625rem] ring-1">
              <Clock3 className="size-5" />
            </span>
            <div>
              <CardTitle className="tracking-tight">
                Reporting timezone
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                One calendar-day boundary for every client dashboard and report.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <AgencyReportingTimezoneForm
            initialTimezone={reportingSettings.reportingTimezone}
            timezones={getReportingTimezoneOptions()}
          />
        </CardContent>
      </Card>
      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary ring-primary/10 grid size-10 shrink-0 place-items-center rounded-[0.625rem] ring-1">
              <ListFilter className="size-5" />
            </span>
            <div>
              <CardTitle className="tracking-tight">
                Lead classification
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Per-client campaign keyword priorities for form and DM lead
                reporting.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <LeadClassificationManager
            result={classificationRules}
            canManage={user.role === "owner"}
          />
        </CardContent>
      </Card>
      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary ring-primary/10 grid size-10 shrink-0 place-items-center rounded-[0.625rem] ring-1">
              <Tags className="size-5" />
            </span>
            <div>
              <CardTitle className="tracking-tight">Revenue rules</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Case-insensitive GHL tag mappings. USD only.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <RevenueRuleManager result={rules} />
        </CardContent>
        <Pagination
          pathname="/dashboard/settings"
          searchParams={rawSearch}
          pageKey="rulePage"
          page={search.rulePage}
          pageSize={25}
          total={rules.total}
        />
      </Card>
      {user.role === "owner" ? (
        <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
          <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary ring-primary/10 grid size-10 shrink-0 place-items-center rounded-[0.625rem] ring-1">
                <HandCoins className="size-5" />
              </span>
              <div>
                <CardTitle className="tracking-tight">
                  Sales &amp; Commissions v2 access
                </CardTitle>
                <p className="text-muted-foreground mt-1 text-sm">
                  Keep the new report owner-only or opt admins into the rollout.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <SalesCommissionsV2AccessForm
              initialAdminEnabled={salesCommissionsV2Access.adminEnabled}
            />
          </CardContent>
        </Card>
      ) : null}
      {user.role === "owner" ? (
        <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
          <CardHeader className="border-border/70 from-primary/[0.06] via-secondary/30 to-card border-b bg-gradient-to-r px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary ring-primary/10 grid size-10 shrink-0 place-items-center rounded-[0.625rem] ring-1">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <CardTitle className="tracking-tight">
                  Per-client GoHighLevel configuration
                </CardTitle>
                <p className="text-muted-foreground mt-1 text-sm">
                  Owner-only Location ID and encrypted token management.
                  Timezones are fetched automatically from GHL.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 py-2">
            <GhlConfigurationManager rows={ghlStatus} />
          </CardContent>
        </Card>
      ) : null}
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Settings2 className="size-3.5" /> Integration secrets remain encrypted
        and are never returned by this page.
      </p>
    </div>
  );
}
