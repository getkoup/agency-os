"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";

export function AgencyReportingTimezoneForm({
  initialTimezone,
  timezones,
}: {
  initialTimezone: string;
  timezones: string[];
}) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(initialTimezone);
  const [message, setMessage] = useState<string | null>(null);
  const save = api.settings.updateReportingTimezone.useMutation({
    onSuccess: (result) => {
      setMessage(`Reporting timezone saved as ${result.reportingTimezone}.`);
      router.refresh();
    },
    onError: (error) => setMessage(error.message),
  });

  return (
    <form
      className="grid gap-4 lg:grid-cols-[minmax(18rem,28rem)_auto] lg:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        save.mutate({ reportingTimezone: timezone });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="agency-reporting-timezone">
          Agency reporting timezone
        </Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger
            id="agency-reporting-timezone"
            className="w-full"
            aria-label="Agency reporting timezone"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-80">
            {timezones.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        className="lg:w-fit"
        disabled={save.isPending || timezone === initialTimezone}
      >
        {save.isPending ? "Saving…" : "Save timezone"}
      </Button>
      <div className="lg:col-span-2">
        <p className="text-muted-foreground text-xs leading-5">
          Controls calendar-day boundaries for timestamped dashboard records,
          reports, and commissions. It does not change source data or any GHL
          location timezone.
        </p>
        {message ? (
          <p
            className={
              save.isError
                ? "text-destructive mt-2 text-sm"
                : "text-primary mt-2 text-sm"
            }
            role="status"
          >
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
