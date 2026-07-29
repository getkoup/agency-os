import { TRPCError } from "@trpc/server";
import { Activity } from "lucide-react";
import { redirect } from "next/navigation";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { TooltipProvider } from "~/components/ui/tooltip";
import { AppSidebar } from "~/features/navigation/app-sidebar";
import { DashboardRouteContext } from "~/features/navigation/dashboard-route-context";
import { signOut } from "~/server/auth";
import { getAuthenticatedUser } from "~/server/auth/current-user";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getAuthenticatedUser().catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
      redirect("/login");
    throw error;
  });
  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh overflow-hidden bg-[#244b37] md:p-2.5 dark:bg-[#173d2b]">
        <AppSidebar
          role={user.role}
          name={user.name}
          email={user.email}
          signOutAction={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        />
        <SidebarInset className="shadow-sage-floating bg-background h-svh min-h-0 min-w-0 overflow-hidden md:h-[calc(100svh-1.25rem)] md:rounded-[1.5rem]">
          <header className="bg-card/88 border-border/70 z-30 flex h-16 shrink-0 items-center justify-between border-b px-3 backdrop-blur-xl sm:px-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <SidebarTrigger className="size-11 md:size-9" />
              <div className="bg-border hidden h-5 w-px sm:block" />
              <DashboardRouteContext />
            </div>
            <div className="text-muted-foreground bg-secondary/60 flex items-center gap-1.5 rounded-[0.5rem] px-2.5 py-1.5 text-xs">
              <span className="relative flex size-2">
                <span className="bg-chart-2 absolute inline-flex size-full animate-ping rounded-full opacity-50" />
                <span className="bg-chart-2 relative inline-flex size-2 rounded-full" />
              </span>
              <Activity className="sr-only size-3.5" />
              <span>Workspace live</span>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_right,var(--color-accent),transparent_28rem)] p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
