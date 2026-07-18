"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  DateRangeFilter,
  type DatePreset,
} from "~/features/dashboard/date-range-filter";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

const datePresets: DatePreset[] = [
  "last3",
  "last7",
  "last14",
  "last30",
  "thisMonth",
  "lastMonth",
  "custom",
];

export function MonitoringFilters({
  clients,
  values,
}: {
  clients: Array<{ id: string; name: string }>;
  values: { from: string; to: string; clientId?: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPreset = searchParams.get("range");
  const preset =
    datePresets.find((candidate) => candidate === requestedPreset) ??
    (!searchParams.has("from") && !searchParams.has("to") ? "last3" : "custom");

  function navigate(next: URLSearchParams) {
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function updateClient(clientId: string) {
    const next = new URLSearchParams(searchParams);
    if (clientId === "all") next.delete("clientId");
    else next.set("clientId", clientId);
    navigate(next);
  }

  function updateDateRange(from: string, to: string, range: DatePreset) {
    const next = new URLSearchParams(searchParams);
    next.set("from", from);
    next.set("to", to);
    next.set("range", range);
    navigate(next);
  }

  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
        <DateRangeFilter
          from={values.from}
          to={values.to}
          preset={preset}
          onChange={updateDateRange}
        />
        <div className="space-y-2">
          <Label className="text-foreground/75 px-0.5 text-xs font-medium">
            Client
          </Label>
          <Select value={values.clientId ?? "all"} onValueChange={updateClient}>
            <SelectTrigger className="border-border/80 bg-background/70 h-10 w-full rounded-md shadow-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
