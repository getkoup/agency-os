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

type SetupResult = RouterOutputs["salesCommissionsV2"]["setup"];
type Category = SetupResult["categories"][number];
type MappingRule = SetupResult["rules"][number];

export function SalesCommissionV2MappingRuleDialog({
  clientId,
  categories,
  rule,
}: {
  clientId: string;
  categories: Category[];
  rule?: MappingRule;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setError(null);
    router.refresh();
  };
  const create = api.salesCommissionsV2.createMappingRule.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const update = api.salesCommissionsV2.updateMappingRule.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={!categories.length}
          variant={rule ? "ghost" : "default"}
          size={rule ? "sm" : "default"}
        >
          {rule ? (
            "Edit"
          ) : (
            <>
              <Plus aria-hidden="true" /> Add mapping rule
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule ? "Edit mapping rule" : "Add mapping rule"}
          </DialogTitle>
          <DialogDescription>
            Match normalized phrases within only the selected structured field.
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
              field:
                getFormString(data, "field") === "service"
                  ? ("service" as const)
                  : ("category" as const),
              keywords: getFormString(data, "keywords")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              matchMode:
                getFormString(data, "matchMode") === "all"
                  ? ("all" as const)
                  : ("any" as const),
              priority: Number(getFormString(data, "priority")),
            };
            if (rule) {
              update.mutate({
                ...input,
                ruleId: rule.id,
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
          <Field label="Target category">
            <Select
              name="categoryId"
              defaultValue={rule?.categoryId ?? categories[0]?.id}
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
          <Field label="Rule name">
            <Input
              name="name"
              maxLength={100}
              defaultValue={rule?.name}
              placeholder="CC abbreviation"
              required
            />
          </Field>
          <Field label="Source field">
            <Select name="field" defaultValue={rule?.field ?? "category"}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="service">Service</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Keywords or phrases">
            <Input
              name="keywords"
              defaultValue={rule?.keywords.join(", ")}
              placeholder="cc, ceramic coating"
              required
            />
            <p className="text-muted-foreground text-xs">
              Separate values with commas. Matching is normalized and literal.
            </p>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Match mode">
              <Select name="matchMode" defaultValue={rule?.matchMode ?? "any"}>
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
                defaultValue={rule?.priority ?? 0}
                required
              />
            </Field>
          </div>
          {rule ? (
            <Field label="Status">
              <Select name="status" defaultValue={rule.status}>
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
              {pending ? "Saving…" : "Save mapping rule"}
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
