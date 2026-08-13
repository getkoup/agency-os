"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";

export function SalesCommissionsV2AccessForm({
  initialAdminEnabled,
}: {
  initialAdminEnabled: boolean;
}) {
  const router = useRouter();
  const [adminEnabled, setAdminEnabled] = useState(initialAdminEnabled);
  const [message, setMessage] = useState<string | null>(null);
  const save = api.settings.updateSalesCommissionsV2AdminAccess.useMutation({
    onSuccess: (result) => {
      setMessage(
        result.adminEnabled
          ? "Admin access to Sales & Commissions v2 is enabled."
          : "Sales & Commissions v2 is owner-only.",
      );
      router.refresh();
    },
    onError: (error) => setMessage(error.message),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        save.mutate({ enabled: adminEnabled });
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id="sales-commissions-v2-admin-access"
          checked={adminEnabled}
          onCheckedChange={(checked) => setAdminEnabled(checked === true)}
        />
        <div className="space-y-1">
          <Label htmlFor="sales-commissions-v2-admin-access">
            Allow admins to access Sales & Commissions v2
          </Label>
          <p className="text-muted-foreground text-sm leading-6">
            Owners always have access. Managers and clients cannot access v2.
          </p>
        </div>
      </div>
      <Button
        type="submit"
        disabled={save.isPending || adminEnabled === initialAdminEnabled}
      >
        {save.isPending ? "Saving…" : "Save access"}
      </Button>
      {message ? (
        <p
          className={
            save.isError ? "text-destructive text-sm" : "text-primary text-sm"
          }
          role="status"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
