"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  campaignAverageDaysSchema,
  DEFAULT_CAMPAIGN_AVERAGE_DAYS,
  MAX_CAMPAIGN_AVERAGE_DAYS,
} from "~/features/campaign-tracker/average-days";

export function CampaignTrackerAverageDays({
  averageDays,
}: {
  averageDays: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(String(averageDays));

  function applyValue() {
    const parsed = campaignAverageDaysSchema.safeParse(value);
    if (!parsed.success) {
      setValue(String(averageDays));
      return;
    }
    const nextAverageDays = parsed.data;
    setValue(String(nextAverageDays));
    if (nextAverageDays === averageDays) return;

    const next = new URLSearchParams(searchParams);
    if (nextAverageDays === DEFAULT_CAMPAIGN_AVERAGE_DAYS) {
      next.delete("averageDays");
    } else {
      next.set("averageDays", String(nextAverageDays));
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="w-full space-y-2 xl:w-40">
      <Label
        htmlFor="campaign-tracker-average-days"
        className="text-foreground/75 px-0.5 text-xs font-medium"
      >
        Average days
      </Label>
      <Input
        id="campaign-tracker-average-days"
        type="number"
        min={1}
        max={MAX_CAMPAIGN_AVERAGE_DAYS}
        step={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={applyValue}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </div>
  );
}
