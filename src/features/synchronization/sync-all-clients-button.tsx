"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";

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

export function SyncAllClientsButton({
  serverRunIsActive,
}: {
  serverRunIsActive: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const mutation = api.dashboard.syncAllClients.useMutation({
    onSuccess: () => {
      setDialogOpen(true);
      router.refresh();
    },
    onError: () => setDialogOpen(true),
  });
  const running = mutation.isPending || serverRunIsActive;
  const synchronizationQueued = mutation.data?.status === "running";

  useEffect(() => {
    if (!serverRunIsActive || mutation.isPending) return;
    const timer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [mutation.isPending, router, serverRunIsActive]);

  const failedTargets =
    mutation.data?.targets.filter((target) => target.status === "failed") ?? [];

  return (
    <>
      <Button
        type="button"
        className="shadow-sm"
        disabled={running}
        onClick={() => {
          mutation.reset();
          mutation.mutate();
        }}
      >
        {running ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {running ? "Synchronizing…" : "Sync due clients"}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="overflow-hidden rounded-3xl p-0 sm:max-w-lg">
          <div className="from-primary/12 via-background to-background bg-gradient-to-br p-6">
            <DialogHeader>
              <div className="bg-background mb-2 flex size-11 items-center justify-center rounded-2xl shadow-sm">
                {synchronizationQueued ? (
                  <LoaderCircle
                    className="text-primary size-6 animate-spin"
                    aria-hidden="true"
                  />
                ) : mutation.data?.status === "succeeded" ? (
                  <CheckCircle2
                    className="text-primary size-6"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="text-destructive size-6"
                    aria-hidden="true"
                  />
                )}
              </div>
              <DialogTitle className="text-xl">
                {synchronizationQueued
                  ? "Synchronization queued"
                  : mutation.data?.status === "succeeded"
                    ? "Synchronization complete"
                    : "Synchronization needs attention"}
              </DialogTitle>
              <DialogDescription>
                {mutation.error
                  ? mutation.error.message
                  : synchronizationQueued
                    ? "Client jobs will continue in the background and resume automatically if interrupted."
                    : failedTargets.length
                      ? `${failedTargets.length} target${failedTargets.length === 1 ? "" : "s"} could not be synchronized.`
                      : "All configured client data sources finished successfully."}
              </DialogDescription>
            </DialogHeader>
          </div>
          {mutation.data && !synchronizationQueued ? (
            <div className="space-y-4 px-6 pb-2">
              <dl className="grid grid-cols-3 gap-3">
                {[
                  ["Performance", mutation.data.performanceRowCount],
                  ["Leads", mutation.data.leadRowCount],
                  ["Bookings", mutation.data.opportunityRowCount],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="bg-muted/55 rounded-2xl px-3 py-4 text-center"
                  >
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {Number(value).toLocaleString()}
                    </dd>
                  </div>
                ))}
              </dl>
              {failedTargets.length ? (
                <div className="border-destructive/25 bg-destructive/5 max-h-40 space-y-2 overflow-y-auto rounded-2xl border p-4">
                  {failedTargets.map((target) => (
                    <div key={target.id} className="text-sm">
                      <p className="font-medium">
                        {target.clientName} · {target.provider}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {target.errorMessage ?? "Unknown synchronization error"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter
            className="mx-0 mb-0 rounded-b-3xl px-6"
            showCloseButton
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
