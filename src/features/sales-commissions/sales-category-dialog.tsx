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

type Category =
  RouterOutputs["salesCommissions"]["setup"]["categories"][number];

export function SalesCategoryDialog({
  clientId,
  category,
}: {
  clientId: string;
  category?: Category;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setError(null);
    router.refresh();
  };
  const create = api.salesCommissions.createCategory.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const update = api.salesCommissions.updateCategory.useMutation({
    onSuccess: close,
    onError: (value) => setError(value.message),
  });
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={category ? "ghost" : "default"}
          size={category ? "sm" : "default"}
        >
          {category ? (
            "Edit"
          ) : (
            <>
              <Plus aria-hidden="true" /> Add category
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit category" : "Add category"}
          </DialogTitle>
          <DialogDescription>
            Categories define the columns in the commission matrix.
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
              name: getFormString(data, "name"),
              sortOrder: Number(getFormString(data, "sortOrder")),
            };
            if (category) {
              update.mutate({
                ...input,
                categoryId: category.id,
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
          <Field label="Category name">
            <Input
              name="name"
              maxLength={100}
              defaultValue={category?.name}
              placeholder="Ceramic"
              required
            />
          </Field>
          <Field label="Display order">
            <Input
              name="sortOrder"
              type="number"
              min={0}
              max={10_000}
              defaultValue={category?.sortOrder ?? 0}
              required
            />
          </Field>
          {category ? (
            <Field label="Status">
              <Select name="status" defaultValue={category.status}>
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
              {pending ? "Saving…" : "Save category"}
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
