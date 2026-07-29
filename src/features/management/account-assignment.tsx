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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
        <Button size="sm" variant="outline">
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
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-full data-[size=default]:h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            size="lg"
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
