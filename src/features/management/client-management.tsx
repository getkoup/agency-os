"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
import { getFormString } from "~/lib/form-data";
import { api, type RouterOutputs } from "~/trpc/react";

type ClientRow = RouterOutputs["management"]["clients"]["rows"][number];

const dialogClassName =
  "shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]";

export function ClientManagement() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = api.management.createClient.useMutation({
    onSuccess: () => {
      setOpen(false);
      setError(null);
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 rounded-full px-5">Create client</Button>
      </DialogTrigger>
      <DialogContent className={dialogClassName}>
        <DialogHeader>
          <DialogTitle>Create client</DialogTitle>
          <DialogDescription>
            Add a client workspace. Its generated slug remains immutable.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              name: getFormString(new FormData(event.currentTarget), "name"),
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
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button className="h-11 sm:min-w-28" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClientEditButton({ row }: { row: ClientRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = api.management.updateClient.useMutation({
    onSuccess: () => {
      setOpen(false);
      setError(null);
      router.refresh();
    },
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
          <DialogFooter>
            <Button className="h-11 sm:min-w-28" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
