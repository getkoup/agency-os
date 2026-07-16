"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock3, SlidersHorizontal } from "lucide-react";

import { Badge } from "~/components/ui/badge";
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

interface DashboardFiltersProps {
  values: {
    from: string;
    to: string;
    clientId?: string;
    platform?: string;
    campaignId?: string;
  };
  options: {
    clients: Array<{ id: string; name: string; timezone: string }>;
    includeUnassigned: boolean;
    platforms: string[];
    campaigns: Array<{ id: string; name: string }>;
  };
  resetPageKeys?: string[];
  showClient?: boolean;
  showPlatform?: boolean;
  showCampaign?: boolean;
}

export function DashboardFilters({
  values,
  options,
  resetPageKeys = [],
  showClient = true,
  showPlatform = true,
  showCampaign = true,
}: DashboardFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const controlCount =
    1 + Number(showClient) + Number(showPlatform) + Number(showCampaign);
  const dateColumnClass =
    controlCount === 4
      ? "sm:col-span-2 xl:col-span-4"
      : controlCount === 3
        ? "sm:col-span-2 xl:col-span-6"
        : controlCount === 2
          ? "sm:col-span-1 xl:col-span-6"
          : "sm:col-span-2 xl:col-span-12";
  const standardColumnClass =
    controlCount === 4
      ? "xl:col-span-3"
      : controlCount === 3
        ? "xl:col-span-3"
        : controlCount === 2
          ? "xl:col-span-6"
          : "xl:col-span-12";
  const platformColumnClass =
    controlCount === 4 ? "xl:col-span-2" : standardColumnClass;
  const datePreset = (searchParams.get("range") ??
    (!searchParams.has("from") && !searchParams.has("to")
      ? "last7"
      : "custom")) as DatePreset;
  const selectedClient = options.clients.find(
    (client) => client.id === values.clientId,
  );
  const timezoneLabel =
    values.clientId === "unassigned"
      ? "UTC"
      : (selectedClient?.timezone ?? "Each client’s local timezone");

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    for (const pageKey of resetPageKeys) next.set(pageKey, "1");
    router.push(`${pathname}?${next.toString()}`);
  }

  function updateDateRange(from: string, to: string, preset: DatePreset) {
    const next = new URLSearchParams(searchParams);
    next.set("from", from);
    next.set("to", to);
    next.set("range", preset);
    for (const pageKey of resetPageKeys) next.set(pageKey, "1");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="shadow-sage border-border/80 bg-card overflow-hidden rounded-[1.4rem] border">
      <div className="border-border/70 from-primary/[0.07] via-secondary/35 to-card flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary ring-primary/10 flex size-10 items-center justify-center rounded-xl ring-1">
            <SlidersHorizontal className="size-[1.125rem]" aria-hidden="true" />
          </span>
          <div className="space-y-0.5">
            <p className="text-foreground text-sm font-semibold tracking-[-0.01em]">
              Reporting controls
            </p>
            <p className="text-muted-foreground text-[0.8125rem]">
              Dates follow each client&apos;s local timezone.
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-primary/15 bg-background/75 text-foreground gap-1.5 rounded-full px-3 py-1 font-medium shadow-xs"
        >
          <Clock3 className="text-primary size-3.5" aria-hidden="true" />
          {timezoneLabel}
        </Badge>
      </div>
      <div className="grid items-end gap-x-4 gap-y-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-12">
        <DateRangeFilter
          from={values.from}
          to={values.to}
          preset={datePreset}
          onChange={updateDateRange}
          className={dateColumnClass}
        />
        {showClient ? (
          <div className={`space-y-2 ${standardColumnClass}`}>
            <Label className="text-foreground/75 px-0.5 text-xs font-medium">
              Client
            </Label>
            <Select
              value={values.clientId ?? "all"}
              onValueChange={(value) => updateFilter("clientId", value)}
            >
              <SelectTrigger className="border-border/80 bg-background/70 hover:border-primary/25 w-full rounded-md shadow-xs transition-colors data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {options.includeUnassigned ? (
                  <SelectItem value="unassigned">
                    Unassigned accounts
                  </SelectItem>
                ) : null}
                {options.clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {showPlatform ? (
          <div className={`space-y-2 ${platformColumnClass}`}>
            <Label className="text-foreground/75 px-0.5 text-xs font-medium">
              Platform
            </Label>
            <Select
              value={values.platform ?? "all"}
              onValueChange={(value) => updateFilter("platform", value)}
            >
              <SelectTrigger className="border-border/80 bg-background/70 hover:border-primary/25 w-full rounded-md shadow-xs transition-colors data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {options.platforms.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {showCampaign ? (
          <div className={`space-y-2 ${standardColumnClass}`}>
            <Label className="text-foreground/75 px-0.5 text-xs font-medium">
              Campaign
            </Label>
            <Select
              value={values.campaignId ?? "all"}
              onValueChange={(value) => updateFilter("campaignId", value)}
            >
              <SelectTrigger className="border-border/80 bg-background/70 hover:border-primary/25 w-full rounded-md shadow-xs transition-colors data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {options.campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    </div>
  );
}
