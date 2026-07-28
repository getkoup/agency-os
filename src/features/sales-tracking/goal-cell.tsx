"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

export function GoalCell({
  clientId,
  clientName,
  initialGoal,
  canEdit,
}: {
  clientId: string;
  clientName: string;
  initialGoal: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialGoal?.toString() ?? "");
  const mutation = api.salesTracking.saveGoal.useMutation({
    onSuccess: () => router.refresh(),
  });
  if (!canEdit) return <span>{initialGoal ?? "Not set"}</span>;

  const parsed = value === "" ? null : Number(value);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed > 0);
  const changed = value !== (initialGoal?.toString() ?? "");

  return (
    <div className="flex min-w-40 items-center gap-2">
      <Input
        type="number"
        min={1}
        step={1}
        value={value}
        aria-label={`Daily booking goal for ${clientName}`}
        placeholder="Not set"
        className="h-8 w-24"
        onChange={(event) => setValue(event.target.value)}
      />
      {changed ? (
        <Button
          size="sm"
          className="h-8"
          disabled={!valid || mutation.isPending}
          onClick={() =>
            mutation.mutate({ clientId, dailyBookingGoal: parsed })
          }
        >
          Save
        </Button>
      ) : null}
    </div>
  );
}
