"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

export function CampaignTrackerDateFilter({ date }: { date: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedDate = parseISO(date);

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
        <Label>Latest date</Label>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start font-normal"
              aria-label={`Latest date: ${format(selectedDate, "MMMM d, yyyy")}`}
            >
              <CalendarDays aria-hidden="true" />
              <span>{format(selectedDate, "MMM d, yyyy")}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto overflow-hidden p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate}
              onSelect={(nextDate) => {
                if (!nextDate) return;
                updateDate(format(nextDate, "yyyy-MM-dd"));
                setCalendarOpen(false);
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
