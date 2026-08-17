import {
  Activity,
  BarChart3,
  ClipboardList,
  Building2,
  DatabaseZap,
  HandCoins,
  LayoutDashboard,
  ListFilter,
  Settings,
  TableProperties,
  Target,
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
  access?: "sales_commissions_v2";
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
    href: "/dashboard/assignments",
    label: "Assignments",
    icon: ClipboardList,
    roles: ["owner", "admin", "manager"],
    group: "Workspace",
  },
  {
    href: "/dashboard/sales-tracking",
    label: "Sales Tracking",
    icon: Target,
    roles: ["owner", "admin", "manager"],
    group: "Workspace",
  },
  {
    href: "/dashboard/sales-commissions-v2",
    label: "Commission",
    icon: HandCoins,
    roles: ["owner", "admin"],
    group: "Workspace",
    access: "sales_commissions_v2",
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
    label: "Data Sync",
    icon: DatabaseZap,
    roles: ["owner", "admin", "client"],
    group: "Workspace",
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

export function canViewDashboardDestination(
  destination: DashboardDestination,
  role: UserRole,
  salesCommissionsV2Enabled: boolean,
) {
  return (
    destination.roles.includes(role) &&
    (destination.access !== "sales_commissions_v2" || salesCommissionsV2Enabled)
  );
}

export function isDestinationActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}
