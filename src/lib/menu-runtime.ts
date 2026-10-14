/**
 * Menu Runtime resolution.
 *
 * Given Facility, Department, exact location, a Cycle identity, and a facility
 * service date — which ACTIVE Menus apply, and what content belongs in that slot?
 *
 * The resolver is plural. It does not choose a winner.
 * It consumes Runtime Operational Cycle state. It does not decide wall-clock
 * "current meal" from the server clock.
 *
 * Historical limitation: a past serviceDateKey uses date-effective Operational
 * Cycle versions, but Menu / MenuItem / applicability / cycle settings are not
 * versioned. This is current Menu configuration resolved against that date —
 * not audit-perfect evidence of what was configured then.
 */

import type { MenuItemEntryType, MenuStatus } from "@prisma/client";

import {
  menuLocationMatches,
  normalizeMenuLocationTarget,
  type MenuLocationTarget,
} from "@/lib/menu-applicability";
import {
  rotationForServiceDateKey,
  storedMenuPeriodConfigs,
  usableMenuRuntimeCycleSettings,
  type MenuPeriodConfig,
} from "@/lib/menu-cycle";
import { isRootCycle } from "@/lib/operational-cycles/cycle-canonical";
import { projectCycleHierarchy } from "@/lib/operational-cycles/cycle-hierarchy";
import { isApplicableWeekday } from "@/lib/operational-cycles/cycle-windows";
import { cycleAppliesToSpace, cycleAppliesToUnit } from "@/lib/operational-cycles/resolve-operational-cycle";
import type { CycleUnitScope, OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import { toServiceDateKey } from "@/lib/operational-time";

export type ResolveApplicableMenusInput = {
  facilityId: string;
  departmentId: string;
  /** Facility civil service date, YYYY-MM-DD. */
  serviceDateKey: string;
  location: MenuLocationTarget;
  /** Root PERIOD or a deeper node. Normalized to the root PERIOD identity. */
  cycleStableKey: string;
  /** Optional Operational Type key for cycle location-mode OPERATIONAL_TYPES. */
  operationalTypeKey?: string | null;
};

export type MenuResolutionIssueCode =
  | "CYCLE_NOT_OCCURRING"
  | "NO_APPLICABLE_MENU"
  | "AMBIGUOUS_MENUS"
  | "LOCATION_NOT_ACTIONABLE"
  | "MISSING_CYCLE_SETTINGS"
  | "PERIOD_MISSING"
  | "EMPTY_SLOT";

export type MenuResolutionIssue = {
  code: MenuResolutionIssueCode;
  menuId?: string;
};

export type ResolvedMenuItem = {
  id: string;
  itemName: string;
  portionValue: string | null;
  portionUnit: string | null;
  entryType: MenuItemEntryType;
  displayOrder: number;
};

export type ResolvedMenuCategory = {
  name: string;
  items: ResolvedMenuItem[];
};

export type ResolvedMenu = {
  menuId: string;
  menuName: string;
  departmentId: string;
  status: Extract<MenuStatus, "ACTIVE">;
  location: MenuLocationTarget;
  requestedCycleStableKey: string;
  cycleStableKey: string;
  serviceDateKey: string;
  weekNumber: number | null;
  dayIndex: number | null;
  menuPeriodKey: string | null;
  menuPeriodLabel: string | null;
  categories: ResolvedMenuCategory[];
};

export type MenuResolutionResult = {
  matches: ResolvedMenu[];
  ambiguous: boolean;
  issues: MenuResolutionIssue[];
};

export class MenuRuntimeRequestError extends Error {
  readonly code:
    | "INVALID_FACILITY"
    | "INVALID_DEPARTMENT"
    | "INVALID_SERVICE_DATE"
    | "INVALID_LOCATION"
    | "INVALID_CYCLE"
    | "CROSS_FACILITY_TARGET";

  constructor(
    code: MenuRuntimeRequestError["code"],
    message: string,
  ) {
    super(message);
    this.name = "MenuRuntimeRequestError";
    this.code = code;
  }
}

export type MenuRuntimeCandidateFact = {
  menuId: string;
  menuName: string;
  departmentId: string;
  facilityId: string;
  status: MenuStatus;
  location: MenuLocationTarget;
  cycleStableKey: string;
  menuPeriodKey: string;
  cycleSettings: {
    cycleLengthWeeks: number | null;
    weekStartsOn: "SUNDAY" | "MONDAY" | null;
    cycleAnchorDate: Date | null;
    periodConfigJson: unknown;
  } | null;
};

export type MenuRuntimeItemFact = {
  id: string;
  menuId: string;
  weekNumber: number;
  dayIndex: number;
  mealPeriodKey: string;
  category: string;
  itemName: string;
  portionValue: string | null;
  portionUnit: string | null;
  entryType: MenuItemEntryType;
  displayOrder: number;
};

export type ResolveApplicableMenusFromFactsInput = ResolveApplicableMenusInput & {
  locationActionable: boolean;
  publishedCycles: readonly OperationalCycleDefinition[];
  candidates: readonly MenuRuntimeCandidateFact[];
  items: readonly MenuRuntimeItemFact[];
  unitCycleScope?: CycleUnitScope | null;
};

const SERVICE_DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertResolveApplicableMenusInput(
  input: ResolveApplicableMenusInput,
): {
  facilityId: string;
  departmentId: string;
  serviceDateKey: string;
  location: MenuLocationTarget;
  cycleStableKey: string;
} {
  const facilityId = input.facilityId.trim();
  if (!facilityId) {
    throw new MenuRuntimeRequestError("INVALID_FACILITY", "Menu Runtime requires a Facility.");
  }
  const departmentId = input.departmentId.trim();
  if (!departmentId) {
    throw new MenuRuntimeRequestError("INVALID_DEPARTMENT", "Menu Runtime requires a Department.");
  }
  const serviceDateKey = input.serviceDateKey.trim();
  if (!SERVICE_DATE_KEY.test(serviceDateKey) || !isRealCivilDate(serviceDateKey)) {
    throw new MenuRuntimeRequestError(
      "INVALID_SERVICE_DATE",
      "Menu Runtime requires a facility service date as YYYY-MM-DD.",
    );
  }
  let location: MenuLocationTarget;
  try {
    location = normalizeMenuLocationTarget(input.location);
  } catch {
    throw new MenuRuntimeRequestError(
      "INVALID_LOCATION",
      "Menu Runtime location must be exactly one Unit or one Room.",
    );
  }
  const cycleStableKey = input.cycleStableKey.trim();
  if (!cycleStableKey) {
    throw new MenuRuntimeRequestError(
      "INVALID_CYCLE",
      "Menu Runtime requires an Operational Cycle identity.",
    );
  }
  return { facilityId, departmentId, serviceDateKey, location, cycleStableKey };
}

function isRealCivilDate(serviceDateKey: string): boolean {
  const match = SERVICE_DATE_KEY.exec(serviceDateKey);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

function cycleIsDateEffective(cycle: OperationalCycleDefinition, serviceDateKey: string): boolean {
  const fromKey = toServiceDateKey(cycle.effectiveFrom);
  const toKey = cycle.effectiveTo ? toServiceDateKey(cycle.effectiveTo) : null;
  if (fromKey > serviceDateKey) return false;
  if (toKey && toKey < serviceDateKey) return false;
  if (cycle.status === "PUBLISHED") return true;
  return cycle.status === "RETIRED" && cycle.effectiveTo !== null;
}

/**
 * Walk a supplied Cycle identity to the canonical root PERIOD.
 * Key Points and unknown identities do not become Menu Cycles.
 */
export function normalizeRequestedCycleToRootPeriod(
  requestedCycleStableKey: string,
  published: readonly OperationalCycleDefinition[],
): { requested: OperationalCycleDefinition; root: OperationalCycleDefinition } | null {
  const key = requestedCycleStableKey.trim();
  const byKey = new Map(published.map((cycle) => [cycle.stableKey, cycle]));
  const requested = byKey.get(key);
  if (!requested || requested.nodeKind === "KEY_TIME") return null;

  const hierarchy = projectCycleHierarchy(published);
  const node = hierarchy.byStableKey.get(key);
  if (!node) return null;
  const rootKey = node.ancestorStableKeys[0] ?? node.stableKey;
  const root = byKey.get(rootKey);
  if (!root || root.nodeKind === "KEY_TIME" || !isRootCycle(root)) return null;
  return { requested, root };
}

export function cycleOccursAtMenuLocation(input: {
  root: OperationalCycleDefinition;
  published: readonly OperationalCycleDefinition[];
  location: MenuLocationTarget;
  serviceDateKey: string;
  operationalTypeKey?: string | null;
  unitCycleScope?: CycleUnitScope | null;
}): boolean {
  if (!cycleIsDateEffective(input.root, input.serviceDateKey)) return false;
  if (!isApplicableWeekday(input.root.applicableDaysOfWeek, input.serviceDateKey)) return false;
  const byKey = new Map(input.published.map((cycle) => [cycle.stableKey, cycle]));
  if (input.location.spaceId) {
    return cycleAppliesToSpace(input.root, input.location.spaceId, byKey, {
      operationalTypeKey: input.operationalTypeKey,
    });
  }
  if (!input.location.unitId || !input.unitCycleScope) return false;
  return cycleAppliesToUnit(input.root, input.unitCycleScope, byKey);
}

function emptyResult(issues: MenuResolutionIssue[]): MenuResolutionResult {
  return { matches: [], ambiguous: false, issues };
}

function groupCategories(
  period: MenuPeriodConfig | null,
  items: readonly MenuRuntimeItemFact[],
): ResolvedMenuCategory[] {
  const categories: ResolvedMenuCategory[] = [];
  const index = new Map<string, number>();
  if (period) {
    for (const name of period.categories) {
      index.set(name.toLowerCase(), categories.length);
      categories.push({ name, items: [] });
    }
  }
  const sorted = [...items].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.itemName.localeCompare(b.itemName),
  );
  for (const item of sorted) {
    const key = item.category.toLowerCase();
    let slot = index.get(key);
    if (slot === undefined) {
      slot = categories.length;
      index.set(key, slot);
      categories.push({ name: item.category, items: [] });
    }
    categories[slot]!.items.push({
      id: item.id,
      itemName: item.itemName,
      portionValue: item.portionValue,
      portionUnit: item.portionUnit,
      entryType: item.entryType,
      displayOrder: item.displayOrder,
    });
  }
  return categories.filter((category) => category.items.length > 0);
}

function compareResolvedMenus(a: ResolvedMenu, b: ResolvedMenu): number {
  return a.menuName.localeCompare(b.menuName) || a.menuId.localeCompare(b.menuId);
}

/**
 * Pure Menu Runtime orchestration. Callers supply published cycles and
 * candidate Menus. The async wrapper loads those facts.
 */
export function resolveApplicableMenusFromFacts(
  input: ResolveApplicableMenusFromFactsInput,
): MenuResolutionResult {
  const request = assertResolveApplicableMenusInput(input);

  if (!input.locationActionable) {
    return emptyResult([{ code: "LOCATION_NOT_ACTIONABLE" }]);
  }

  const normalized = normalizeRequestedCycleToRootPeriod(request.cycleStableKey, input.publishedCycles);
  if (
    !normalized ||
    !cycleOccursAtMenuLocation({
      root: normalized.root,
      published: input.publishedCycles,
      location: request.location,
      serviceDateKey: request.serviceDateKey,
      operationalTypeKey: input.operationalTypeKey,
      unitCycleScope: input.unitCycleScope,
    })
  ) {
    return emptyResult([{ code: "CYCLE_NOT_OCCURRING" }]);
  }

  const rootKey = normalized.root.stableKey;
  const candidates = input.candidates.filter((candidate) => {
    if (candidate.status !== "ACTIVE") return false;
    if (candidate.facilityId !== request.facilityId) return false;
    if (candidate.departmentId !== request.departmentId) return false;
    if (candidate.cycleStableKey !== rootKey) return false;
    return menuLocationMatches(candidate.location, request.location);
  });

  if (candidates.length === 0) {
    return emptyResult([{ code: "NO_APPLICABLE_MENU" }]);
  }

  const issues: MenuResolutionIssue[] = [];
  const matches: ResolvedMenu[] = [];

  for (const candidate of candidates) {
    const settings = usableMenuRuntimeCycleSettings(candidate.cycleSettings);
    const periods = storedMenuPeriodConfigs(candidate.cycleSettings?.periodConfigJson);
    const period = periods.find((row) => row.key === candidate.menuPeriodKey) ?? null;
    const rotation = settings
      ? rotationForServiceDateKey(request.serviceDateKey, settings)
      : null;

    const base: ResolvedMenu = {
      menuId: candidate.menuId,
      menuName: candidate.menuName,
      departmentId: candidate.departmentId,
      status: "ACTIVE",
      location: request.location,
      requestedCycleStableKey: request.cycleStableKey,
      cycleStableKey: rootKey,
      serviceDateKey: request.serviceDateKey,
      weekNumber: rotation?.weekNumber ?? null,
      dayIndex: rotation?.dayIndex ?? null,
      menuPeriodKey: candidate.menuPeriodKey,
      menuPeriodLabel: period?.label ?? null,
      categories: [],
    };

    if (!settings || !rotation) {
      issues.push({ code: "MISSING_CYCLE_SETTINGS", menuId: candidate.menuId });
      matches.push(base);
      continue;
    }

    if (!period) {
      issues.push({ code: "PERIOD_MISSING", menuId: candidate.menuId });
      matches.push({ ...base, menuPeriodKey: candidate.menuPeriodKey, menuPeriodLabel: null });
      continue;
    }

    const slotItems = input.items.filter(
      (item) =>
        item.menuId === candidate.menuId &&
        item.weekNumber === rotation.weekNumber &&
        item.dayIndex === rotation.dayIndex &&
        item.mealPeriodKey === candidate.menuPeriodKey,
    );
    const categories = groupCategories(period, slotItems);
    if (slotItems.length === 0) {
      issues.push({ code: "EMPTY_SLOT", menuId: candidate.menuId });
    }
    matches.push({ ...base, categories });
  }

  matches.sort(compareResolvedMenus);
  const ambiguous = matches.length > 1;
  if (ambiguous) {
    issues.push({ code: "AMBIGUOUS_MENUS" });
  }

  return { matches, ambiguous, issues };
}

export type TodaysMenuBlockView = {
  title: "Today's Menu" | "Today's Menus";
  attention: string | null;
  menus: Array<{
    menuId: string;
    name: string;
    periodLabel: string | null;
    incomplete: boolean;
    incompleteLabel: string | null;
    categories: Array<{
      name: string;
      items: Array<{ id: string; label: string }>;
    }>;
  }>;
};

function formatItemLabel(item: ResolvedMenuItem): string {
  const name = item.itemName.trim();
  if (item.entryType === "CHOICE_PLACEHOLDER") return name;
  const portionValue = (item.portionValue ?? "").trim();
  const portionUnit = (item.portionUnit ?? "").trim();
  if (portionValue && portionUnit) return `${name} · ${portionValue} ${portionUnit}`;
  if (portionValue) return `${name} · ${portionValue}`;
  if (portionUnit) return `${name} · ${portionUnit}`;
  return name;
}

function incompleteLabelFor(menuId: string, issues: readonly MenuResolutionIssue[]): string | null {
  const codes = issues.filter((issue) => issue.menuId === menuId).map((issue) => issue.code);
  if (codes.includes("MISSING_CYCLE_SETTINGS") || codes.includes("PERIOD_MISSING")) {
    return "Configuration needed";
  }
  if (codes.includes("EMPTY_SLOT")) {
    return "No items for this service";
  }
  return null;
}

/**
 * Space Overview presentation. Null means stay quiet.
 * Does not dump issue codes to frontline users.
 */
export function presentTodaysMenuBlock(result: MenuResolutionResult | null | undefined): TodaysMenuBlockView | null {
  if (!result || result.matches.length === 0) return null;
  const incomplete = result.matches.some((menu) =>
    result.issues.some(
      (issue) =>
        issue.menuId === menu.menuId &&
        (issue.code === "MISSING_CYCLE_SETTINGS" ||
          issue.code === "PERIOD_MISSING" ||
          issue.code === "EMPTY_SLOT"),
    ),
  );
  const attention = result.ambiguous
    ? "Needs attention · Multiple menus apply to this service."
    : incomplete
      ? "Needs attention"
      : null;
  return {
    title: result.matches.length === 1 ? "Today's Menu" : "Today's Menus",
    attention,
    menus: result.matches.map((menu) => {
      const incompleteLabel = incompleteLabelFor(menu.menuId, result.issues);
      return {
        menuId: menu.menuId,
        name: menu.menuName,
        periodLabel: menu.menuPeriodLabel,
        incomplete: Boolean(incompleteLabel),
        incompleteLabel,
        categories: menu.categories.map((category) => ({
          name: category.name,
          items: category.items.map((item) => ({ id: item.id, label: formatItemLabel(item) })),
        })),
      };
    }),
  };
}
