"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

function AccountSelect({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 xl:col-span-2">
      <Label className="text-foreground/75 px-0.5 text-xs font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}

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
  const controlClassName =
    "border-border/80 bg-background/70 hover:border-primary/25 h-10 w-full shadow-xs transition-colors data-[size=default]:h-10";

  return (
    <div className="shadow-sage border-border/80 bg-card overflow-hidden rounded-[1.4rem] border">
      <div className="border-border/70 from-primary/[0.07] via-secondary/35 to-card flex items-center gap-3 border-b bg-gradient-to-r px-5 py-4">
        <span className="bg-primary/10 text-primary ring-primary/10 flex size-10 items-center justify-center rounded-xl ring-1">
          <SlidersHorizontal className="size-[1.125rem]" aria-hidden="true" />
        </span>
        <div className="space-y-0.5">
          <p className="text-foreground text-sm font-semibold tracking-[-0.01em]">
            Account filters
          </p>
          <p className="text-muted-foreground text-[0.8125rem]">
            Search and narrow connected advertising accounts.
          </p>
        </div>
      </div>
      <div className="grid items-end gap-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-10">
        <div className="space-y-2 sm:col-span-2 xl:col-span-2">
          <Label
            htmlFor="account-search"
            className="text-foreground/75 px-0.5 text-xs font-medium"
          >
            Search
          </Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id="account-search"
              placeholder="Search accounts"
              defaultValue={search.get("query") ?? ""}
              className={`${controlClassName} pl-9`}
              onBlur={(event) => update("query", event.target.value.trim())}
            />
          </div>
        </div>
        <AccountSelect label="Client">
          <Select
            value={search.get("clientId") ?? "all"}
            onValueChange={(value) => update("clientId", value)}
          >
            <SelectTrigger className={controlClassName}>
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
        </AccountSelect>
        <AccountSelect label="Platform">
          <Select
            value={search.get("platform") ?? "all"}
            onValueChange={(value) => update("platform", value)}
          >
            <SelectTrigger className={controlClassName}>
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
        </AccountSelect>
        <AccountSelect label="Status">
          <Select
            value={search.get("status") ?? "all"}
            onValueChange={(value) => update("status", value)}
          >
            <SelectTrigger className={controlClassName}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disconnected">Disconnected</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
            </SelectContent>
          </Select>
        </AccountSelect>
        <AccountSelect label="Assignment">
          <Select
            value={search.get("assignment") ?? "all"}
            onValueChange={(value) => update("assignment", value)}
          >
            <SelectTrigger className={controlClassName}>
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
        </AccountSelect>
      </div>
    </div>
  );
}
