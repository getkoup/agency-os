"use client";

import { Button } from "~/components/ui/button";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">Dashboard unavailable</h1>
        <p className="text-muted-foreground text-sm">
          The dashboard could not be loaded. Try again.
        </p>
        <Button onClick={reset}>Retry</Button>
      </div>
    </main>
  );
}
