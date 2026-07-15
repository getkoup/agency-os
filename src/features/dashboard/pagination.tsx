import Link from "next/link";

import { Button } from "~/components/ui/button";

export function Pagination({
  pathname,
  searchParams,
  pageKey,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
  pageKey: string;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  function href(nextPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, item);
      } else if (value !== undefined) {
        params.set(key, value);
      }
    }
    params.set(pageKey, String(nextPage));
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="border-border/70 flex items-center justify-between gap-4 border-t px-5 pt-4">
      <p className="text-muted-foreground text-xs tabular-nums">
        Page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link
            href={href(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
          >
            Previous
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link
            href={href(Math.min(pageCount, page + 1))}
            aria-disabled={page >= pageCount}
            tabIndex={page >= pageCount ? -1 : undefined}
            className={
              page >= pageCount ? "pointer-events-none opacity-50" : undefined
            }
          >
            Next
          </Link>
        </Button>
      </div>
    </div>
  );
}
