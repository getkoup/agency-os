"use client";

import { Save, Trash2 } from "lucide-react";
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

export function AttributionModeV2Control({
  clientId,
  value,
}: {
  clientId: string;
  value: "created_by" | "assigned_user" | "created_by_then_assigned";
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const save = api.salesCommissionsV2.saveSettings.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (result) => setError(result.message),
  });

  return (
    <div className="space-y-2">
      <Label>Credited salesperson source</Label>
      <div className="flex gap-2">
        <Select
          value={selected}
          onValueChange={(next) => setSelected(next as typeof selected)}
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
        <Button
          disabled={save.isPending || selected === value}
          onClick={() => save.mutate({ clientId, attributionMode: selected })}
        >
          Save
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Lead Source in the appointment description never credits a salesperson.
      </p>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function CommissionRateV2Cell({
  clientId,
  salespersonExternalUserId,
  categoryId,
  initialValue,
}: {
  clientId: string;
  salespersonExternalUserId: string;
  categoryId: string;
  initialValue: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const upsert = api.salesCommissionsV2.upsertCommissionRate.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (result) => setError(result.message),
  });
  const remove = api.salesCommissionsV2.removeCommissionRate.useMutation({
    onSuccess: () => {
      setValue("");
      setError(null);
      router.refresh();
    },
    onError: (result) => setError(result.message),
  });

  return (
    <div className="min-w-44 space-y-1">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <span className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
            $
          </span>
          <Input
            className="pl-6"
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label="V2 commission amount"
          />
        </div>
        <Button
          size="icon"
          variant="outline"
          disabled={upsert.isPending || !value || value === initialValue}
          aria-label="Save V2 commission rate"
          onClick={() =>
            upsert.mutate({
              clientId,
              salespersonExternalUserId,
              categoryId,
              commissionValue: value,
            })
          }
        >
          <Save aria-hidden="true" />
        </Button>
        {initialValue !== null ? (
          <Button
            size="icon"
            variant="ghost"
            disabled={remove.isPending}
            aria-label="Remove V2 commission rate"
            onClick={() =>
              remove.mutate({
                clientId,
                salespersonExternalUserId,
                categoryId,
              })
            }
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
