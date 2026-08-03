"use client";

import { Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { type CampaignCplThresholds } from "~/features/campaign-tracker/cpl-thresholds";
import { api } from "~/trpc/react";

export function CampaignCplThresholdSettings({
  initialThresholds,
}: {
  initialThresholds: CampaignCplThresholds;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [warningThreshold, setWarningThreshold] = useState(
    initialThresholds.warningThreshold,
  );
  const [criticalThreshold, setCriticalThreshold] = useState(
    initialThresholds.criticalThreshold,
  );
  const [savedThresholds, setSavedThresholds] = useState(initialThresholds);
  const [message, setMessage] = useState<string | null>(null);
  const save = api.campaignTracker.updateCplThresholds.useMutation({
    onSuccess: (thresholds) => {
      setWarningThreshold(thresholds.warningThreshold);
      setCriticalThreshold(thresholds.criticalThreshold);
      setSavedThresholds(thresholds);
      setMessage("CPL thresholds saved.");
      router.refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const hasChanges =
    warningThreshold !== savedThresholds.warningThreshold ||
    criticalThreshold !== savedThresholds.criticalThreshold;

  return (
    <div className="w-full space-y-2 xl:w-44">
      <p className="text-foreground/75 px-0.5 text-xs font-medium">
        CPL colors
      </p>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setMessage(null);
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="w-full">
            <Settings2 aria-hidden="true" />
            Thresholds
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Campaign CPL thresholds</DialogTitle>
            <DialogDescription>
              These global values control warning and critical cell colors in
              both Campaign Tracker views.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              save.mutate({ warningThreshold, criticalThreshold });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-cpl-warning">Orange warning ($)</Label>
                <Input
                  id="campaign-cpl-warning"
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  inputMode="decimal"
                  value={warningThreshold}
                  onChange={(event) => setWarningThreshold(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-cpl-critical">Red critical ($)</Label>
                <Input
                  id="campaign-cpl-critical"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  inputMode="decimal"
                  value={criticalThreshold}
                  onChange={(event) => setCriticalThreshold(event.target.value)}
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs leading-5">
              CPL equal to a threshold keeps the lower color. Critical must be
              greater than warning.
            </p>
            {message ? (
              <p
                className={
                  save.isError
                    ? "text-destructive text-sm"
                    : "text-primary text-sm"
                }
                role="status"
              >
                {message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  save.isPending ||
                  !hasChanges ||
                  !warningThreshold ||
                  !criticalThreshold
                }
              >
                {save.isPending ? "Saving…" : "Save thresholds"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
