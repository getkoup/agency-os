"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock3, SlidersHorizontal } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
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
    2 + Number(showClient) + Number(showPlatform) + Number(showCampaign);
  const gridColumns =
    controlCount === 5
      ? "lg:grid-cols-5"
      : controlCount === 4
        ? "lg:grid-cols-4"
        : controlCount === 3
          ? "lg:grid-cols-3"
          : "lg:grid-cols-2";
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

  return (
    <div className="shadow-sage border-border/80 from-secondary/55 via-card to-card space-y-4 rounded-[1.4rem] border bg-gradient-to-br p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Reporting controls</p>
            <p className="text-muted-foreground text-xs">
              Dates are applied in the client&apos;s local timezone.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="bg-card gap-1.5 rounded-full px-3">
          <Clock3 className="size-3.5" aria-hidden="true" />
          {timezoneLabel}
        </Badge>
      </div>
      <div className={`grid gap-3 sm:grid-cols-2 ${gridColumns}`}>
        <div className="space-y-1.5">
          <Label htmlFor="from" className="text-muted-foreground px-1 text-xs">
            From
          </Label>
          <Input
            id="from"
            type="date"
            value={values.from}
            className="bg-card h-11 rounded-xl"
            onChange={(event) => updateFilter("from", event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-muted-foreground px-1 text-xs">
            To
          </Label>
          <Input
            id="to"
            type="date"
            value={values.to}
            className="bg-card h-11 rounded-xl"
            onChange={(event) => updateFilter("to", event.target.value)}
          />
        </div>
        {showClient ? (
          <div className="space-y-1.5">
            <Label className="text-muted-foreground px-1 text-xs">Client</Label>
            <Select
              value={values.clientId ?? "all"}
              onValueChange={(value) => updateFilter("clientId", value)}
            >
              <SelectTrigger className="bg-card h-11 w-full rounded-xl">
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
          <div className="space-y-1.5">
            <Label className="text-muted-foreground px-1 text-xs">
              Platform
            </Label>
            <Select
              value={values.platform ?? "all"}
              onValueChange={(value) => updateFilter("platform", value)}
            >
              <SelectTrigger className="bg-card h-11 w-full rounded-xl">
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
          <div className="space-y-1.5">
            <Label className="text-muted-foreground px-1 text-xs">
              Campaign
            </Label>
            <Select
              value={values.campaignId ?? "all"}
              onValueChange={(value) => updateFilter("campaignId", value)}
            >
              <SelectTrigger className="bg-card h-11 w-full rounded-xl">
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
