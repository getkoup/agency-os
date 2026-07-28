"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedDate = parseISO(date);

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
                  update("date", format(nextDate, "yyyy-MM-dd"));
                  setCalendarOpen(false);
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
