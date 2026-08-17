import { parseUsdToCents } from "~/features/revenue/calculations";
import { type RouterOutputs } from "~/trpc/react";

export type GlobalSalespersonV2Group =
  RouterOutputs["salesCommissionsV2"]["report"]["globalSalespersonGroups"][number];

export type SalespersonV2CategoryContribution = {
  key: string;
  name: string;
  appointments: number;
  showed: number;
  revenueCents: bigint;
  commissionCents: bigint;
  share: number;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatSalesCommissionV2Money(value: string) {
  return formatSalesCommissionV2Cents(parseUsdToCents(value));
}

export function formatSalesCommissionV2Cents(cents: bigint) {
  return currencyFormatter.format(Number(cents) / 100);
}

export function getSalespersonInitials(name: string) {
  const values = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((value) => value[0]?.toUpperCase() ?? "");
  return values.join("") || "—";
}

export function aggregateSalespersonV2Categories(
  person: GlobalSalespersonV2Group,
): SalespersonV2CategoryContribution[] {
  const categories = new Map<
    string,
    Omit<SalespersonV2CategoryContribution, "share">
  >();
  for (const client of person.clients) {
    for (const category of client.categories) {
      const key = category.name.trim().toLocaleLowerCase();
      const existing = categories.get(key) ?? {
        key,
        name: category.name,
        appointments: 0,
        showed: 0,
        revenueCents: 0n,
        commissionCents: 0n,
      };
      existing.appointments += category.summary.appointments;
      existing.showed += category.summary.showed;
      existing.revenueCents += parseUsdToCents(
        category.summary.attributedRevenue,
      );
      existing.commissionCents += parseUsdToCents(category.summary.commission);
      categories.set(key, existing);
    }
  }

  const values = [...categories.values()].sort((left, right) => {
    if (right.revenueCents > left.revenueCents) return 1;
    if (right.revenueCents < left.revenueCents) return -1;
    return left.name.localeCompare(right.name);
  });
  const totalRevenueCents = values.reduce(
    (total, category) => total + category.revenueCents,
    0n,
  );

  return values.map((category) => ({
    ...category,
    share:
      totalRevenueCents === 0n
        ? 0
        : Number((category.revenueCents * 1000n) / totalRevenueCents) / 10,
  }));
}
