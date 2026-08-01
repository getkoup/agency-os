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
import { SalesCategoryDialog } from "~/features/sales-commissions/sales-category-dialog";
import { SalesOfferDialog } from "~/features/sales-commissions/sales-offer-dialog";
import {
  AttributionModeControl,
  CommissionRateCell,
  SalespersonRow,
} from "~/features/sales-commissions/salesperson-commission-settings";
import { type RouterOutputs } from "~/trpc/react";

type SetupResult = RouterOutputs["salesCommissions"]["setup"];

export function SalesCommissionSetup({ result }: { result: SetupResult }) {
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
          <CardTitle>Client and attribution</CardTitle>
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
          <AttributionModeControl
            key={clientId}
            clientId={clientId}
            value={result.attributionMode}
          />
        </CardContent>
      </Card>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 flex-row items-center justify-between border-b px-6 py-5">
          <div>
            <CardTitle>Service categories</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Categories drive salesperson commission rates.
            </p>
          </div>
          <SalesCategoryDialog clientId={clientId} />
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Category</TableHead>
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
                    <SalesCategoryDialog
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
              Add the first category, such as Tint or Ceramic.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 flex-row items-center justify-between border-b px-6 py-5">
          <div>
            <CardTitle>Offers and description rules</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              The highest-priority literal match wins. Equal priorities are
              flagged as ambiguous.
            </p>
          </div>
          <SalesOfferDialog clientId={clientId} categories={activeCategories} />
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table className="min-w-[64rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Offer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.offers.map((offer) => (
                <TableRow key={offer.id}>
                  <TableCell className="pl-6 font-medium">
                    {offer.name}
                  </TableCell>
                  <TableCell>
                    {result.categories.find(
                      (category) => category.id === offer.categoryId,
                    )?.name ?? "Unknown"}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    {offer.keywords.join(", ")}
                  </TableCell>
                  <TableCell>
                    {offer.matchMode === "any" ? "Any" : "All"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {offer.priority}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${offer.revenueValue}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        offer.status === "active" ? "default" : "secondary"
                      }
                    >
                      {offer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <SalesOfferDialog
                      clientId={clientId}
                      categories={result.categories}
                      offer={offer}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!result.offers.length ? (
            <p className="text-muted-foreground p-6 text-sm">
              Add an offer after creating at least one category.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 border-b px-6 py-5">
          <CardTitle>Salespersons</CardTitle>
          <p className="text-muted-foreground text-sm">
            Users appear automatically after enriched GHL appointments
            synchronize.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">GHL name</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>GHL identity</TableHead>
                <TableHead>Last observed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.salespeople.map((person) => (
                <SalespersonRow
                  key={person.id}
                  clientId={clientId}
                  person={person}
                />
              ))}
            </TableBody>
          </Table>
          {!result.salespeople.length ? (
            <p className="text-muted-foreground p-6 text-sm">
              No salesperson identities have been synchronized for this client
              yet.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sage border-border/80 gap-0 overflow-hidden rounded-[1.25rem] py-0">
        <CardHeader className="border-border/70 border-b px-6 py-5">
          <CardTitle>Commission matrix</CardTitle>
          <p className="text-muted-foreground text-sm">
            Fixed USD commission for each salesperson and service category.
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
                          value.salespersonId === person.id &&
                          value.categoryId === category.id,
                      );
                      return (
                        <TableCell key={category.id}>
                          <CommissionRateCell
                            clientId={clientId}
                            salespersonId={person.id}
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
              Active salespersons and categories are required before commission
              rates can be entered.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
