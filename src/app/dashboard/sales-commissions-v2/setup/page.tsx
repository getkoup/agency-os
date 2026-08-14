import { ArrowLeft, Settings2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { PageHeader } from "~/features/dashboard/page-header";
import { SalesCommissionV2Setup } from "~/features/sales-commissions-v2/sales-commission-v2-setup";
import { canAccessSalesCommissionV2 } from "~/features/sales-commissions-v2/server/access";
import { getAuthenticatedUser } from "~/server/auth/current-user";
import { api } from "~/trpc/server";

export default async function SalesCommissionV2SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (!(await canAccessSalesCommissionV2(user.role))) notFound();
  const search = await searchParams;
  const rawClientId = Array.isArray(search.clientId)
    ? search.clientId[0]
    : search.clientId;
  const clientId = z.string().uuid().safeParse(rawClientId).data;
  const result = await api.salesCommissionsV2.setup({ clientId });

  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Sales operations setup"
        title="Sales & Commissions v2 Configuration"
        description="Configure structured-field category mapping and one Price-based commission percentage per client."
        meta={
          <Button asChild variant="outline">
            <Link href="/dashboard/sales-commissions-v2">
              <ArrowLeft aria-hidden="true" />
              Back to V2 report
            </Link>
          </Button>
        }
      />
      <div className="border-border bg-muted/30 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
        <Settings2
          className="text-primary mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        V2 settings, client percentages, categories, and mapping rules are
        separate from the existing Sales &amp; Commissions configuration. Shared
        salesperson identities are read-only here.
      </div>
      <SalesCommissionV2Setup result={result} />
    </div>
  );
}
