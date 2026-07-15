import { Skeleton } from "~/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-[96rem] space-y-7">
      <div className="space-y-3">
        <Skeleton className="h-3 w-36 rounded-full" />
        <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
        <Skeleton className="h-5 w-full max-w-2xl rounded-lg" />
      </div>
      <Skeleton className="h-24 w-full rounded-[1.2rem]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-[1.2rem]" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-96 rounded-[1.25rem]" />
        <Skeleton className="h-96 rounded-[1.25rem]" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-[1.25rem]" />
        <Skeleton className="h-80 rounded-[1.25rem]" />
      </div>
    </main>
  );
}
