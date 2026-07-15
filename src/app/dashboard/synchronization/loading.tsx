import { Skeleton } from "~/components/ui/skeleton";

export default function SynchronizationLoading() {
  return (
    <div className="mx-auto max-w-[96rem] space-y-7">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28 rounded-full" />
        <Skeleton className="h-11 w-80 rounded-xl" />
        <Skeleton className="h-5 w-full max-w-2xl rounded-lg" />
      </div>
      <Skeleton className="h-[28rem] w-full rounded-[1.25rem]" />
    </div>
  );
}
