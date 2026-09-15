export const MOCK_FACILITY = "Terrace View Care Center";
export const MOCK_USER = "Alex Morgan · Manager";
export const MOCK_TIME = "Tue · Service day Mar 15";

export const MOCK_NAV = [
  { label: "Workspace", href: "#workspace", icon: "operationsCenter" as const },
  { label: "Today's Work", href: "#today", icon: "todaysWork" as const },
  { label: "Locations", href: "#locations", icon: "locations" as const },
  { label: "Review", href: "#review", icon: "review" as const },
];

export const MOCK_ADMIN = [
  { label: "Employees", icon: "employees" as const },
  { label: "Logs", icon: "logs" as const },
  { label: "Menus", icon: "menus" as const },
  { label: "Assets", icon: "assets" as const },
];

export const MOCK_UNITS = [
  { id: "kitchen", name: "Main Kitchen", kind: "kitchen" as const, state: "ready" as const },
  { id: "servery-a", name: "Servery A", kind: "servery" as const, state: "inProgress" as const },
  { id: "servery-b", name: "Servery B", kind: "servery" as const, state: "blocked" as const },
  { id: "retail", name: "Retail Café", kind: "retail" as const, state: "ready" as const },
  { id: "storage", name: "Dry Storage", kind: "storage" as const, state: "warning" as const },
];

export const MOCK_METRICS = [
  { label: "Open issues", value: "7", hint: "2 high priority" },
  { label: "Inspections due", value: "4", hint: "Before lunch" },
  { label: "Coverage gaps", value: "1", hint: "Servery B · PM" },
  { label: "Logs complete", value: "18/22", hint: "82% today" },
];

export const MOCK_BRIEF = [
  {
    title: "Servery B blocked on cold-hold log",
    detail: "Temp check overdue · assigned to shift lead",
    tone: "alert" as const,
  },
  {
    title: "Lunch production board reviewed",
    detail: "Kitchen ready · trayline staffing confirmed",
    tone: "ok" as const,
  },
  {
    title: "Two CHRC documents expiring this week",
    detail: "Employees · HR follow-up needed Thursday",
    tone: "warn" as const,
  },
];

export const MOCK_WORK = [
  { title: "AM temperature log — Main Kitchen", meta: "Due 07:30 · Kitchen", status: "Done" },
  { title: "Trayline setup inspection", meta: "Due 10:45 · Servery A", status: "In progress" },
  { title: "Cold-hold verification", meta: "Overdue · Servery B", status: "Blocked" },
  { title: "Dish machine chemical check", meta: "Due 14:00 · Kitchen", status: "Queued" },
  { title: "Retail end-of-day cash close", meta: "Due 18:30 · Retail Café", status: "Queued" },
];

export type DesignDirectionId = "graphite" | "harbor" | "ink" | "field";

export type DesignScreenId = "login" | "operations" | "unit" | "today";

export const DESIGN_DIRECTIONS: {
  id: DesignDirectionId;
  name: string;
  tagline: string;
  summary: string;
  references: string;
}[] = [
  {
    id: "graphite",
    name: "Graphite Rail",
    tagline: "Dark navigation rail · light work surface",
    summary:
      "Linear / modern ops tooling feel: charcoal rail, crisp white content, restrained blue accent, clear Lucide iconography.",
    references: "Linear, Notion apps, Vercel dashboard chrome",
  },
  {
    id: "harbor",
    name: "Harbor Clinical",
    tagline: "Cool clinical canvas · teal accent",
    summary:
      "Healthcare-professional without pastel childishness: cool blue-gray ground, white panels, deep teal focus, calm hierarchy.",
    references: "Epic-adjacent calm, modern clinic SaaS",
  },
  {
    id: "ink",
    name: "Ink Console",
    tagline: "High-density · hairline structure",
    summary:
      "Stripe Dashboard density: white canvas, charcoal ink, tight spacing, status color only when it earns attention.",
    references: "Stripe Dashboard, Mercury, Fintech ops",
  },
  {
    id: "field",
    name: "Field Ops",
    tagline: "Navy structure · stone canvas",
    summary:
      "Field-service seriousness: stone background, deep navy primary actions, amber only for alerts, sturdy type and icons.",
    references: "ServiceTitan-clean, industrial SaaS",
  },
];

export const DESIGN_SCREENS: { id: DesignScreenId; label: string }[] = [
  { id: "login", label: "Sign in" },
  { id: "operations", label: "Operations Center" },
  { id: "unit", label: "Unit workspace" },
  { id: "today", label: "Today's Work" },
];
