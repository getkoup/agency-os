"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "~/components/ui/button";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
      <div className="shadow-sage border-border/80 bg-card max-w-md space-y-5 rounded-[1.25rem] border p-8 text-center">
        <span className="bg-secondary text-secondary-foreground mx-auto grid size-12 place-items-center rounded-full">
          <CircleAlert className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Dashboard unavailable
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            We could not load this view. Retry the request to continue.
          </p>
        </div>
        <Button className="h-11 rounded-full px-6" onClick={reset}>
          Retry
        </Button>
      </div>
    </main>
  );
}
