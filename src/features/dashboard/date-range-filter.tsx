"use client";

import { useState } from "react";
import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export type DatePreset =
  "last7" | "last14" | "last30" | "thisMonth" | "lastMonth" | "custom";

const presets: Array<{ value: DatePreset; label: string }> = [
  { value: "last7", label: "Last 7 days" },
  { value: "last14", label: "Last 14 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Previous month" },
  { value: "custom", label: "Custom range" },
];

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function presetRange(preset: Exclude<DatePreset, "custom">): DateRange {
  const today = new Date();
  switch (preset) {
    case "last7":
      return { from: subDays(today, 6), to: today };
    case "last14":
      return { from: subDays(today, 13), to: today };
    case "last30":
      return { from: subDays(today, 29), to: today };
    case "thisMonth":
      return { from: startOfMonth(today), to: today };
    case "lastMonth": {
      const previousMonth = subMonths(today, 1);
      return {
        from: startOfMonth(previousMonth),
        to: endOfMonth(previousMonth),
      };
    }
  }
}

function rangeLabel(range: DateRange): string {
  if (!range.from) return "Choose dates";
  if (!range.to) return format(range.from, "MMM d, yyyy");
  return `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`;
}

export function DateRangeFilter({
  from,
  to,
  preset,
  onChange,
}: {
  from: string;
  to: string;
  preset: DatePreset;
  onChange: (from: string, to: string, preset: DatePreset) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange>({
    from: parseDate(from),
    to: parseDate(to),
  });

  function selectPreset(value: DatePreset) {
    if (value === "custom") {
      setDraftRange({ from: parseDate(from), to: parseDate(to) });
      setCalendarOpen(true);
      return;
    }
    const range = presetRange(value);
    if (!range.from || !range.to) return;
    onChange(
      format(range.from, "yyyy-MM-dd"),
      format(range.to, "yyyy-MM-dd"),
      value,
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground px-1 text-xs">Date range</Label>
      <div className="flex gap-2">
        <Select
          value={preset}
          onValueChange={(value) => selectPreset(value as DatePreset)}
        >
          <SelectTrigger className="bg-card h-11 min-w-0 flex-1 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="bg-card h-11 rounded-xl px-3"
              aria-label={`Selected dates: ${rangeLabel({ from: parseDate(from), to: parseDate(to) })}`}
            >
              <CalendarDays aria-hidden="true" />
              <span className="hidden whitespace-nowrap 2xl:inline">
                {rangeLabel({ from: parseDate(from), to: parseDate(to) })}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto overflow-hidden p-0">
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={(range) =>
                setDraftRange(range ?? { from: undefined, to: undefined })
              }
              defaultMonth={draftRange.from}
              numberOfMonths={2}
            />
            <div className="border-border flex items-center justify-between gap-4 border-t p-3">
              <p className="text-muted-foreground text-xs">
                {rangeLabel(draftRange)}
              </p>
              <Button
                type="button"
                size="sm"
                disabled={!draftRange.from}
                onClick={() => {
                  if (!draftRange.from) return;
                  const rangeEnd = draftRange.to ?? draftRange.from;
                  onChange(
                    format(draftRange.from, "yyyy-MM-dd"),
                    format(rangeEnd, "yyyy-MM-dd"),
                    "custom",
                  );
                  setCalendarOpen(false);
                }}
              >
                Apply range
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
