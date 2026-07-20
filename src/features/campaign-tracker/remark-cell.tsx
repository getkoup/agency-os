"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/trpc/react";

export function RemarkCell({
  campaignId,
  campaignName,
  date,
  initialRemark,
}: {
  campaignId: string;
  campaignName: string;
  date: string;
  initialRemark: string;
}) {
  const router = useRouter();
  const [remark, setRemark] = useState(initialRemark);
  const [savedRemark, setSavedRemark] = useState(initialRemark);
  const mutation = api.campaignTracker.saveRemark.useMutation({
    onSuccess: () => {
      setSavedRemark(remark.trim());
      router.refresh();
    },
  });
  const changed = remark.trim() !== savedRemark;

  return (
    <div className="min-w-64 space-y-2">
      <Textarea
        value={remark}
        maxLength={2000}
        rows={2}
        placeholder="Add a remark…"
        aria-label={`${date} remark for ${campaignName}`}
        className="bg-background min-h-16 resize-y"
        onChange={(event) => setRemark(event.target.value)}
      />
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {mutation.error
            ? mutation.error.message
            : mutation.isSuccess && !changed
              ? "Saved"
              : `${remark.length}/2000`}
        </span>
        {changed ? (
          <Button
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ campaignId, date, remark: remark.trim() })
            }
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
