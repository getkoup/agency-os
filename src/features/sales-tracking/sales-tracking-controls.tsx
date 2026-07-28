"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
export function SalesTrackingControls({
  date,
  groupSize,
}: {
  date: string;
  groupSize: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="border-border bg-card flex flex-wrap items-end justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="font-medium">Booking-created performance</p>
        <p className="text-muted-foreground text-sm">
          Four columns ending on the selected date; choose how many days each
          column combines.
        </p>
      </div>
      <div className="flex w-full flex-wrap gap-3 sm:w-auto">
        <div className="w-full space-y-2 sm:w-48">
          <Label htmlFor="sales-tracking-group">Days per column</Label>
          <Input
            id="sales-tracking-group"
            type="number"
            min={1}
            max={90}
            step={1}
            value={groupSize}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= 90) {
                update("group", String(value));
              }
            }}
          />
        </div>
        <div className="w-full space-y-2 sm:w-48">
          <Label htmlFor="sales-tracking-date">Latest date</Label>
          <Input
            id="sales-tracking-date"
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value) update("date", event.target.value);
            }}
          />
        </div>
      </div>
    </div>
  );
}
