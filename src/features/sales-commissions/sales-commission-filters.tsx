"use client";

import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "~/components/ui/badge";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  DateRangeFilter,
  type DatePreset,
} from "~/features/dashboard/date-range-filter";

export function SalesCommissionFilters({
  values,
  options,
}: {
  values: {
    from: string;
    to: string;
    clientId?: string;
    salespersonId?: string;
    status?: string;
    categoryId?: string;
    classificationStatus?: string;
  };
  options: {
    clients: Array<{ id: string; name: string }>;
    salespeople: Array<{
      id: string;
      clientId: string;
      name: string;
      isUnnamed: boolean;
    }>;
    categories: Array<{ id: string; clientId: string; name: string }>;
  };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preset = (searchParams.get("range") ??
    (!searchParams.has("from") && !searchParams.has("to")
      ? "thisMonth"
      : "custom")) as DatePreset;
  const visibleSalespeople = values.clientId
    ? options.salespeople.filter(
        (person) => person.clientId === values.clientId,
      )
    : options.salespeople;
  const visibleCategories = values.clientId
    ? options.categories.filter(
        (category) => category.clientId === values.clientId,
      )
    : options.categories;

  function navigate(next: URLSearchParams) {
    next.set("salesCommissionPage", "1");
    router.push(`${pathname}?${next.toString()}`);
  }

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    if (key === "clientId") {
      next.delete("salespersonId");
      next.delete("categoryId");
    }
    navigate(next);
  }

  function updateDates(from: string, to: string, range: DatePreset) {
    const next = new URLSearchParams(searchParams);
    next.set("from", from);
    next.set("to", to);
    next.set("range", range);
    navigate(next);
  }

  return (
    <div className="shadow-sage border-border/80 bg-card overflow-hidden rounded-[1.4rem] border">
      <div className="border-border/70 from-primary/[0.07] via-secondary/35 to-card flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Reporting controls</p>
            <p className="text-muted-foreground text-xs">
              Appointment dates use each client&apos;s local timezone.
            </p>
          </div>
        </div>
        <Badge variant="outline">USD · attributed values</Badge>
      </div>
      <div className="grid items-end gap-4 p-5 md:grid-cols-2 xl:grid-cols-12">
        <DateRangeFilter
          from={values.from}
          to={values.to}
          preset={preset}
          onChange={updateDates}
          className="md:col-span-2 xl:col-span-4"
        />
        <FilterSelect
          label="Client"
          value={values.clientId ?? "all"}
          onChange={(value) => update("clientId", value)}
          className="xl:col-span-2"
          options={[
            { value: "all", label: "All clients" },
            ...options.clients.map((client) => ({
              value: client.id,
              label: client.name,
            })),
          ]}
        />
        <FilterSelect
          label="Salesperson"
          value={values.salespersonId ?? "all"}
          onChange={(value) => update("salespersonId", value)}
          className="xl:col-span-2"
          options={[
            { value: "all", label: "All salespeople" },
            { value: "unassigned", label: "Unassigned / widget" },
            ...visibleSalespeople.map((person) => ({
              value: person.id,
              label: person.name,
            })),
          ]}
        />
        <FilterSelect
          label="Appointment status"
          value={values.status ?? "all"}
          onChange={(value) => update("appointmentStatus", value)}
          className="xl:col-span-2"
          options={[
            { value: "all", label: "All statuses" },
            { value: "showed", label: "Showed" },
            { value: "noshow", label: "No-show" },
            { value: "confirmed", label: "Confirmed" },
            { value: "new", label: "New" },
            { value: "cancelled", label: "Cancelled" },
            { value: "invalid", label: "Invalid" },
          ]}
        />
        <FilterSelect
          label="Category"
          value={values.categoryId ?? "all"}
          onChange={(value) => update("categoryId", value)}
          className="xl:col-span-1"
          options={[
            { value: "all", label: "All categories" },
            ...visibleCategories.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          ]}
        />
        <FilterSelect
          label="Classification"
          value={values.classificationStatus ?? "all"}
          onChange={(value) => update("classificationStatus", value)}
          className="xl:col-span-1"
          options={[
            { value: "all", label: "All" },
            { value: "matched", label: "Matched" },
            { value: "unmatched", label: "Uncategorized" },
            { value: "ambiguous", label: "Ambiguous" },
            { value: "missing_description", label: "Missing text" },
          ]}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label className="text-foreground/75 px-0.5 text-xs font-medium">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
