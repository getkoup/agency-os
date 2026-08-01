import { ArrowLeft, Settings2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { PageHeader } from "~/features/dashboard/page-header";
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
  const rawClientId = Array.isArray(search.clientId)
    ? search.clientId[0]
    : search.clientId;
  const clientId = z.string().uuid().safeParse(rawClientId).data;
  const result = await api.salesCommissions.setup({ clientId });

  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <PageHeader
        eyebrow="Sales operations setup"
        title="Commission Configuration"
        description="Configure attribution, salesperson names, service categories, offers, and fixed commission rates by client."
        meta={
          <Button asChild variant="outline">
            <Link href="/dashboard/sales-commissions">
              <ArrowLeft aria-hidden="true" />
              Back to report
            </Link>
          </Button>
        }
      />
      <div className="border-border bg-muted/30 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
        <Settings2
          className="text-primary mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        GHL user tokens do not currently expose user-profile names. Newly
        observed salespeople receive a safe placeholder until renamed here.
      </div>
      <SalesCommissionSetup result={result} />
    </div>
  );
}
