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
import { api } from "~/trpc/react";

export function AccountAssignment({
  sourceAccountId,
  currentClientId,
  clients,
}: {
  sourceAccountId: string;
  currentClientId: string | null;
  clients: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(currentClientId ?? "unassigned");
  const [error, setError] = useState<string | null>(null);
  const mutation = api.management.assignSourceAccount.useMutation({
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
        <Button size="sm" variant="outline" className="rounded-full">
          {currentClientId ? "Reassign" : "Assign client"}
        </Button>
      </DialogTrigger>
      <DialogContent className="shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]">
        <DialogHeader>
          <DialogTitle>Assign source account</DialogTitle>
          <DialogDescription>
            Historical performance and leads move with the account immediately.
          </DialogDescription>
        </DialogHeader>
        <select
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="unassigned">Unassigned</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            className="h-11 sm:min-w-32"
            onClick={() =>
              mutation.mutate({
                sourceAccountId,
                clientId: clientId === "unassigned" ? null : clientId,
              })
            }
          >
            {mutation.isPending ? "Saving…" : "Save assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
