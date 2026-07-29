"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { getFormString } from "~/lib/form-data";
import { api, type RouterOutputs } from "~/trpc/react";

type ClientRow = RouterOutputs["management"]["clients"]["rows"][number];
type UnassignedAccount =
  RouterOutputs["management"]["accountAssignments"]["rows"][number];

const dialogClassName =
  "shadow-sage-floating max-h-[calc(100svh-2rem)] overflow-y-auto rounded-[1.25rem] p-5 sm:max-w-2xl";
const createDialogClassName =
  "shadow-sage-floating flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden rounded-[1.25rem] p-5 sm:max-w-2xl";

function AccountChecklist({
  accounts,
  selected,
  onChange,
}: {
  accounts: UnassignedAccount[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleAccounts = normalizedQuery
    ? accounts.filter((account) =>
        [account.name, account.platform, account.connector].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
    : accounts;

  function toggle(accountId: string, checked: boolean) {
    onChange(
      checked
        ? [...new Set([...selected, accountId])]
        : selected.filter((id) => id !== accountId),
    );
  }
  if (!accounts.length) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        No unassigned source accounts are available.
      </p>
    );
  }
  return (
    <div className="border-border overflow-hidden rounded-[0.625rem] border">
      <div className="border-border bg-muted/20 border-b p-2.5">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search source accounts"
            aria-label="Search source accounts"
            className="bg-background h-9 pl-9"
          />
        </div>
        <p className="text-muted-foreground mt-2 px-1 text-xs">
          {selected.length} selected · {visibleAccounts.length} shown
        </p>
      </div>
      <div className="max-h-60 space-y-1 overflow-y-auto p-2">
        {visibleAccounts.length ? (
          visibleAccounts.map((account) => (
            <label
              key={account.id}
              className="hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-[0.5rem] p-2.5 transition-colors"
            >
              <Checkbox
                checked={selected.includes(account.id)}
                onCheckedChange={(checked) =>
                  toggle(account.id, checked === true)
                }
                aria-label={`Select ${account.name}`}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {account.name}
                </span>
                <span className="text-muted-foreground block text-xs capitalize">
                  {account.platform} · {account.connector}
                </span>
              </span>
            </label>
          ))
        ) : (
          <p className="text-muted-foreground px-3 py-8 text-center text-sm">
            No source accounts match “{query.trim()}”.
          </p>
        )}
      </div>
    </div>
  );
}

export function ClientManagement({
  clients,
  unassignedAccounts,
  unassignedAccountTotal,
}: {
  clients: ClientRow[];
  unassignedAccounts: UnassignedAccount[];
  unassignedAccountTotal: number;
}) {
  const router = useRouter();
  const activeClients = clients.filter(({ status }) => status === "active");
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [createAccountIds, setCreateAccountIds] = useState<string[]>([]);
  const [assignAccountIds, setAssignAccountIds] = useState<string[]>([]);
  const [targetClientId, setTargetClientId] = useState(
    activeClients[0]?.id ?? "",
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const create = api.management.createClient.useMutation({
    onSuccess: () => {
      setCreateOpen(false);
      setCreateAccountIds([]);
      setCreateError(null);
      router.refresh();
    },
    onError: (value) => setCreateError(value.message),
  });
  const assign = api.management.assignUnassignedSourceAccounts.useMutation({
    onSuccess: () => {
      setAssignOpen(false);
      setAssignAccountIds([]);
      setAssignError(null);
      router.refresh();
    },
    onError: (value) => setAssignError(value.message),
  });
  const partialAccountList = unassignedAccountTotal > unassignedAccounts.length;

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <Button size="lg">Create client</Button>
        </DialogTrigger>
        <DialogContent className={createDialogClassName}>
          <DialogHeader className="shrink-0">
            <DialogTitle>Create client</DialogTitle>
            <DialogDescription>
              Create the workspace and optionally assign unassigned source
              accounts in one step.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({
                name: getFormString(new FormData(event.currentTarget), "name"),
                sourceAccountIds: createAccountIds,
              });
            }}
          >
            <div className="min-h-0 space-y-5 overflow-y-auto pr-1 pb-1">
              <div className="space-y-2">
                <Label htmlFor="client-name">Name</Label>
                <Input
                  id="client-name"
                  name="name"
                  className="h-11 rounded-xl"
                  required
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Assign source accounts (optional)</Label>
                  {unassignedAccounts.length ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setCreateAccountIds(
                          createAccountIds.length === unassignedAccounts.length
                            ? []
                            : unassignedAccounts.map(({ id }) => id),
                        )
                      }
                    >
                      {createAccountIds.length === unassignedAccounts.length
                        ? "Clear all"
                        : "Select all"}
                    </Button>
                  ) : null}
                </div>
                <AccountChecklist
                  accounts={unassignedAccounts}
                  selected={createAccountIds}
                  onChange={setCreateAccountIds}
                />
                {partialAccountList ? (
                  <p className="text-muted-foreground text-xs">
                    Showing the first {unassignedAccounts.length} of{" "}
                    {unassignedAccountTotal} unassigned accounts.
                  </p>
                ) : null}
              </div>
              {createError ? (
                <p className="text-destructive text-sm">{createError}</p>
              ) : null}
            </div>
            <DialogFooter className="mt-5 shrink-0">
              <Button size="lg" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="lg"
            disabled={!activeClients.length || !unassignedAccounts.length}
          >
            Assign accounts
          </Button>
        </DialogTrigger>
        <DialogContent className={dialogClassName}>
          <DialogHeader>
            <DialogTitle>Assign unassigned accounts</DialogTitle>
            <DialogDescription>
              Select an active client and one or more source accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="assignment-client">Client</Label>
              <Select value={targetClientId} onValueChange={setTargetClientId}>
                <SelectTrigger
                  id="assignment-client"
                  className="w-full data-[size=default]:h-11"
                >
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {activeClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source accounts</Label>
              <AccountChecklist
                accounts={unassignedAccounts}
                selected={assignAccountIds}
                onChange={setAssignAccountIds}
              />
              {partialAccountList ? (
                <p className="text-muted-foreground text-xs">
                  Showing the first {unassignedAccounts.length} of{" "}
                  {unassignedAccountTotal} unassigned accounts.
                </p>
              ) : null}
            </div>
            {assignError ? (
              <p className="text-destructive text-sm">{assignError}</p>
            ) : null}
            <DialogFooter>
              <Button
                size="lg"
                disabled={
                  assign.isPending ||
                  !targetClientId ||
                  !assignAccountIds.length
                }
                onClick={() =>
                  assign.mutate({
                    clientId: targetClientId,
                    sourceAccountIds: assignAccountIds,
                  })
                }
              >
                {assign.isPending ? "Assigning…" : "Assign accounts"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ClientEditButton({ row }: { row: ClientRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setError(null);
    router.refresh();
  };
  const update = api.management.updateClient.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const remove = api.management.deleteClient.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className={dialogClassName}>
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>
            Update the client name or availability. The slug cannot change.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            update.mutate({
              clientId: row.id,
              name: getFormString(data, "name"),
              status:
                getFormString(data, "status") === "inactive"
                  ? "inactive"
                  : "active",
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`client-name-${row.id}`}>Name</Label>
            <Input
              id={`client-name-${row.id}`}
              name="name"
              className="h-11 rounded-xl"
              defaultValue={row.name}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`client-status-${row.id}`}>Status</Label>
            <Select name="status" defaultValue={row.status}>
              <SelectTrigger
                id={`client-status-${row.id}`}
                className="w-full data-[size=default]:h-11"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground text-xs leading-5">
            Deactivate only after all source accounts are unassigned.
          </p>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={update.isPending || remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Permanently delete ${row.name}? Clients with accounts, users, GHL credentials, or integration history cannot be deleted.`,
                  )
                ) {
                  remove.mutate({ clientId: row.id });
                }
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button size="lg" disabled={update.isPending || remove.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
