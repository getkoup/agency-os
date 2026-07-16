"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function SyncAllClientsButton({
  serverRunIsActive,
}: {
  serverRunIsActive: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = api.dashboard.syncAllClients.useMutation({
    onSuccess: (run) => {
      setMessage(
        run.status === "succeeded"
          ? "All client synchronization completed."
          : "Synchronization completed with target failures.",
      );
      router.refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const running = mutation.isPending || serverRunIsActive;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [router, running]);

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        className="rounded-full"
        disabled={running}
        onClick={() => {
          setMessage(null);
          mutation.mutate();
        }}
      >
        {running ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {running ? "Synchronizing…" : "Sync all clients"}
      </Button>
      <p
        className="text-muted-foreground max-w-sm text-right text-xs"
        aria-live="polite"
      >
        {message}
      </p>
    </div>
  );
}
