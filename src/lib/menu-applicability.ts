/**
 * Menu applicability — explicit Department locations + canonical Operational Cycle identities.
 * Rotation (week/day) and cycle timing stay on their own authorities.
 * Runtime Menu resolution lives in menu-runtime.ts / menu-runtime-db.ts.
 */

import type { MealType, MenuStatus } from "@prisma/client";

import type { DepartmentActionableLocation } from "@/lib/department-administration";
import { menuPeriodKeyForMealType, storedMenuPeriodConfigs, type MenuPeriodConfig } from "@/lib/menu-cycle";
import { isRootCycle } from "@/lib/operational-cycles/cycle-canonical";

export type MenuLocationTarget = {
  unitId: string | null;
  spaceId: string | null;
};

export type MenuCycleAssignment = {
  cycleStableKey: string;
  menuPeriodKey: string;
};

export type EligibleMenuOperationalCycle = {
  stableKey: string;
  label: string;
  mealType: MealType | null;
  displaySequence: number;
  version: number;
};

export type MenuCycleIdentityRow = {
  stableKey: string;
  label: string;
  mealType?: MealType | null;
  displaySequence?: number;
  version?: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  nodeKind?: "PERIOD" | "KEY_TIME" | null;
  parentStableKey?: string | null;
};

export type MenuApplicabilityAttention = {
  code:
    | "ACTIVE_WITHOUT_LOCATIONS"
    | "ACTIVE_WITHOUT_CYCLES"
    | "LOCATION_NOT_ACTIONABLE"
    | "LOCATION_INACTIVE"
    | "CYCLE_NOT_ELIGIBLE"
    | "PERIOD_MISSING"
    | "OVERLAP";
  message: string;
  otherMenuName?: string;
};

export type MenuOverlapPeer = {
  id: string;
  name: string;
  status: MenuStatus;
  locations: MenuLocationTarget[];
  cycles: MenuCycleAssignment[];
};

export type MenuApplicabilityRecord = {
  locations: MenuLocationTarget[];
  cycles: MenuCycleAssignment[];
};

export function menuLocationTargetKey(target: MenuLocationTarget): string {
  if (target.unitId && !target.spaceId) return `unit:${target.unitId}`;
  if (target.spaceId && !target.unitId) return `space:${target.spaceId}`;
  throw new Error("A Menu location must be exactly one Unit or one Room.");
}

export function locationTargetFromActionable(location: DepartmentActionableLocation): MenuLocationTarget {
  if (location.kind === "neighborhood") {
    return { unitId: location.id, spaceId: null };
  }
  return { unitId: null, spaceId: location.id };
}

export function normalizeMenuLocationTarget(input: {
  unitId?: string | null;
  spaceId?: string | null;
}): MenuLocationTarget {
  const unitId = input.unitId?.trim() || null;
  const spaceId = input.spaceId?.trim() || null;
  if (Boolean(unitId) === Boolean(spaceId)) {
    throw new Error("A Menu location must be exactly one Unit or one Room.");
  }
  return { unitId, spaceId };
}

export function menuLocationMatches(
  assignment: MenuLocationTarget,
  query: MenuLocationTarget,
): boolean {
  return menuLocationTargetKey(assignment) === menuLocationTargetKey(query);
}

export function resolveMenuPeriodKeys(periodConfigJson: unknown): string[] {
  return storedMenuPeriodConfigs(periodConfigJson).map((period) => period.key);
}

export function cycleAssignmentsFromPeriods(
  periods: readonly MenuPeriodConfig[],
): MenuCycleAssignment[] {
  return uniqueMenuCycleAssignments(
    periods
      .filter((period) => Boolean(period.cycleStableKey?.trim()))
      .map((period) => ({
        cycleStableKey: period.cycleStableKey!.trim(),
        menuPeriodKey: period.key,
      })),
  );
}

export function bindPeriodsToCycles(
  periods: readonly MenuPeriodConfig[],
  cycles: readonly MenuCycleAssignment[],
): MenuPeriodConfig[] {
  return periods.map((period) => ({
    ...period,
    cycleStableKey:
      period.cycleStableKey?.trim() ||
      cycles.find((row) => row.menuPeriodKey === period.key)?.cycleStableKey ||
      null,
  }));
}

export function suggestMenuPeriodKey(input: {
  mealType?: MealType | null;
  label: string;
  periods: readonly MenuPeriodConfig[];
}): string | null {
  const periods = [...input.periods];
  if (input.mealType) {
    const fromMeal = menuPeriodKeyForMealType(input.mealType, periods);
    if (fromMeal) return fromMeal;
  }
  const label = input.label.trim().toUpperCase();
  if (!label) return null;
  const byKey = periods.find((period) => period.key.toUpperCase() === label);
  if (byKey) return byKey.key;
  const byLabel = periods.find((period) => period.label.trim().toUpperCase() === label);
  return byLabel?.key ?? null;
}

export function isEligibleMenuCycleIdentity(row: MenuCycleIdentityRow): boolean {
  if (row.status !== "PUBLISHED") return false;
  return isRootCycle({
    stableKey: row.stableKey,
    parentStableKey: row.parentStableKey,
    nodeKind: row.nodeKind ?? "PERIOD",
  });
}

export function selectEligibleMenuCycleIdentities(
  rows: readonly MenuCycleIdentityRow[],
): EligibleMenuOperationalCycle[] {
  const byKey = new Map<string, EligibleMenuOperationalCycle>();
  for (const row of rows) {
    if (!isEligibleMenuCycleIdentity(row)) continue;
    const stableKey = row.stableKey.trim();
    if (!stableKey) continue;
    const next: EligibleMenuOperationalCycle = {
      stableKey,
      label: row.label,
      mealType: row.mealType ?? null,
      displaySequence: row.displaySequence ?? 100,
      version: row.version ?? 1,
    };
    const current = byKey.get(stableKey);
    if (!current || next.version > current.version) {
      byKey.set(stableKey, next);
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.displaySequence - b.displaySequence || a.label.localeCompare(b.label) || a.stableKey.localeCompare(b.stableKey),
  );
}

export function uniqueMenuLocationTargets(targets: readonly MenuLocationTarget[]): MenuLocationTarget[] {
  const seen = new Set<string>();
  const out: MenuLocationTarget[] = [];
  for (const target of targets) {
    const normalized = normalizeMenuLocationTarget(target);
    const key = menuLocationTargetKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function uniqueMenuCycleAssignments(assignments: readonly MenuCycleAssignment[]): MenuCycleAssignment[] {
  const seen = new Set<string>();
  const out: MenuCycleAssignment[] = [];
  for (const row of assignments) {
    const cycleStableKey = row.cycleStableKey.trim();
    const menuPeriodKey = row.menuPeriodKey.trim().toUpperCase();
    if (!cycleStableKey || !menuPeriodKey) {
      throw new Error("Each Operational Cycle assignment needs a cycle and a Menu period.");
    }
    if (seen.has(cycleStableKey)) continue;
    seen.add(cycleStableKey);
    out.push({ cycleStableKey, menuPeriodKey });
  }
  return out;
}

export function expandAllDepartmentLocations(
  locations: readonly DepartmentActionableLocation[],
): MenuLocationTarget[] {
  return uniqueMenuLocationTargets(locations.map(locationTargetFromActionable));
}

export function expandRoomsByOperationalType(
  locations: readonly DepartmentActionableLocation[],
  patternKey: string,
): MenuLocationTarget[] {
  return uniqueMenuLocationTargets(
    locations
      .filter((location) => location.kind === "room" && location.patternKey === patternKey)
      .map(locationTargetFromActionable),
  );
}

export function expandRoomsByFacilityRoomType(
  locations: readonly DepartmentActionableLocation[],
  roomTypeKey: string,
): MenuLocationTarget[] {
  return uniqueMenuLocationTargets(
    locations
      .filter((location) => location.kind === "room" && location.roomTypeKey === roomTypeKey)
      .map(locationTargetFromActionable),
  );
}

export function expandRoomsUnderNeighborhood(
  locations: readonly DepartmentActionableLocation[],
  neighborhoodId: string,
): MenuLocationTarget[] {
  return uniqueMenuLocationTargets(
    locations
      .filter((location) => location.kind === "room" && location.parentNeighborhoodId === neighborhoodId)
      .map(locationTargetFromActionable),
  );
}

function visibleRoomTypeLabel(location: DepartmentActionableLocation): string | null {
  const label = location.roomTypeLabel?.trim() || location.patternLabel?.trim() || "";
  return label || null;
}

function roomsShareDisplayedType(
  chosen: DepartmentActionableLocation,
  candidate: DepartmentActionableLocation,
): boolean {
  if (chosen.kind !== "room" || candidate.kind !== "room") return false;
  if (chosen.roomTypeKey && chosen.roomTypeKey === candidate.roomTypeKey) return true;
  if (chosen.patternKey && chosen.patternKey === candidate.patternKey) return true;
  const chosenLabel = visibleRoomTypeLabel(chosen);
  const candidateLabel = visibleRoomTypeLabel(candidate);
  return Boolean(chosenLabel && candidateLabel && chosenLabel.toLowerCase() === candidateLabel.toLowerCase());
}

/**
 * After the first room of a displayed type is selected, offer the remaining
 * rooms that share that facility room type, operational pattern, or label.
 * Does not invent a type when the room has none.
 */
export function offerSelectRemainingRoomsOfType(input: {
  locations: readonly DepartmentActionableLocation[];
  chosen: DepartmentActionableLocation;
  selectedKeys: ReadonlySet<string>;
}): { label: string; remaining: MenuLocationTarget[] } | null {
  const label = visibleRoomTypeLabel(input.chosen);
  if (!label || input.chosen.kind !== "room") return null;

  const peers = input.locations.filter(
    (location) =>
      location.id !== input.chosen.id && roomsShareDisplayedType(input.chosen, location),
  );
  if (peers.some((peer) => selectedKeysHas(input.selectedKeys, peer))) return null;
  const remaining = uniqueMenuLocationTargets(peers.map(locationTargetFromActionable));
  if (remaining.length === 0) return null;
  return { label, remaining };
}

function selectedKeysHas(
  selectedKeys: ReadonlySet<string>,
  location: DepartmentActionableLocation,
): boolean {
  return selectedKeys.has(menuLocationTargetKey(locationTargetFromActionable(location)));
}

function actionableByKey(locations: readonly DepartmentActionableLocation[]): Map<string, DepartmentActionableLocation> {
  return new Map(
    locations.map((location) => [menuLocationTargetKey(locationTargetFromActionable(location)), location]),
  );
}

export function validateMenuLocationAssignments(input: {
  next: readonly MenuLocationTarget[];
  existing?: readonly MenuLocationTarget[];
  actionable: readonly DepartmentActionableLocation[];
}): MenuLocationTarget[] {
  const next = uniqueMenuLocationTargets(input.next);
  const existing = new Set((input.existing ?? []).map((row) => menuLocationTargetKey(normalizeMenuLocationTarget(row))));
  const allowed = actionableByKey(input.actionable);

  for (const target of next) {
    const key = menuLocationTargetKey(target);
    const location = allowed.get(key);
    if (location) {
      if (!location.isActive && !existing.has(key)) {
        throw new Error("That location is not available for Menu assignment.");
      }
      continue;
    }
    if (existing.has(key)) continue;
    throw new Error("That location is not an actionable location for this Department.");
  }
  return next;
}

export function validateMenuCycleAssignments(input: {
  next: readonly MenuCycleAssignment[];
  existing?: readonly MenuCycleAssignment[];
  eligible: readonly EligibleMenuOperationalCycle[];
  periodKeys: readonly string[];
}): MenuCycleAssignment[] {
  const next = uniqueMenuCycleAssignments(input.next);
  const eligibleKeys = new Set(input.eligible.map((row) => row.stableKey));
  const periodKeys = new Set(input.periodKeys);
  const existingByKey = new Map((input.existing ?? []).map((row) => [row.cycleStableKey, row.menuPeriodKey]));

  for (const row of next) {
    const already = existingByKey.get(row.cycleStableKey);
    if (!eligibleKeys.has(row.cycleStableKey) && already == null) {
      throw new Error("That Operational Cycle is not available for this Department Menu.");
    }
    if (!periodKeys.has(row.menuPeriodKey)) {
      if (already === row.menuPeriodKey) continue;
      throw new Error("That Menu period is not configured on this Menu.");
    }
  }
  return next;
}

export function overlappingActiveMenus(input: {
  menuId: string;
  locations: readonly MenuLocationTarget[];
  cycles: readonly MenuCycleAssignment[];
  peers: readonly MenuOverlapPeer[];
}): Array<{ menuId: string; name: string }> {
  const locationKeys = new Set(input.locations.map((row) => menuLocationTargetKey(normalizeMenuLocationTarget(row))));
  const cycleKeys = new Set(input.cycles.map((row) => row.cycleStableKey));
  if (locationKeys.size === 0 || cycleKeys.size === 0) return [];

  const overlaps: Array<{ menuId: string; name: string }> = [];
  for (const peer of input.peers) {
    if (peer.id === input.menuId || peer.status !== "ACTIVE") continue;
    const peerLocations = peer.locations.some((row) =>
      locationKeys.has(menuLocationTargetKey(normalizeMenuLocationTarget(row))),
    );
    const peerCycles = peer.cycles.some((row) => cycleKeys.has(row.cycleStableKey));
    if (peerLocations && peerCycles) {
      overlaps.push({ menuId: peer.id, name: peer.name });
    }
  }
  return overlaps;
}

export function evaluateMenuApplicabilityAttention(input: {
  status: MenuStatus;
  locations: readonly MenuLocationTarget[];
  cycles: readonly MenuCycleAssignment[];
  actionable: readonly DepartmentActionableLocation[];
  eligible: readonly EligibleMenuOperationalCycle[];
  periodKeys: readonly string[];
  peers?: readonly MenuOverlapPeer[];
  menuId?: string;
}): MenuApplicabilityAttention[] {
  const attention: MenuApplicabilityAttention[] = [];
  if (input.status === "ACTIVE" && input.locations.length === 0) {
    attention.push({
      code: "ACTIVE_WITHOUT_LOCATIONS",
      message: "This active Menu has no locations yet.",
    });
  }
  if (input.status === "ACTIVE" && input.cycles.length === 0) {
    attention.push({
      code: "ACTIVE_WITHOUT_CYCLES",
      message: "This active Menu has no Operational Cycles yet.",
    });
  }

  const allowed = actionableByKey(input.actionable);
  for (const target of input.locations) {
    const key = menuLocationTargetKey(normalizeMenuLocationTarget(target));
    const location = allowed.get(key);
    if (!location) {
      attention.push({
        code: "LOCATION_NOT_ACTIONABLE",
        message: "A saved location is no longer an actionable location for this Department.",
      });
      continue;
    }
    if (!location.isActive) {
      attention.push({
        code: "LOCATION_INACTIVE",
        message: `${location.displayName} is no longer available.`,
      });
    }
  }

  const eligibleKeys = new Set(input.eligible.map((row) => row.stableKey));
  const periodKeys = new Set(input.periodKeys);
  for (const row of input.cycles) {
    if (!eligibleKeys.has(row.cycleStableKey)) {
      attention.push({
        code: "CYCLE_NOT_ELIGIBLE",
        message: `Operational Cycle “${row.cycleStableKey}” is no longer an eligible root cycle for this Department.`,
      });
    }
    if (!periodKeys.has(row.menuPeriodKey)) {
      attention.push({
        code: "PERIOD_MISSING",
        message: `Mapped Menu period “${row.menuPeriodKey}” is no longer configured on this Menu.`,
      });
    }
  }

  if (input.menuId && input.peers) {
    for (const peer of overlappingActiveMenus({
      menuId: input.menuId,
      locations: input.locations,
      cycles: input.cycles,
      peers: input.peers,
    })) {
      attention.push({
        code: "OVERLAP",
        message: `Also assigned here: ${peer.name}`,
        otherMenuName: peer.name,
      });
    }
  }

  return attention;
}

export function menuApplicabilitySummary(input: {
  locations: readonly MenuLocationTarget[];
  cycles: readonly MenuCycleAssignment[];
  eligible: readonly EligibleMenuOperationalCycle[];
}): { locationCount: number; cycleLabels: string[] } {
  const labels = input.cycles.map((row) => {
    const cycle = input.eligible.find((item) => item.stableKey === row.cycleStableKey);
    return cycle?.label ?? row.cycleStableKey;
  });
  return { locationCount: input.locations.length, cycleLabels: labels };
}
