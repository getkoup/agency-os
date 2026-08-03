"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SynchronizationStatusRefresher({
  isActive,
}: {
  isActive: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [isActive, router]);

  return null;
}
