"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { getFormString } from "~/lib/form-data";
import { api, type RouterOutputs } from "~/trpc/react";

type SetupResult = RouterOutputs["salesCommissions"]["setup"];
type Category = SetupResult["categories"][number];
type Offer = SetupResult["offers"][number];

export function SalesOfferDialog({
  clientId,
  categories,
  offer,
}: {
  clientId: string;
  categories: Category[];
  offer?: Offer;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setError(null);
    router.refresh();
  };
  const create = api.salesCommissions.createOffer.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const update = api.salesCommissions.updateOffer.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={!categories.length}
          variant={offer ? "ghost" : "default"}
          size={offer ? "sm" : "default"}
        >
          {offer ? (
            "Edit"
          ) : (
            <>
              <Plus aria-hidden="true" /> Add offer
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{offer ? "Edit offer" : "Add offer"}</DialogTitle>
          <DialogDescription>
            Match appointment text to a category and attributed revenue value.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const data = new FormData(event.currentTarget);
            const input = {
              clientId,
              categoryId: getFormString(data, "categoryId"),
              name: getFormString(data, "name"),
              keywords: getFormString(data, "keywords")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              matchMode:
                getFormString(data, "matchMode") === "all"
                  ? ("all" as const)
                  : ("any" as const),
              priority: Number(getFormString(data, "priority")),
              revenueValue: getFormString(data, "revenueValue"),
            };
            if (offer) {
              update.mutate({
                ...input,
                offerId: offer.id,
                status:
                  getFormString(data, "status") === "inactive"
                    ? "inactive"
                    : "active",
              });
            } else {
              create.mutate(input);
            }
          }}
        >
          <Field label="Service category">
            <Select
              name="categoryId"
              defaultValue={offer?.categoryId ?? categories[0]?.id}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Offer name">
            <Input
              name="name"
              maxLength={100}
              defaultValue={offer?.name}
              placeholder="Ceramic $299"
              required
            />
          </Field>
          <Field label="Keywords or phrases">
            <Input
              name="keywords"
              defaultValue={offer?.keywords.join(", ")}
              placeholder="299, NC299"
              required
            />
            <p className="text-muted-foreground text-xs">
              Separate values with commas.
            </p>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Match mode">
              <Select name="matchMode" defaultValue={offer?.matchMode ?? "any"}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any keyword</SelectItem>
                  <SelectItem value="all">All keywords</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Input
                name="priority"
                type="number"
                min={0}
                max={1_000}
                defaultValue={offer?.priority ?? 0}
                required
              />
            </Field>
          </div>
          <Field label="Attributed revenue (USD)">
            <Input
              name="revenueValue"
              type="number"
              min="0"
              step="0.01"
              defaultValue={offer?.revenueValue}
              required
            />
          </Field>
          {offer ? (
            <Field label="Status">
              <Select name="status" defaultValue={offer.status}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button disabled={pending}>
              {pending ? "Saving…" : "Save offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
