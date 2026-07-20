"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function CampaignTrackerDateFilter({ date }: { date: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateDate(nextDate: string) {
    if (!nextDate) return;
    const next = new URLSearchParams(searchParams);
    next.set("date", nextDate);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="border-border bg-card flex flex-wrap items-end justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="font-medium">Daily campaign view</p>
        <p className="text-muted-foreground text-sm">
          Showing four reporting dates ending on the selected date.
        </p>
      </div>
      <div className="w-full space-y-2 sm:w-56">
        <Label htmlFor="campaign-tracker-date">Latest date</Label>
        <Input
          id="campaign-tracker-date"
          type="date"
          value={date}
          onChange={(event) => updateDate(event.target.value)}
        />
      </div>
    </div>
  );
}
