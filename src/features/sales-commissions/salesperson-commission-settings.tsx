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
import { TableCell, TableRow } from "~/components/ui/table";
import { api, type RouterOutputs } from "~/trpc/react";

type Salesperson =
  RouterOutputs["salesCommissions"]["setup"]["salespeople"][number];

export function AttributionModeControl({
  clientId,
  value,
}: {
  clientId: string;
  value: "created_by" | "assigned_user" | "created_by_then_assigned";
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const save = api.salesCommissions.saveSettings.useMutation({
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
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function SalespersonRow({
  clientId,
  person,
}: {
  clientId: string;
  person: Salesperson;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(person.displayName ?? "");
  const [status, setStatus] = useState(person.status);
  const [error, setError] = useState<string | null>(null);
  const update = api.salesCommissions.updateSalesperson.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (result) => setError(result.message),
  });

  return (
    <TableRow>
      <TableCell className="pl-6 font-medium">
        {person.providerName ?? "Unnamed / removed user"}
      </TableCell>
      <TableCell>
        <Input
          className="min-w-52"
          value={displayName}
          placeholder="Optional dashboard name"
          onChange={(event) => setDisplayName(event.target.value)}
        />
        {error ? (
          <p className="text-destructive mt-1 text-xs">{error}</p>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-xs">
        ••••{person.externalUserId.slice(-6)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {person.lastSeenAt.toLocaleString()}
      </TableCell>
      <TableCell>
        <Select
          value={status}
          onValueChange={(next) => setStatus(next as typeof status)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="pr-6 text-right">
        <Button
          size="sm"
          disabled={
            update.isPending ||
            ((displayName.trim() || null) === person.displayName &&
              status === person.status)
          }
          onClick={() =>
            update.mutate({
              clientId,
              salespersonId: person.id,
              displayName,
              status,
            })
          }
        >
          <Save aria-hidden="true" /> Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function CommissionRateCell({
  clientId,
  salespersonId,
  categoryId,
  initialValue,
}: {
  clientId: string;
  salespersonId: string;
  categoryId: string;
  initialValue: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const upsert = api.salesCommissions.upsertCommissionRate.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (result) => setError(result.message),
  });
  const remove = api.salesCommissions.removeCommissionRate.useMutation({
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
            aria-label="Commission amount"
          />
        </div>
        <Button
          size="icon"
          variant="outline"
          disabled={upsert.isPending || !value || value === initialValue}
          aria-label="Save commission rate"
          onClick={() =>
            upsert.mutate({
              clientId,
              salespersonId,
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
            aria-label="Remove commission rate"
            onClick={() =>
              remove.mutate({ clientId, salespersonId, categoryId })
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
