import {
  AlertTriangle,
  CalendarCheck,
  CircleDollarSign,
  HandCoins,
  Percent,
  ReceiptText,
  UsersRound,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { MetricCard } from "~/features/dashboard/metric-card";
import { PageHeader } from "~/features/dashboard/page-header";
import { ClientV2Report } from "~/features/sales-commissions-v2/client-v2-report";
import { GlobalSalespersonV2Report } from "~/features/sales-commissions-v2/global-salesperson-v2-report";
import { SalesCommissionV2Filters } from "~/features/sales-commissions-v2/sales-commission-v2-filters";
import { canAccessSalesCommissionV2 } from "~/features/sales-commissions-v2/server/access";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

const searchSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  view: z.enum(["client", "salesperson"]).default("salesperson"),
  clientId: z.string().uuid().optional(),
  globalSalespersonId: z
    .union([z.string().uuid(), z.literal("unassigned")])
    .optional(),
  appointmentStatus: z
    .enum(["new", "confirmed", "showed", "cancelled", "noshow", "invalid"])
    .optional(),
  categoryId: z.string().uuid().optional(),
  review: z.enum(["ready", "needs_review"]).optional(),
  selectedGlobalSalespersonKey: z.string().min(1).max(100).optional(),
  selectedClientId: z.string().uuid().optional(),
  salesCommissionV2Page: z.coerce.number().int().positive().default(1),
});

function defaultDates(today: string) {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function reportViewHref(
  search: Record<string, string | string[] | undefined>,
  view: "client" | "salesperson",
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    } else if (value !== undefined) {
      next.set(key, value);
    }
  }
  next.set("view", view);
  if (view === "salesperson") next.delete("globalSalespersonId");
  else next.delete("clientId");
  next.delete("selectedGlobalSalespersonKey");
  next.delete("selectedClientId");
  next.set("salesCommissionV2Page", "1");
  return `/dashboard/sales-commissions-v2?${next.toString()}`;
}

export default async function SalesCommissionsV2Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (!(await canAccessSalesCommissionV2(user.role))) notFound();
  const [rawSearch, reportingContext] = await Promise.all([
    searchParams,
    api.dashboard.reportingContext(),
  ]);
  const defaults = defaultDates(reportingContext.today);
  const parsed = searchSchema.safeParse({
    from: rawSearch.from ?? defaults.from,
    to: rawSearch.to ?? defaults.to,
    view: rawSearch.view,
    clientId: rawSearch.clientId,
    globalSalespersonId: rawSearch.globalSalespersonId,
    appointmentStatus: rawSearch.appointmentStatus,
    categoryId: rawSearch.categoryId,
    review: rawSearch.review,
    selectedGlobalSalespersonKey: rawSearch.selectedGlobalSalespersonKey,
    selectedClientId: rawSearch.selectedClientId,
    salesCommissionV2Page: rawSearch.salesCommissionV2Page,
  });
  const search = parsed.success
    ? parsed.data
    : searchSchema.parse({ ...defaults, salesCommissionV2Page: 1 });
  const report = await api.salesCommissionsV2.report({
    from: search.from,
    to: search.to,
    clientId: search.clientId,
    globalSalespersonId: search.globalSalespersonId,
    status: search.appointmentStatus,
    categoryId: search.categoryId,
    review: search.review,
    attentionView: search.view,
    selectedGlobalSalespersonKey: search.selectedGlobalSalespersonKey,
    selectedClientId: search.selectedClientId,
    page: search.salesCommissionV2Page,
    pageSize: 25,
  });
  const canConfigure = user.role === "owner" || user.role === "admin";

  return (
    <div className="mx-auto max-w-[112rem] space-y-7">
      <PageHeader
        eyebrow="Sales operations"
        title="Sales & Commissions v2"
        description="Booking-date reporting for structured Price revenue with one configurable commission percentage per client."
        meta={
          canConfigure ? (
            <Button asChild>
              <Link href="/dashboard/sales-commissions-v2/setup">
                Configure
              </Link>
            </Button>
          ) : (
            <Badge variant="secondary">Read only</Badge>
          )
        }
      />
      <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-2">
        <div className="px-2">
          <p className="text-sm font-semibold">Group report</p>
          <p className="text-muted-foreground text-xs">
            Switch the breakdown; each view shows only its useful cross-filter.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            asChild
            variant={search.view === "salesperson" ? "default" : "ghost"}
          >
            <Link href={reportViewHref(rawSearch, "salesperson")}>
              <UsersRound aria-hidden="true" /> By salesperson
            </Link>
          </Button>
          <Button
            asChild
            variant={search.view === "client" ? "default" : "ghost"}
          >
            <Link href={reportViewHref(rawSearch, "client")}>
              <ReceiptText aria-hidden="true" /> By client
            </Link>
          </Button>
        </div>
      </div>
      <SalesCommissionV2Filters
        view={search.view}
        values={{
          from: search.from,
          to: search.to,
          clientId: search.clientId,
          globalSalespersonId: search.globalSalespersonId,
          status: search.appointmentStatus,
          categoryId: search.categoryId,
          review: search.review,
        }}
        options={{
          ...report.options,
          reportingTimezone: report.reportingTimezone,
          today: report.today,
        }}
      />
      {report.isTruncated ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          This range exceeds 10,000 appointments. Narrow the dates or client to
          keep totals complete.
        </div>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Appointments"
          value={report.summary.appointments.toLocaleString()}
          supporting={`${report.summary.showed.toLocaleString()} showed`}
          icon={CalendarCheck}
        />
        <MetricCard
          label="Show Rate"
          value={`${Math.round(report.summary.showRate * 100)}%`}
          supporting={`${report.summary.noShows.toLocaleString()} no-shows`}
          icon={Percent}
        />
        <MetricCard
          label="Attributed Revenue"
          value={`$${report.summary.attributedRevenue}`}
          supporting="Valid Price on showed bookings"
          icon={CircleDollarSign}
          highlighted
        />
        <MetricCard
          label="Earned Commission"
          value={`$${report.summary.commission}`}
          supporting="One fixed category rate"
          icon={HandCoins}
          highlighted
        />
        <MetricCard
          label="Potential Missed Revenue"
          value={`$${report.summary.missedRevenue}`}
          supporting="Valid Price on no-shows"
          icon={ReceiptText}
        />
        <MetricCard
          label="Showed"
          value={report.summary.showed.toLocaleString()}
          supporting="Revenue-eligible status"
          icon={UserRoundCheck}
        />
        <MetricCard
          label="No-shows"
          value={report.summary.noShows.toLocaleString()}
          supporting="Commission is always $0"
          icon={UserRoundX}
        />
        <MetricCard
          label="Needs Review"
          value={report.summary.needsReview.toLocaleString()}
          supporting="Legacy, invalid, or unmapped"
          icon={AlertTriangle}
        />
      </section>

      {search.view === "salesperson" ? (
        <GlobalSalespersonV2Report
          key={`salesperson:${report.attentionSelectionKey ?? "none"}:${search.salesCommissionV2Page}`}
          groups={report.globalSalespersonGroups}
          selectedKey={report.attentionSelectionKey}
          attentionRows={report.attentionRows}
          attentionTotal={report.attentionTotal}
          attentionScopes={report.attentionScopes}
          searchParams={rawSearch}
          page={search.salesCommissionV2Page}
        />
      ) : (
        <ClientV2Report
          key={`client:${report.attentionSelectionKey ?? "none"}:${search.salesCommissionV2Page}`}
          groups={report.clientGroups}
          selectedId={report.attentionSelectionKey}
          attentionRows={report.attentionRows}
          attentionTotal={report.attentionTotal}
          attentionScopes={report.attentionScopes}
          searchParams={rawSearch}
          page={search.salesCommissionV2Page}
        />
      )}
    </div>
  );
}
