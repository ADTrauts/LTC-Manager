/**
 * Product-language operational capability catalog for Department Job Roles.
 * Keys are internal; UI shows plain-language labels.
 * Not route permissions — future RUN/BUILD consumers will map these to actions.
 */

export const OPERATIONAL_CAPABILITY_KEYS = [
  "COMPLETE_ASSIGNED_WORK",
  "RECORD_OPERATIONAL_LOGS",
  "REPORT_ISSUES",
  "VIEW_TEAM_OPERATION",
  "MANAGE_TEAM_OPERATION",
  "COMPLETE_KEY_TIMES",
  "ADJUST_OPERATIONAL_TIMES",
  "CORRECT_OPERATIONAL_RECORDS",
  "VIEW_STAFFING",
  "ASSIGN_DAILY_COVERAGE",
  "MANAGE_SCHEDULE",
  "VIEW_EMPLOYEES",
  "MANAGE_EMPLOYEES",
  "CONFIGURE_DEPARTMENT",
] as const;

export type OperationalCapabilityKey = (typeof OPERATIONAL_CAPABILITY_KEYS)[number];

export type CapabilityCategory = "Work" | "Team / operation" | "Staffing" | "Workforce" | "Build";

export type CapabilityDefinition = {
  key: OperationalCapabilityKey;
  label: string;
  category: CapabilityCategory;
};

export const OPERATIONAL_CAPABILITY_CATALOG: readonly CapabilityDefinition[] = [
  { key: "COMPLETE_ASSIGNED_WORK", label: "Complete assigned work", category: "Work" },
  { key: "RECORD_OPERATIONAL_LOGS", label: "Record operational logs", category: "Work" },
  { key: "REPORT_ISSUES", label: "Report issues", category: "Work" },
  { key: "VIEW_TEAM_OPERATION", label: "View team operation", category: "Team / operation" },
  { key: "MANAGE_TEAM_OPERATION", label: "Manage team operation", category: "Team / operation" },
  { key: "COMPLETE_KEY_TIMES", label: "Complete Key Times", category: "Team / operation" },
  { key: "ADJUST_OPERATIONAL_TIMES", label: "Adjust operational times", category: "Team / operation" },
  {
    key: "CORRECT_OPERATIONAL_RECORDS",
    label: "Correct operational records",
    category: "Team / operation",
  },
  { key: "VIEW_STAFFING", label: "View staffing", category: "Staffing" },
  { key: "ASSIGN_DAILY_COVERAGE", label: "Manage today's staffing", category: "Staffing" },
  { key: "MANAGE_SCHEDULE", label: "Manage schedule", category: "Staffing" },
  { key: "VIEW_EMPLOYEES", label: "View employees", category: "Workforce" },
  { key: "MANAGE_EMPLOYEES", label: "Manage employees", category: "Workforce" },
  { key: "CONFIGURE_DEPARTMENT", label: "Configure department", category: "Build" },
] as const;

const KEY_SET = new Set<string>(OPERATIONAL_CAPABILITY_KEYS);

export function isOperationalCapabilityKey(value: string): value is OperationalCapabilityKey {
  return KEY_SET.has(value);
}

/** Validate and de-dupe capability keys. Rejects unknown keys. */
export function normalizeCapabilityKeys(raw: readonly string[]): OperationalCapabilityKey[] {
  const out: OperationalCapabilityKey[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = typeof item === "string" ? item.trim() : "";
    if (!key) continue;
    if (!isOperationalCapabilityKey(key)) {
      throw new Error(`Unknown capability: ${key}`);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function capabilitiesByCategory(): {
  category: CapabilityCategory;
  items: CapabilityDefinition[];
}[] {
  const order: CapabilityCategory[] = [
    "Work",
    "Team / operation",
    "Staffing",
    "Workforce",
    "Build",
  ];
  return order.map((category) => ({
    category,
    items: OPERATIONAL_CAPABILITY_CATALOG.filter((c) => c.category === category),
  }));
}
