"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function AccountFilters({
  clients,
  platforms,
  includeUnassigned,
}: {
  clients: Array<{ id: string; name: string }>;
  platforms: string[];
  includeUnassigned: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  function update(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    next.set("accountPage", "1");
    router.push(`${pathname}?${next.toString()}`);
  }
  return (
    <div className="shadow-sage border-border/80 bg-secondary/35 grid gap-3 rounded-[1.2rem] border p-3 sm:grid-cols-2 lg:grid-cols-5">
      <Input
        placeholder="Search accounts"
        defaultValue={search.get("query") ?? ""}
        className="bg-card h-11 rounded-xl"
        onBlur={(event) => update("query", event.target.value.trim())}
      />
      <Select
        value={search.get("clientId") ?? "all"}
        onValueChange={(value) => update("clientId", value)}
      >
        <SelectTrigger className="bg-card h-11 w-full rounded-xl">
          <SelectValue placeholder="Client" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All clients</SelectItem>
          {includeUnassigned ? (
            <SelectItem value="unassigned">Unassigned</SelectItem>
          ) : null}
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={search.get("platform") ?? "all"}
        onValueChange={(value) => update("platform", value)}
      >
        <SelectTrigger className="bg-card h-11 w-full rounded-xl">
          <SelectValue placeholder="Platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All platforms</SelectItem>
          {platforms.map((platform) => (
            <SelectItem key={platform} value={platform}>
              {platform}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={search.get("status") ?? "all"}
        onValueChange={(value) => update("status", value)}
      >
        <SelectTrigger className="bg-card h-11 w-full rounded-xl">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="disconnected">Disconnected</SelectItem>
          <SelectItem value="ignored">Ignored</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={search.get("assignment") ?? "all"}
        onValueChange={(value) => update("assignment", value)}
      >
        <SelectTrigger className="bg-card h-11 w-full rounded-xl">
          <SelectValue placeholder="Assignment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All assignments</SelectItem>
          <SelectItem value="assigned">Assigned</SelectItem>
          {includeUnassigned ? (
            <SelectItem value="unassigned">Unassigned</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  );
}
