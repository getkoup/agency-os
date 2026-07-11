import { Skeleton } from "~/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-80 w-full" />
    </main>
  );
}
