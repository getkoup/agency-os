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

type ClassificationResult =
  RouterOutputs["settings"]["leadClassificationRules"];
type ClassificationRule = ClassificationResult["rows"][number];
type ClientOption = ClassificationResult["clientOptions"][number];

function ClassificationRuleDialog({
  clients,
  defaultClientId,
  row,
}: {
  clients: ClientOption[];
  defaultClientId?: string;
  row?: ClassificationRule;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setError(null);
    router.refresh();
  };
  const create = api.settings.createLeadClassificationRule.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const update = api.settings.updateLeadClassificationRule.useMutation({
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
          {row ? "Edit" : "Create category"}
        </Button>
      </DialogTrigger>
      <DialogContent className="shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]">
        <DialogHeader>
          <DialogTitle>
            {row ? "Edit lead category" : "Create lead category"}
          </DialogTitle>
          <DialogDescription>
            The highest-priority matching category wins. Keywords use complete
            words or phrases and are case-insensitive.
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
              categoryName: getFormString(data, "categoryName"),
              keywords: getFormString(data, "keywords")
                .split(",")
                .map((keyword) => keyword.trim())
                .filter(Boolean),
              matchMode:
                getFormString(data, "matchMode") === "all"
                  ? ("all" as const)
                  : ("any" as const),
              priority: Number(getFormString(data, "priority")),
            };
            if (row) {
              update.mutate({
                ...input,
                ruleId: row.id,
                status: row.status,
              });
            } else {
              create.mutate(input);
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`classification-client-${row?.id ?? "new"}`}>
              Client
            </Label>
            <select
              id={`classification-client-${row?.id ?? "new"}`}
              name="clientId"
              defaultValue={row?.clientId ?? defaultClientId ?? ""}
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
            <Label htmlFor={`classification-name-${row?.id ?? "new"}`}>
              Category name
            </Label>
            <Input
              id={`classification-name-${row?.id ?? "new"}`}
              name="categoryName"
              defaultValue={row?.categoryName}
              placeholder="Ceramic Coating"
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`classification-keywords-${row?.id ?? "new"}`}>
              Keywords or phrases
            </Label>
            <Input
              id={`classification-keywords-${row?.id ?? "new"}`}
              name="keywords"
              defaultValue={row?.keywords.join(", ")}
              placeholder="coating, ceramic"
              required
            />
            <p className="text-muted-foreground text-xs">
              Separate entries with commas.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`classification-mode-${row?.id ?? "new"}`}>
                Match mode
              </Label>
              <select
                id={`classification-mode-${row?.id ?? "new"}`}
                name="matchMode"
                defaultValue={row?.matchMode ?? "any"}
                className="border-input bg-background focus-visible:border-ring h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="any">Any keyword</option>
                <option value="all">All keywords</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`classification-priority-${row?.id ?? "new"}`}>
                Priority
              </Label>
              <Input
                id={`classification-priority-${row?.id ?? "new"}`}
                name="priority"
                type="number"
                min="0"
                max="1000"
                defaultValue={row?.priority ?? 0}
                required
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={pending}>
              {pending ? "Saving…" : "Save category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LeadClassificationManager({
  result,
  canManage,
}: {
  result: ClassificationResult;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const update = api.settings.updateLeadClassificationRule.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });
  const selectedClientId = searchParams.get("classificationClientId") ?? "all";

  function updateClient(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("classificationClientId");
    else next.set("classificationClientId", value);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-1.5 sm:max-w-sm">
          <Label>Client</Label>
          <Select value={selectedClientId} onValueChange={updateClient}>
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
        {canManage ? (
          <ClassificationRuleDialog
            clients={result.clientOptions}
            defaultClientId={
              selectedClientId === "all" ? undefined : selectedClientId
            }
          />
        ) : (
          <Badge variant="secondary">Owner-managed</Badge>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <Table className="min-w-[58rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Keywords</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.client}</TableCell>
                <TableCell className="font-medium">
                  {row.categoryName}
                </TableCell>
                <TableCell className="max-w-xs">
                  {row.keywords.join(", ")}
                </TableCell>
                <TableCell>{row.matchMode === "any" ? "Any" : "All"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.priority}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={row.status === "active" ? "default" : "secondary"}
                  >
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManage ? (
                    <div className="flex justify-end gap-2">
                      <ClassificationRuleDialog
                        clients={result.clientOptions}
                        row={row}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            ruleId: row.id,
                            clientId: row.clientId,
                            categoryName: row.categoryName,
                            keywords: row.keywords,
                            matchMode: row.matchMode,
                            priority: row.priority,
                            status:
                              row.status === "active" ? "inactive" : "active",
                          })
                        }
                      >
                        {row.status === "active" ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {result.rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No lead classification rules are configured for this view.
        </p>
      ) : null}
      <div className="space-y-3">
        <div>
          <h3 className="font-medium">Campaign preview</h3>
          <p className="text-muted-foreground text-sm">
            Select one client to preview up to 50 stored campaigns. Rules apply
            retroactively to both lead forms and DM conversation counts.
          </p>
        </div>
        {selectedClientId === "all" ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-5 text-sm">
            Select a client to preview campaign classifications.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[42rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Forms</TableHead>
                  <TableHead className="text-right">DM</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.preview.map((row) => (
                  <TableRow key={row.campaignName}>
                    <TableCell className="font-medium">
                      {row.campaignName}
                    </TableCell>
                    <TableCell>{row.categoryName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.facebookLeadFormLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.dmLeads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalLeads}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
