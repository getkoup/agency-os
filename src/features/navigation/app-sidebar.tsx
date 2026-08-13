"use client";

import { ChevronsUp, LogOut, Settings, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";
import {
  DASHBOARD_DESTINATIONS,
  canViewDashboardDestination,
  isDestinationActive,
} from "~/features/navigation/dashboard-destinations";
import { USER_ROLE_LABELS, type UserRole } from "~/lib/roles";

export function AppSidebar({
  role,
  name,
  email,
  signOutAction,
  canAccessSalesCommissionsV2,
}: {
  role: UserRole;
  name: string | null;
  email: string;
  canAccessSalesCommissionsV2: boolean;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const identity = name ?? email;
  const initials = identity
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className="md:py-[10px] md:pl-[10px]"
    >
      <SidebarHeader className="px-3 pt-4 pb-6">
        <Link
          href="/dashboard"
          prefetch={false}
          className="flex items-center gap-3 font-semibold tracking-tight"
        >
          <span className="bg-sidebar-primary text-sidebar-primary-foreground grid size-9 shrink-0 place-items-center rounded-xl shadow-lg">
            <Sparkles className="size-[1.05rem]" aria-hidden="true" />
          </span>
          <span className="group-data-[collapsible=icon]:hidden">
            <span className="block">Agency OS</span>
            <span className="text-sidebar-foreground/45 block text-[0.6rem] font-medium tracking-[0.14em] uppercase">
              Operating intelligence
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2">
        {(["Workspace", "Administration"] as const).map((group) => {
          const destinations = DASHBOARD_DESTINATIONS.filter(
            (item) =>
              item.group === group &&
              canViewDashboardDestination(
                item,
                role,
                canAccessSalesCommissionsV2,
              ),
          );
          if (destinations.length === 0) return null;

          return (
            <SidebarGroup key={group} className="px-0 py-2">
              <SidebarGroupLabel className="text-sidebar-foreground/45 px-3 text-[0.65rem] font-semibold tracking-[0.16em] uppercase group-data-[collapsible=icon]:hidden">
                {group}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {destinations.map((item) => {
                    const active = isDestinationActive(pathname, item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className="text-sidebar-foreground/68 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:text-sidebar-accent-foreground relative h-11 rounded-[0.65rem] px-3 data-[active=true]:bg-[linear-gradient(110deg,var(--sidebar-accent),color-mix(in_oklch,var(--sidebar-accent),white_5%))] data-[active=true]:font-semibold data-[active=true]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--sidebar-primary)_12%,transparent),0_5px_18px_rgba(0,0,0,0.12)]"
                        >
                          <Link href={item.href} prefetch={false}>
                            <item.icon className="size-[1.05rem]" />
                            <span>{item.label}</span>
                            {active ? (
                              <span className="bg-sidebar-primary ml-auto size-1.5 rounded-full group-data-[collapsible=icon]:hidden" />
                            ) : null}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover:bg-sidebar-accent/60 focus-visible:ring-sidebar-ring flex w-full items-center gap-3 rounded-[0.65rem] bg-white/[0.025] p-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors group-data-[collapsible=icon]:justify-center focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Open account menu"
            >
              <span className="bg-sidebar-accent text-sidebar-accent-foreground grid size-9 shrink-0 place-items-center rounded-[0.6rem] text-xs font-semibold">
                {initials || "A"}
              </span>
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <span className="text-sidebar-foreground block truncate text-sm font-medium">
                  {identity}
                </span>
                <span className="text-sidebar-foreground/55 block truncate text-xs">
                  {USER_ROLE_LABELS[role]}
                </span>
              </span>
              <ChevronsUp className="text-sidebar-foreground/45 size-4 group-data-[collapsible=icon]:hidden" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={10}
            className="w-64 rounded-xl p-2"
          >
            <DropdownMenuLabel className="px-2 py-2 font-normal">
              <span className="block truncate text-sm font-semibold">
                {identity}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {email} · {USER_ROLE_LABELS[role]}
              </span>
            </DropdownMenuLabel>
            {role === "owner" || role === "admin" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" prefetch={false}>
                    <Settings />
                    Workspace settings
                  </Link>
                </DropdownMenuItem>
                {role === "owner" ? (
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/users" prefetch={false}>
                      <Users />
                      Users & access
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <DropdownMenuItem
                asChild
                className="text-destructive focus:text-destructive"
              >
                <button type="submit" className="w-full">
                  <LogOut />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
