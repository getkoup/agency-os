"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { SalesCommissionV2CategoryDialog } from "~/features/sales-commissions-v2/sales-commission-v2-category-dialog";
import { SalesCommissionV2MappingRuleDialog } from "~/features/sales-commissions-v2/sales-commission-v2-mapping-rule-dialog";
import {
  AttributionModeV2Control,
  CommissionRateV2Cell,
} from "~/features/sales-commissions-v2/salesperson-v2-commission-settings";
import { type RouterOutputs } from "~/trpc/react";

type SetupResult = RouterOutputs["salesCommissionsV2"]["setup"];

export function SalesCommissionV2Setup({ result }: { result: SetupResult }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clientId = result.selectedClientId;
  const activeCategories = result.categories.filter(
    (category) => category.status === "active",
  );
  const activeSalespeople = result.salespeople.filter(
    (person) => person.status === "active",
  );

  function selectClient(value: string) {
    const next = new URLSearchParams(searchParams);
    next.set("clientId", value);
    router.push(`${pathname}?${next.toString()}`);
  }

  if (!clientId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          No clients are available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sage border-border/80 gap-0 rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 border-b px-6 py-5">
          <CardTitle>Client and V2 attribution</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={selectClient}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {result.clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                    {client.status === "inactive" ? " (inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AttributionModeV2Control
            key={clientId}
            clientId={clientId}
            value={result.attributionMode}
          />
        </CardContent>
      </Card>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 flex-row items-center justify-between border-b px-6 py-5">
          <div>
            <CardTitle>V2 canonical categories</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Exact normalized Category and Service values match before rules.
            </p>
          </div>
          <SalesCommissionV2CategoryDialog clientId={clientId} />
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Category</TableHead>
                <TableHead>Normalized value</TableHead>
                <TableHead className="text-right">Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="pl-6 font-medium">
                    {category.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {category.normalizedName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {category.sortOrder}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        category.status === "active" ? "default" : "secondary"
                      }
                    >
                      {category.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <SalesCommissionV2CategoryDialog
                      clientId={clientId}
                      category={category}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!result.categories.length ? (
            <p className="text-muted-foreground p-6 text-sm">
              Add the first canonical category, such as Ceramic Coating.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 flex-row items-center justify-between border-b px-6 py-5">
          <div>
            <CardTitle>Category and service mapping rules</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Rules are field-scoped. Highest priority wins; cross-category ties
              need review.
            </p>
          </div>
          <SalesCommissionV2MappingRuleDialog
            clientId={clientId}
            categories={activeCategories}
          />
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table className="min-w-[70rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Rule</TableHead>
                <TableHead>Target category</TableHead>
                <TableHead>Source field</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="pl-6 font-medium">
                    {rule.name}
                  </TableCell>
                  <TableCell>
                    {result.categories.find(
                      (category) => category.id === rule.categoryId,
                    )?.name ?? "Unknown"}
                  </TableCell>
                  <TableCell className="capitalize">{rule.field}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    {rule.keywords.join(", ")}
                  </TableCell>
                  <TableCell>
                    {rule.matchMode === "any" ? "Any" : "All"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rule.priority}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        rule.status === "active" ? "default" : "secondary"
                      }
                    >
                      {rule.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <SalesCommissionV2MappingRuleDialog
                      clientId={clientId}
                      categories={result.categories}
                      rule={rule}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!result.rules.length ? (
            <p className="text-muted-foreground p-6 text-sm">
              Optional mapping rules handle abbreviations and service phrases.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 border-b px-6 py-5">
          <CardTitle>Synchronized salespeople</CardTitle>
          <p className="text-muted-foreground text-sm">
            Read-only shared identities. Manage names and global links in the
            existing Sales &amp; Commissions setup.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Salesperson</TableHead>
                <TableHead>GHL name</TableHead>
                <TableHead>GHL identity</TableHead>
                <TableHead>Last observed</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.salespeople.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="pl-6 font-medium">
                    {person.displayName ??
                      person.providerName ??
                      `Unnamed • ${person.externalUserId.slice(-6)}`}
                  </TableCell>
                  <TableCell>
                    {person.providerName ?? "Unnamed / removed user"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    ••••{person.externalUserId.slice(-6)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {person.lastSeenAt.toLocaleString()}
                  </TableCell>
                  <TableCell className="pr-6">
                    <Badge
                      variant={
                        person.status === "active" ? "default" : "secondary"
                      }
                    >
                      {person.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!result.salespeople.length ? (
            <p className="text-muted-foreground p-6 text-sm">
              No salesperson identities have been synchronized for this client.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 border-b px-6 py-5">
          <CardTitle>V2 commission matrix</CardTitle>
          <p className="text-muted-foreground text-sm">
            One fixed USD commission per showed appointment, salesperson, and
            matched category.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          {activeSalespeople.length && activeCategories.length ? (
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="bg-card sticky left-0 z-10 min-w-56 pl-6">
                    Salesperson
                  </TableHead>
                  {activeCategories.map((category) => (
                    <TableHead
                      key={category.id}
                      className="min-w-52 text-center"
                    >
                      {category.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSalespeople.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="bg-card sticky left-0 z-10 pl-6 font-medium">
                      {person.displayName ??
                        person.providerName ??
                        `Unnamed • ${person.externalUserId.slice(-6)}`}
                    </TableCell>
                    {activeCategories.map((category) => {
                      const rate = result.rates.find(
                        (value) =>
                          value.salespersonExternalUserId ===
                            person.externalUserId &&
                          value.categoryId === category.id,
                      );
                      return (
                        <TableCell key={category.id}>
                          <CommissionRateV2Cell
                            clientId={clientId}
                            salespersonExternalUserId={person.externalUserId}
                            categoryId={category.id}
                            initialValue={rate?.commissionValue ?? null}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground p-6 text-sm">
              Active synchronized salespeople and active V2 categories are
              required before rates can be entered.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
