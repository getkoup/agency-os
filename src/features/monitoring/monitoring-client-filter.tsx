"use client";

import { Building2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function MonitoringClientFilter({
  clients,
  value,
}: {
  clients: Array<{ id: string; name: string }>;
  value?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateClient(clientId: string) {
    const next = new URLSearchParams(searchParams);
    if (clientId === "all") next.delete("clientId");
    else next.set("clientId", clientId);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="shadow-sage border-border/80 bg-card flex flex-col gap-4 rounded-[1.25rem] border p-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
          <Building2 className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium">Monitoring scope</p>
          <p className="text-muted-foreground text-sm">
            Select one client or monitor all accessible clients.
          </p>
        </div>
      </div>
      <div className="w-full space-y-2 sm:max-w-sm">
        <Label>Client</Label>
        <Select value={value ?? "all"} onValueChange={updateClient}>
          <SelectTrigger className="h-10 w-full">
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
  );
}
