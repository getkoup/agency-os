"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  query,
}: {
  date: string;
  groupSize: number;
  query: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(query);
  const lastQuery = useRef(query);
  const selectedDate = parseISO(date);

  useEffect(() => {
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    const value = searchValue.trim();
    if (value === query) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set("query", value);
      else next.delete("query");
      lastQuery.current = value;
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [pathname, query, router, searchParams, searchValue]);

  function update(key: string, value: string) {
    if ((searchParams.get(key) ?? "") === value) return;
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto">
      <div className="w-full space-y-1.5 xl:w-64">
        <Label htmlFor="sales-tracking-search">Search clients</Label>
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id="sales-tracking-search"
            name="query"
            type="search"
            value={searchValue}
            maxLength={100}
            placeholder="Search by client name"
            className="h-10 pl-9"
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </div>
      </div>
      <div className="w-full space-y-1.5 xl:w-40">
        <Label htmlFor="sales-tracking-group">Days per column</Label>
        <Input
          id="sales-tracking-group"
          type="number"
          min={1}
          max={90}
          step={1}
          value={groupSize}
          className="h-10"
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isInteger(value) && value >= 1 && value <= 90) {
              update("group", String(value));
            }
          }}
        />
      </div>
      <div className="w-full space-y-1.5 xl:w-48">
        <Label>Latest date</Label>
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
                update("date", format(nextDate, "yyyy-MM-dd"));
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
