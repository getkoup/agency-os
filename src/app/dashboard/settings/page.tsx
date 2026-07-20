import Link from "next/link";
import {
  Building2,
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
import { GhlConfigurationManager } from "~/features/settings/ghl-configuration-manager";
import { LeadClassificationManager } from "~/features/settings/lead-classification-manager";
import { RevenueRuleManager } from "~/features/settings/revenue-rule-manager";
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
  const [classificationRules, rules, ghlStatus] = await Promise.all([
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
        description="Operational destinations, revenue rules, and redacted integration health."
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
      <Card className="shadow-sage border-border/80 gap-3 rounded-[1.25rem] py-5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <ListFilter className="text-primary size-5" />
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
        <CardContent>
          <LeadClassificationManager
            result={classificationRules}
            canManage={user.role === "owner"}
          />
        </CardContent>
      </Card>
      <Card className="shadow-sage border-border/80 gap-3 rounded-[1.25rem] py-5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Tags className="text-primary size-5" />
            <div>
              <CardTitle className="tracking-tight">Revenue rules</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Case-insensitive GHL tag mappings. USD only.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
        <Card className="shadow-sage border-border/80 gap-3 overflow-hidden rounded-[1.25rem] py-5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-primary size-5" />
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
          <CardContent className="px-0">
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
