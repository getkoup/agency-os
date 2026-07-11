"use client";

import { useRouter, useSearchParams } from "next/navigation";

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
    clients: Array<{ id: string; name: string }>;
    includeUnassigned: boolean;
    platforms: string[];
    campaigns: Array<{ id: string; name: string }>;
  };
}

export function DashboardFilters({ values, options }: DashboardFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    next.set("performancePage", "1");
    next.set("leadPage", "1");
    router.push(`/dashboard?${next.toString()}`);
  }

  return (
    <div className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-2">
        <Label htmlFor="from">From</Label>
        <Input
          id="from"
          type="date"
          value={values.from}
          onChange={(event) => updateFilter("from", event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="to">To</Label>
        <Input
          id="to"
          type="date"
          value={values.to}
          onChange={(event) => updateFilter("to", event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Client</Label>
        <Select
          value={values.clientId ?? "all"}
          onValueChange={(value) => updateFilter("clientId", value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {options.includeUnassigned ? (
              <SelectItem value="unassigned">Unassigned accounts</SelectItem>
            ) : null}
            {options.clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Platform</Label>
        <Select
          value={values.platform ?? "all"}
          onValueChange={(value) => updateFilter("platform", value)}
        >
          <SelectTrigger>
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
      <div className="space-y-2">
        <Label>Campaign</Label>
        <Select
          value={values.campaignId ?? "all"}
          onValueChange={(value) => updateFilter("campaignId", value)}
        >
          <SelectTrigger>
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
    </div>
  );
}
