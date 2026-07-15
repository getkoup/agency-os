import { TRPCError } from "@trpc/server";
import { Activity, LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { TooltipProvider } from "~/components/ui/tooltip";
import { AppSidebar } from "~/features/navigation/app-sidebar";
import { DashboardRouteContext } from "~/features/navigation/dashboard-route-context";
import { USER_ROLE_LABELS } from "~/lib/roles";
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
  const identity = user.name ?? user.email;
  const initials = identity
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <TooltipProvider>
      <SidebarProvider className="bg-background md:p-[10px]">
        <AppSidebar role={user.role} name={user.name} email={user.email} />
        <SidebarInset className="shadow-sage bg-card min-w-0 overflow-hidden md:rounded-[1.35rem]">
          <header className="bg-card/95 sticky top-0 z-30 flex h-16 items-center justify-between border-b px-3 backdrop-blur sm:px-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <SidebarTrigger className="size-11 md:size-9" />
              <div className="bg-border hidden h-5 w-px sm:block" />
              <DashboardRouteContext />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="text-muted-foreground hidden items-center gap-1.5 text-xs lg:flex">
                <Activity className="text-chart-2 size-3.5" />
                <span>Workspace live</span>
              </div>
              <Badge
                variant="secondary"
                className="hidden rounded-full px-2.5 font-medium sm:inline-flex"
              >
                {USER_ROLE_LABELS[user.role]}
              </Badge>
              <span
                className="bg-secondary text-secondary-foreground grid size-9 place-items-center rounded-full text-xs font-semibold"
                title={identity}
              >
                {initials || "A"}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="size-11 rounded-full md:size-9"
                  aria-label="Sign out"
                >
                  <LogOut />
                </Button>
              </form>
            </div>
          </header>
          <div className="bg-card min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
