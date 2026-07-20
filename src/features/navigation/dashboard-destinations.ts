import {
  Activity,
  BarChart3,
  Building2,
  DatabaseZap,
  LayoutDashboard,
  ListFilter,
  Settings,
  TableProperties,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { type UserRole } from "~/lib/roles";

export type DashboardDestination = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  group: "Workspace" | "Administration";
};

export const DASHBOARD_DESTINATIONS: DashboardDestination[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "manager", "client"],
    group: "Workspace",
  },
  {
    href: "/dashboard/monitoring",
    label: "Monitoring",
    icon: Activity,
    roles: ["owner", "admin", "manager", "client"],
    group: "Workspace",
  },
  {
    href: "/dashboard/campaign-tracker",
    label: "Campaign Tracker",
    icon: TableProperties,
    roles: ["owner", "admin", "manager"],
    group: "Workspace",
  },
  {
    href: "/dashboard/performance",
    label: "Creatives",
    icon: BarChart3,
    roles: ["owner", "admin", "manager", "client"],
    group: "Workspace",
  },
  {
    href: "/dashboard/accounts",
    label: "Accounts",
    icon: WalletCards,
    roles: ["owner", "admin", "manager", "client"],
    group: "Workspace",
  },
  {
    href: "/dashboard/leads",
    label: "Leads",
    icon: ListFilter,
    roles: ["owner", "admin", "manager", "client"],
    group: "Workspace",
  },
  {
    href: "/dashboard/clients",
    label: "Clients",
    icon: Building2,
    roles: ["owner", "admin"],
    group: "Administration",
  },
  {
    href: "/dashboard/synchronization",
    label: "Synchronization",
    icon: DatabaseZap,
    roles: ["owner", "admin"],
    group: "Administration",
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    roles: ["owner", "admin"],
    group: "Administration",
  },
  {
    href: "/dashboard/users",
    label: "Users & Access",
    icon: Users,
    roles: ["owner"],
    group: "Administration",
  },
];

export function isDestinationActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}
