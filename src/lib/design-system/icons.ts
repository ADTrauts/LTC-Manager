import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleCheck,
  CircleX,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Search,
  Shield,
  User,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Central icon registry — import icons from here, not directly from lucide-react.
 * DS-002: single mapping for zones, modules, readiness, and shell chrome.
 */
export const AppIcons = {
  operationsCenter: LayoutDashboard,
  todaysWork: CalendarClock,
  locations: MapPin,
  employees: Users,
  logs: ClipboardList,
  menus: UtensilsCrossed,
  assets: Package,
  repairs: Wrench,
  review: FileBarChart,
  administration: Shield,
  operationalMode: Activity,
  ready: CircleCheck,
  blocked: CircleX,
  inProgress: Loader2,
  warning: AlertTriangle,
  success: CheckCircle2,
  search: Search,
  notifications: Bell,
  user: User,
  signOut: LogOut,
  facility: Building2,
} as const satisfies Record<string, LucideIcon>;

export type AppIconKey = keyof typeof AppIcons;

/** Default nav path → icon key (for shell and future module chrome). */
export const NAV_PATH_ICON_KEYS: Partial<Record<string, AppIconKey>> = {
  "/dashboard": "operationsCenter",
  "/operations": "operationsCenter",
  "/today": "todaysWork",
  "/staffing": "todaysWork",
  "/units": "locations",
  "/unit": "locations",
  "/employees": "employees",
  "/logs": "logs",
  "/menus": "menus",
  "/assets": "assets",
  "/repairs": "repairs",
  "/reports": "review",
  "/admin": "administration",
};

export function resolveNavIconKey(href: string): AppIconKey | undefined {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  if (NAV_PATH_ICON_KEYS[path]) {
    return NAV_PATH_ICON_KEYS[path];
  }
  const prefix = Object.keys(NAV_PATH_ICON_KEYS)
    .filter((key) => path.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? NAV_PATH_ICON_KEYS[prefix] : undefined;
}
