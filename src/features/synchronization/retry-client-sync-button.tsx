"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function RetryClientSyncButton({
  clientId,
  clientName,
  disabled,
  sourceRunId,
}: {
  clientId: string;
  clientName: string;
  disabled: boolean;
  sourceRunId: string;
}) {
  const router = useRouter();
  const mutation = api.synchronization.retryClient.useMutation({
    onSuccess: () => router.refresh(),
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={disabled || mutation.isPending || mutation.isSuccess}
        title={
          disabled
            ? "Wait for this client synchronization to finish"
            : `Retry failed synchronization for ${clientName}`
        }
        onClick={() => mutation.mutate({ clientId, sourceRunId })}
      >
        {mutation.isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcw aria-hidden="true" />
        )}
        {mutation.isPending
          ? "Queuing…"
          : mutation.isSuccess
            ? "Queued"
            : "Retry client"}
      </Button>
      {mutation.error ? (
        <p className="text-destructive max-w-44 text-right text-[0.7rem] leading-tight">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
  );
}
