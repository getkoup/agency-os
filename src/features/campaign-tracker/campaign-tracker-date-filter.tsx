"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
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
    <div className="w-full space-y-2 xl:w-52">
      <p className="text-foreground/75 px-0.5 text-xs font-medium">
        Latest date
      </p>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
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
  );
}
