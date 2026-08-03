"use client";

import { LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { api } from "~/trpc/react";

export function SynchronizationRequestButton({
  clientId,
  disabled = false,
  label,
  mode,
  size = "sm",
  variant = "outline",
}: {
  clientId?: string;
  disabled?: boolean;
  label?: string;
  mode: "fresh" | "full";
  size?: "default" | "sm" | "xs";
  variant?: "default" | "outline" | "secondary";
}) {
  const router = useRouter();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [queued, setQueued] = useState(false);
  const onSuccess = () => {
    setQueued(true);
    setConfirmationOpen(false);
    router.refresh();
  };
  const freshMutation = api.synchronization.requestFresh.useMutation({
    onSuccess,
  });
  const fullMutation = api.synchronization.requestFull.useMutation({
    onSuccess,
  });
  const mutation = mode === "fresh" ? freshMutation : fullMutation;
  const isPending = mutation.isPending;
  const buttonLabel = label ?? (mode === "fresh" ? "Fresh sync" : "Full sync");

  useEffect(() => {
    if (disabled) setQueued(false);
  }, [disabled]);

  function requestSynchronization() {
    setQueued(false);
    freshMutation.reset();
    fullMutation.reset();
    if (mode === "full") {
      setConfirmationOpen(true);
      return;
    }
    freshMutation.mutate({ clientId });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={disabled || isPending || queued}
        onClick={requestSynchronization}
      >
        {isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : mode === "full" ? (
          <RotateCcw aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {isPending ? "Queuing…" : queued ? "Queued" : buttonLabel}
      </Button>
      {mutation.error ? (
        <p className="text-destructive max-w-56 text-right text-[0.7rem] leading-tight">
          {mutation.error.message}
        </p>
      ) : null}
      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a full synchronization?</DialogTitle>
            <DialogDescription>
              This refreshes GHL appointments from 90 days ago through 180 days
              ahead and Windsor&apos;s existing 8-day window. It uses more
              provider capacity than a Fresh Sync.
            </DialogDescription>
          </DialogHeader>
          {fullMutation.error ? (
            <p className="text-destructive text-sm">
              {fullMutation.error.message}
            </p>
          ) : null}
          <DialogFooter showCloseButton>
            <Button
              type="button"
              disabled={fullMutation.isPending}
              onClick={() => fullMutation.mutate({ clientId })}
            >
              {fullMutation.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw aria-hidden="true" />
              )}
              {fullMutation.isPending ? "Queuing…" : "Start full sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
