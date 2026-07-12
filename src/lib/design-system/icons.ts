import {
  Activity,
  AlertTriangle,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  CircleCheck,
  CircleX,
  ClipboardList,
  ConciergeBell,
  FileBarChart,
  Layers,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Search,
  Shield,
  Shirt,
  ShoppingBag,
  User,
  Users,
  UtensilsCrossed,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Central icon registry — import icons from here, not directly from lucide-react.
 * DS-002 / DS-004: zones, modules, locations, readiness, and shell chrome.
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
  operationalMode: Layers,
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
  chevronDown: ChevronDown,
  /** @deprecated Use operationalMode — kept for readiness/activity surfaces. */
  activity: Activity,
  locationKitchen: ChefHat,
  locationServery: ConciergeBell,
  locationRetail: ShoppingBag,
  locationOffice: Briefcase,
  locationLaundry: Shirt,
  locationStorage: Warehouse,
  locationDefault: MapPin,
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
  "/issues": "repairs",
  "/reports": "review",
  "/admin": "administration",
  "/evs": "logs",
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

/** Resolve a nav href to its Lucide icon component. */
export function resolveNavIcon(href: string): LucideIcon | undefined {
  const key = resolveNavIconKey(href);
  return key ? AppIcons[key] : undefined;
}

export type LocationIconInput = {
  unitType?: string | null;
  name?: string | null;
};

/**
 * Map unit type (and optional name hints) to a location icon.
 * Falls back to generic location pin when unmapped.
 */
export function resolveLocationIcon(unit: LocationIconInput): LucideIcon {
  const name = (unit.name ?? "").toLowerCase();
  if (name.includes("laundry")) {
    return AppIcons.locationLaundry;
  }

  switch (unit.unitType) {
    case "KITCHEN":
      return AppIcons.locationKitchen;
    case "SERVERY":
      return AppIcons.locationServery;
    case "RETAIL":
      return AppIcons.locationRetail;
    case "OFFICE":
      return AppIcons.locationOffice;
    case "STORAGE":
      return AppIcons.locationStorage;
    default:
      return AppIcons.locationDefault;
  }
}

/** AppIconKey variant of resolveLocationIcon for PageHeader and shell chrome. */
export function resolveLocationIconKey(unit: LocationIconInput): AppIconKey {
  const name = (unit.name ?? "").toLowerCase();
  if (name.includes("laundry")) {
    return "locationLaundry";
  }

  switch (unit.unitType) {
    case "KITCHEN":
      return "locationKitchen";
    case "SERVERY":
      return "locationServery";
    case "RETAIL":
      return "locationRetail";
    case "OFFICE":
      return "locationOffice";
    case "STORAGE":
      return "locationStorage";
    default:
      return "locationDefault";
  }
}

/** Shared nav icon sizing — 16px default, muted unless active. */
export function navIconClassName(isActive: boolean): string {
  return isActive
    ? "h-4 w-4 shrink-0 text-zinc-900"
    : "h-4 w-4 shrink-0 text-zinc-500";
}

/** Sidebar location row icon — subtle cue beside unit name. */
export function locationIconClassName(isActive: boolean, disabled = false): string {
  if (disabled) {
    return "h-4 w-4 shrink-0 text-zinc-300";
  }
  return isActive
    ? "h-4 w-4 shrink-0 text-white/90"
    : "h-4 w-4 shrink-0 text-zinc-400";
}
