"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
import { getFormString } from "~/lib/form-data";
import { api, type RouterOutputs } from "~/trpc/react";

type ClientRow = RouterOutputs["management"]["clients"]["rows"][number];
type UnassignedAccount =
  RouterOutputs["management"]["accountAssignments"]["rows"][number];

const dialogClassName =
  "shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]";

function AccountChecklist({
  accounts,
  selected,
  onChange,
}: {
  accounts: UnassignedAccount[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
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
    <div className="border-border max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
      {accounts.map((account) => (
        <label
          key={account.id}
          className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md p-2"
        >
          <Checkbox
            checked={selected.includes(account.id)}
            onCheckedChange={(checked) => toggle(account.id, checked === true)}
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
      ))}
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
          <Button className="h-11 rounded-full px-5">Create client</Button>
        </DialogTrigger>
        <DialogContent className={dialogClassName}>
          <DialogHeader>
            <DialogTitle>Create client</DialogTitle>
            <DialogDescription>
              Create the workspace and optionally assign unassigned source
              accounts in one step.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({
                name: getFormString(new FormData(event.currentTarget), "name"),
                sourceAccountIds: createAccountIds,
              });
            }}
          >
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
            <DialogFooter>
              <Button className="h-11 sm:min-w-28" disabled={create.isPending}>
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
            className="h-11 rounded-full px-5"
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
              <select
                id="assignment-client"
                value={targetClientId}
                onChange={(event) => setTargetClientId(event.target.value)}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
              >
                {activeClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
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
                className="h-11 sm:min-w-32"
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
        <Button size="sm" variant="ghost" className="rounded-full">
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
            <select
              id={`client-status-${row.id}`}
              name="status"
              defaultValue={row.status}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
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
            <Button
              className="h-11 sm:min-w-28"
              disabled={update.isPending || remove.isPending}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
