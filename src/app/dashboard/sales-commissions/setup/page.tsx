import { ArrowLeft, Settings2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { PageHeader } from "~/features/dashboard/page-header";
import { GlobalSalespeopleManager } from "~/features/sales-commissions/global-salespeople-manager";
import { SalesCommissionSetup } from "~/features/sales-commissions/sales-commission-setup";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

export default async function SalesCommissionSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (user.role !== "owner" && user.role !== "admin") notFound();
  const search = await searchParams;
  const firstValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const section = firstValue(search.section) === "global" ? "global" : "client";
  const clientId = z
    .string()
    .uuid()
    .safeParse(firstValue(search.clientId)).data;
  const globalPage = z.coerce
    .number()
    .int()
    .positive()
    .catch(1)
    .parse(firstValue(search.globalPage));
  const globalSearch = z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .parse(firstValue(search.search));
  const globalResult =
    section === "global"
      ? await api.salesCommissions.globalSalespeople({
          search: globalSearch,
          page: globalPage,
          pageSize: 25,
        })
      : null;
  const clientResult =
    section === "client"
      ? await api.salesCommissions.setup({ clientId })
      : null;

  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Sales operations setup"
        title="Commission Configuration"
        description="Configure client commission rules and link shared salesperson identities across clients."
        meta={
          <Button asChild variant="outline">
            <Link href="/dashboard/sales-commissions">
              <ArrowLeft aria-hidden="true" />
              Back to report
            </Link>
          </Button>
        }
      />
      <div className="border-border bg-card flex flex-wrap gap-2 rounded-xl border p-2">
        <Button asChild variant={section === "client" ? "default" : "ghost"}>
          <Link href="/dashboard/sales-commissions/setup">Client setup</Link>
        </Button>
        <Button asChild variant={section === "global" ? "default" : "ghost"}>
          <Link href="/dashboard/sales-commissions/setup?section=global">
            Global salespeople
          </Link>
        </Button>
      </div>
      <div className="border-border bg-muted/30 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
        <Settings2
          className="text-primary mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        {section === "client"
          ? "GHL names synchronize when the client token has Users Read access. An optional display name changes Agency OS only and never updates GHL."
          : "Linking changes only the cross-client grouping. Existing appointments, client reports, offers, and commission rates stay attached to their client records."}
      </div>
      {globalResult ? (
        <GlobalSalespeopleManager
          result={globalResult}
          search={globalSearch}
          searchParams={search}
        />
      ) : clientResult ? (
        <SalesCommissionSetup result={clientResult} />
      ) : null}
    </div>
  );
}
