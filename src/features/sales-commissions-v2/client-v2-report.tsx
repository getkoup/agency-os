"use client";

import { Building2, CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { type ClientV2Group } from "~/features/sales-commissions-v2/client-v2-presentation";
import { ClientV2Workspace } from "~/features/sales-commissions-v2/client-v2-workspace";
import { SalesCommissionV2AttentionTable } from "~/features/sales-commissions-v2/sales-commission-v2-attention-table";
import { formatSalesCommissionV2Money } from "~/features/sales-commissions-v2/salesperson-v2-presentation";
import { cn } from "~/lib/utils";
import { type RouterOutputs } from "~/trpc/react";

export function ClientV2Report({
  groups,
  selectedId,
  attentionRows,
  attentionTotal,
  attentionScopes,
  searchParams,
  page,
}: {
  groups: ClientV2Group[];
  selectedId: string | null;
  attentionRows: RouterOutputs["salesCommissionsV2"]["report"]["attentionRows"];
  attentionTotal: number;
  attentionScopes: RouterOutputs["salesCommissionsV2"]["report"]["attentionScopes"];
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
}) {
  const [activeId, setActiveId] = useState(selectedId);
  const [activePage, setActivePage] = useState(page);
  const selectedClient =
    groups.find((client) => client.id === activeId) ?? groups[0];
  const selectedAttentionScope = attentionScopes.find(
    (scope) => scope.key === selectedClient?.id,
  );
  const usesServerPage =
    selectedClient?.id === selectedId && activePage === page;
  const selectedAttentionRows = usesServerPage
    ? attentionRows
    : (selectedAttentionScope?.rows ?? []);
  const selectedAttentionTotal = usesServerPage
    ? attentionTotal
    : (selectedAttentionScope?.total ?? 0);

  if (!selectedClient) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">
          No client results match these filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]"
      aria-label="V2 sales grouped by client"
    >
      <Card className="h-fit gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Clients</CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                Select a client to inspect
              </p>
            </div>
            <span className="bg-secondary grid size-9 place-items-center rounded-xl">
              <Building2 className="size-4" aria-hidden="true" />
            </span>
          </div>
        </CardHeader>
        <CardContent className="max-h-[48rem] space-y-1 overflow-y-auto p-2">
          {groups.map((client) => {
            const isSelected = client === selectedClient;
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  setActiveId(client.id);
                  setActivePage(1);
                  window.history.replaceState(
                    null,
                    "",
                    clientSelectionHref(searchParams, client.id),
                  );
                }}
                aria-pressed={isSelected}
                className={cn(
                  "hover:bg-muted flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  isSelected &&
                    "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                <span
                  className={cn(
                    "bg-secondary text-secondary-foreground grid size-9 shrink-0 place-items-center rounded-full",
                    isSelected &&
                      "bg-primary-foreground/15 text-primary-foreground",
                  )}
                >
                  <Building2 className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {client.name}
                  </span>
                  <span
                    className={cn(
                      "text-muted-foreground mt-0.5 block text-xs",
                      isSelected && "text-primary-foreground/70",
                    )}
                  >
                    {formatSalesCommissionV2Money(
                      client.summary.attributedRevenue,
                    )}{" "}
                    revenue
                  </span>
                </span>
                {client.summary.needsAttention > 0 ? (
                  <span
                    className={cn(
                      "grid min-w-5 place-items-center rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-800",
                      isSelected &&
                        "bg-primary-foreground/15 text-primary-foreground",
                    )}
                  >
                    {client.summary.needsAttention}
                  </span>
                ) : (
                  <CheckCircle2
                    className={cn(
                      "size-4 text-emerald-600",
                      isSelected && "text-primary-foreground",
                    )}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-5">
        <ClientV2Workspace client={selectedClient} />
        <SalesCommissionV2AttentionTable
          rows={selectedAttentionRows}
          total={selectedAttentionTotal}
          searchParams={{
            ...searchParams,
            selectedClientId: selectedClient.id,
          }}
          page={activePage}
        />
      </div>
    </section>
  );
}

function clientSelectionHref(
  search: Record<string, string | string[] | undefined>,
  selectedId: string,
) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    } else if (value !== undefined) {
      next.set(key, value);
    }
  }
  next.set("selectedClientId", selectedId);
  next.delete("selectedGlobalSalespersonKey");
  next.set("salesCommissionV2Page", "1");
  return `/dashboard/sales-commissions-v2?${next.toString()}`;
}
