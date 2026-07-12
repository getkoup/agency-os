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

export function ClientManagement({ rows }: { rows: ClientRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = api.management.createClient.useMutation({
    onSuccess: () => {
      setCreateOpen(false);
      setError(null);
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });
  const update = api.management.updateClient.useMutation({
    onSuccess: () => {
      setEditing(null);
      setError(null);
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <Button>Create client</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create client</DialogTitle>
            <DialogDescription>
              The generated slug remains immutable.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({
                name: getFormString(new FormData(event.currentTarget), "name"),
              });
            }}
          >
            <Label>
              Name
              <Input name="name" required maxLength={255} />
            </Label>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <DialogFooter>
              <Button disabled={create.isPending}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <select
        className="bg-background h-9 rounded-md border px-3 text-sm"
        defaultValue=""
        onChange={(event) =>
          setEditing(rows.find(({ id }) => id === event.target.value) ?? null)
        }
      >
        <option value="" disabled>
          Edit a client…
        </option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit client</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                update.mutate({
                  clientId: editing.id,
                  name: getFormString(data, "name"),
                  status:
                    getFormString(data, "status") === "inactive"
                      ? "inactive"
                      : "active",
                });
              }}
            >
              <Label>
                Name
                <Input name="name" defaultValue={editing.name} required />
              </Label>
              <Label>
                Status
                <select
                  name="status"
                  defaultValue={editing.status}
                  className="bg-background ml-3 h-9 rounded-md border px-3"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Label>
              <p className="text-muted-foreground text-xs">
                Deactivate only after all source accounts are unassigned.
              </p>
              {error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : null}
              <DialogFooter>
                <Button disabled={update.isPending}>Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
