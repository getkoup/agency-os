"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function CampaignTrackerSearch({
  initialQuery,
}: {
  initialQuery: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  return (
    <form
      className="w-full space-y-2 sm:col-span-2 xl:min-w-80 xl:flex-1"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const value = query.trim();
        if (value === (searchParams.get("query") ?? "")) return;
        const next = new URLSearchParams(searchParams);
        if (value) next.set("query", value);
        else next.delete("query");
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    >
      <Label
        htmlFor="campaign-tracker-search"
        className="text-foreground/75 px-0.5 text-xs font-medium"
      >
        Search
      </Label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id="campaign-tracker-search"
            type="search"
            value={query}
            maxLength={100}
            placeholder="Client or campaign"
            className="h-10 pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </div>
    </form>
  );
}
