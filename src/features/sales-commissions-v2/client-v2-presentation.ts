import { parseUsdToCents } from "~/features/revenue/calculations";
import { type RouterOutputs } from "~/trpc/react";

export type ClientV2Group =
  RouterOutputs["salesCommissionsV2"]["report"]["clientGroups"][number];

export type ClientV2CategoryContribution = {
  key: string;
  name: string;
  appointments: number;
  showed: number;
  revenueCents: bigint;
  commissionCents: bigint;
  share: number;
};

export function aggregateClientV2Categories(
  client: ClientV2Group,
): ClientV2CategoryContribution[] {
  const categories = new Map<
    string,
    Omit<ClientV2CategoryContribution, "share">
  >();
  for (const person of client.salespeople) {
    for (const category of person.categories) {
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
