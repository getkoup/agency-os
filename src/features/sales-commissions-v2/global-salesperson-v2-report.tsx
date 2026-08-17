"use client";

import { useState } from "react";
import { CheckCircle2, UsersRound } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  formatSalesCommissionV2Money,
  getSalespersonInitials,
  type GlobalSalespersonV2Group,
} from "~/features/sales-commissions-v2/salesperson-v2-presentation";
import { SalespersonV2Workspace } from "~/features/sales-commissions-v2/salesperson-v2-workspace";
import { cn } from "~/lib/utils";

export function GlobalSalespersonV2Report({
  groups,
}: {
  groups: GlobalSalespersonV2Group[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedPerson =
    groups.find(
      (person, index) => salespersonKey(person, index) === selectedKey,
    ) ?? groups[0];

  if (!selectedPerson) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-sm">
          No global salesperson results match these filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]"
      aria-label="V2 sales grouped by salesperson"
    >
      <Card className="h-fit gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Sales team</CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                Select a person to inspect
              </p>
            </div>
            <span className="bg-secondary grid size-9 place-items-center rounded-xl">
              <UsersRound className="size-4" aria-hidden="true" />
            </span>
          </div>
        </CardHeader>
        <CardContent className="max-h-[48rem] space-y-1 overflow-y-auto p-2">
          {groups.map((person, index) => {
            const key = salespersonKey(person, index);
            const isSelected = person === selectedPerson;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                aria-pressed={isSelected}
                className={cn(
                  "hover:bg-muted flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  isSelected &&
                    "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                <span
                  className={cn(
                    "bg-secondary text-secondary-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    isSelected &&
                      "bg-primary-foreground/15 text-primary-foreground",
                  )}
                >
                  {getSalespersonInitials(person.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {person.name}
                  </span>
                  <span
                    className={cn(
                      "text-muted-foreground mt-0.5 block text-xs",
                      isSelected && "text-primary-foreground/70",
                    )}
                  >
                    {formatSalesCommissionV2Money(
                      person.summary.attributedRevenue,
                    )}{" "}
                    revenue
                  </span>
                </span>
                {person.summary.needsReview > 0 ? (
                  <span
                    className={cn(
                      "grid min-w-5 place-items-center rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-800",
                      isSelected &&
                        "bg-primary-foreground/15 text-primary-foreground",
                    )}
                  >
                    {person.summary.needsReview}
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

      <SalespersonV2Workspace person={selectedPerson} />
    </section>
  );
}

function salespersonKey(person: GlobalSalespersonV2Group, index: number) {
  return person.id ?? `${person.name}:${index}`;
}
