/**
 * Menu domain for canonical Review.
 * Expected service contexts come from Operational Cycle occurrence, not Menu rows.
 * Current-day only. Past dates stay unavailable — Menu is not versioned.
 */

import {
  cycleOccursAtMenuLocation,
  resolveApplicableMenusFromFacts,
  type MenuResolutionResult,
  type ResolvedMenu,
} from "@/lib/menu-runtime";
import { isRootCycle } from "@/lib/operational-cycles/cycle-canonical";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";

import type {
  OperationalReviewDayFacts,
  ReviewDomainAvailability,
  ReviewLocationEntry,
  ReviewMenuFinding,
} from "./types";

function evaluated(): ReviewDomainAvailability {
  return { status: "evaluated", reason: null };
}

function unavailableMenuHistory(): ReviewDomainAvailability {
  return { status: "unavailable", reason: "unsupported_menu_history" };
}

function cyclesForDepartment(
  cycles: OperationalReviewDayFacts["cycles"],
  departmentId: string,
  fallbackDepartmentId: string | null,
): OperationalCycleDefinition[] {
  return cycles.filter((cycle) => {
    if (cycle.departmentId) return cycle.departmentId === departmentId;
    return !fallbackDepartmentId || fallbackDepartmentId === departmentId;
  });
}

export function translateMenuResolutionToReviewFindings(input: {
  result: MenuResolutionResult;
  serviceDateKey: string;
  departmentId: string;
  spaceId: string;
  unitId: string | null;
  cycleStableKey: string;
  cycleLabel: string;
}): ReviewMenuFinding[] {
  const findings: ReviewMenuFinding[] = [];
  const base = {
    serviceDateKey: input.serviceDateKey,
    departmentId: input.departmentId,
    spaceId: input.spaceId,
    unitId: input.unitId,
    cycleStableKey: input.cycleStableKey,
    cycleLabel: input.cycleLabel,
  };

  if (input.result.issues.some((issue) => issue.code === "CYCLE_NOT_OCCURRING")) {
    return [];
  }
  if (input.result.issues.some((issue) => issue.code === "LOCATION_NOT_ACTIONABLE")) {
    return [];
  }

  if (input.result.issues.some((issue) => issue.code === "NO_APPLICABLE_MENU") && input.result.matches.length === 0) {
    findings.push({
      ...base,
      code: "MENU_NOT_CONFIGURED",
      menuId: null,
      menuName: null,
      peerMenuNames: [],
      weekNumber: null,
      dayIndex: null,
    });
    return findings;
  }

  if (input.result.issues.some((issue) => issue.code === "AMBIGUOUS_MENUS") && input.result.matches.length > 1) {
    findings.push({
      ...base,
      code: "MENU_MULTIPLE_CONFIGURED",
      menuId: null,
      menuName: null,
      peerMenuNames: input.result.matches.map((menu) => menu.menuName),
      weekNumber: null,
      dayIndex: null,
    });
  }

  for (const menu of input.result.matches) {
    const incomplete = findingForIncompleteMenu(menu, input.result);
    if (incomplete) {
      findings.push({
        ...base,
        ...incomplete,
        menuId: menu.menuId,
        menuName: menu.menuName,
        peerMenuNames: [],
        weekNumber: menu.weekNumber,
        dayIndex: menu.dayIndex,
      });
    }
  }

  return findings;
}

function findingForIncompleteMenu(
  menu: ResolvedMenu,
  result: MenuResolutionResult,
): Pick<ReviewMenuFinding, "code"> | null {
  const codes = result.issues.filter((issue) => issue.menuId === menu.menuId).map((issue) => issue.code);
  if (codes.includes("MISSING_CYCLE_SETTINGS")) return { code: "MENU_ROTATION_UNCONFIGURED" };
  if (codes.includes("PERIOD_MISSING")) return { code: "MENU_PERIOD_MAPPING_BROKEN" };
  if (codes.includes("EMPTY_SLOT")) return { code: "MENU_CONTENT_MISSING" };
  return null;
}

export function composeReviewMenuDomain(input: {
  facts: OperationalReviewDayFacts;
  locations: readonly ReviewLocationEntry[];
  otByDepartment: ReadonlyMap<string, ReadonlyMap<string, { key: string; name: string }>>;
}): {
  availability: ReviewDomainAvailability;
  findings: ReviewMenuFinding[];
} {
  if (input.facts.serviceDate !== input.facts.todayKey) {
    return { availability: unavailableMenuHistory(), findings: [] };
  }

  const menuDepartmentIds = input.facts.menuDepartmentIds ?? [];
  const candidates = input.facts.menuCandidates ?? [];
  const items = input.facts.menuItems ?? [];
  const findings: ReviewMenuFinding[] = [];

  for (const departmentId of menuDepartmentIds) {
    const published = cyclesForDepartment(input.facts.cycles, departmentId, input.facts.departmentId);
    const roots = published.filter((cycle) => isRootCycle(cycle));
    const otBySpace = input.otByDepartment.get(departmentId);

    for (const location of input.locations) {
      const operationalTypeKey = otBySpace?.get(location.spaceId)?.key ?? null;
      for (const root of roots) {
        if (
          !cycleOccursAtMenuLocation({
            root,
            published,
            location: { unitId: null, spaceId: location.spaceId },
            serviceDateKey: input.facts.serviceDate,
            operationalTypeKey,
          })
        ) {
          continue;
        }
        const result = resolveApplicableMenusFromFacts({
          facilityId: input.facts.facilityId,
          departmentId,
          serviceDateKey: input.facts.serviceDate,
          location: { unitId: null, spaceId: location.spaceId },
          cycleStableKey: root.stableKey,
          operationalTypeKey,
          locationActionable: true,
          publishedCycles: published,
          candidates,
          items,
        });
        findings.push(
          ...translateMenuResolutionToReviewFindings({
            result,
            serviceDateKey: input.facts.serviceDate,
            departmentId,
            spaceId: location.spaceId,
            unitId: location.parentUnitId,
            cycleStableKey: root.stableKey,
            cycleLabel: root.label,
          }),
        );
      }
    }
  }

  return { availability: evaluated(), findings };
}
