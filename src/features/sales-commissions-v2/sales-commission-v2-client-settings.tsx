"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";

type AttributionMode =
  "created_by" | "assigned_user" | "created_by_then_assigned";

export function SalesCommissionV2ClientSettings({
  clientId,
  attributionMode,
  commissionPercentage,
}: {
  clientId: string;
  attributionMode: AttributionMode;
  commissionPercentage: string | null;
}) {
  const router = useRouter();
  const [selectedAttributionMode, setSelectedAttributionMode] =
    useState(attributionMode);
  const [percentage, setPercentage] = useState(commissionPercentage ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = api.salesCommissionsV2.saveSettings.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (result) => setError(result.message),
  });
  const percentageIsValid = /^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(
    percentage,
  );
  const isDirty =
    selectedAttributionMode !== attributionMode ||
    percentage !== (commissionPercentage ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!percentageIsValid) return;
        save.mutate({
          clientId,
          attributionMode: selectedAttributionMode,
          commissionPercentage: percentage,
        });
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Credited salesperson source</Label>
          <Select
            value={selectedAttributionMode}
            onValueChange={(next) =>
              setSelectedAttributionMode(next as AttributionMode)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_by">Created by</SelectItem>
              <SelectItem value="assigned_user">Assigned user</SelectItem>
              <SelectItem value="created_by_then_assigned">
                Created by, then assigned fallback
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="v2-client-commission-percentage">
            Commission percentage
          </Label>
          <div className="relative">
            <Input
              id="v2-client-commission-percentage"
              className="pr-9"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="10"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
              %
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          The percentage applies to parsed Price revenue for every showed
          appointment credited to a salesperson. Category does not change the
          rate.
        </p>
        <Button
          type="submit"
          disabled={save.isPending || !percentageIsValid || !isDirty}
        >
          {save.isPending ? "Saving..." : "Save client commission"}
        </Button>
      </div>
      {percentage && !percentageIsValid ? (
        <p className="text-destructive text-xs">
          Enter a percentage from 0 to 100 with at most two decimals.
        </p>
      ) : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </form>
  );
}
