"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getFormString } from "~/lib/form-data";
import { api, type RouterOutputs } from "~/trpc/react";

type RevenueRulesResult = RouterOutputs["settings"]["revenueRules"];
type RevenueRuleRow = RevenueRulesResult["rows"][number];
type ClientOption = RevenueRulesResult["clientOptions"][number];

function RuleDialog({
  clients,
  row,
}: {
  clients: ClientOption[];
  row?: RevenueRuleRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setError(null);
    router.refresh();
  };
  const create = api.settings.createRevenueRule.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const update = api.settings.updateRevenueRule.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={row ? "ghost" : "default"}
          size={row ? "sm" : "default"}
          className="rounded-full"
        >
          {row ? "Edit" : "Create rule"}
        </Button>
      </DialogTrigger>
      <DialogContent className="shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]">
        <DialogHeader>
          <DialogTitle>
            {row ? "Edit revenue rule" : "Create revenue rule"}
          </DialogTitle>
          <DialogDescription>
            Match a normalized GHL tag to a non-negative estimated USD value.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const data = new FormData(event.currentTarget);
            const input = {
              clientId: getFormString(data, "clientId"),
              tagName: getFormString(data, "tagName"),
              revenueValue: getFormString(data, "revenueValue"),
              serviceName: getFormString(data, "serviceName") || undefined,
            };
            if (row) {
              update.mutate({ ...input, ruleId: row.id, status: row.status });
            } else {
              create.mutate(input);
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`rule-client-${row?.id ?? "new"}`}>Client</Label>
            <select
              id={`rule-client-${row?.id ?? "new"}`}
              name="clientId"
              defaultValue={row?.clientId ?? ""}
              required
              className="border-input bg-background focus-visible:border-ring h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
            >
              <option value="" disabled>
                Select a client
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.status === "inactive" ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`rule-tag-${row?.id ?? "new"}`}>GHL tag</Label>
            <Input
              id={`rule-tag-${row?.id ?? "new"}`}
              name="tagName"
              defaultValue={row?.tagName}
              maxLength={255}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`rule-value-${row?.id ?? "new"}`}>
              Estimated revenue (USD)
            </Label>
            <Input
              id={`rule-value-${row?.id ?? "new"}`}
              name="revenueValue"
              type="number"
              min="0"
              step="0.01"
              defaultValue={row?.revenueValue}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`rule-service-${row?.id ?? "new"}`}>
              Service name
            </Label>
            <Input
              id={`rule-service-${row?.id ?? "new"}`}
              name="serviceName"
              defaultValue={row?.serviceName ?? ""}
              maxLength={255}
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={pending}>
              {pending ? "Saving…" : "Save rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RevenueRuleManager({ result }: { result: RevenueRulesResult }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const update = api.settings.updateRevenueRule.useMutation({
    onSuccess: () => {
      setToggleError(null);
      router.refresh();
    },
    onError: (value) => setToggleError(value.message),
  });

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    next.set("rulePage", "1");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select
              value={searchParams.get("settingsClientId") ?? "all"}
              onValueChange={(value) => updateFilter("settingsClientId", value)}
            >
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {result.clientOptions.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={searchParams.get("ruleStatus") ?? "all"}
              onValueChange={(value) => updateFilter("ruleStatus", value)}
            >
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <RuleDialog clients={result.clientOptions} />
      </div>
      {toggleError ? (
        <p role="alert" className="text-destructive text-sm">
          {toggleError}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <Table className="min-w-[54rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.client}</TableCell>
                <TableCell className="font-medium">{row.tagName}</TableCell>
                <TableCell>{row.serviceName ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  ${row.revenueValue}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={row.status === "active" ? "default" : "secondary"}
                  >
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <RuleDialog clients={result.clientOptions} row={row} />
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          ruleId: row.id,
                          clientId: row.clientId,
                          tagName: row.tagName,
                          revenueValue: row.revenueValue,
                          serviceName: row.serviceName ?? undefined,
                          status:
                            row.status === "active" ? "inactive" : "active",
                        })
                      }
                    >
                      {row.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {result.rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No revenue rules match these filters.
        </p>
      ) : null}
    </div>
  );
}
