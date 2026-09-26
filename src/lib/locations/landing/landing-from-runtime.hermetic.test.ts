/**
 * Phase 6D — Locations landing presentation from Runtime Location State.
 * Pure adapters. No Prisma. No ScheduleEntry. No Unit Workspace.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { adaptProjectionToLocationsView } from "@/lib/locations/adapt-projection";
import type { LocationsTreeNode, LocationsViewModel } from "@/lib/locations/types";
import { DIETARY_GOLDEN_PROJECTION } from "@/lib/projection";
import {
  emptyLocationProgram,
  type LocationProgram,
} from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";

import { collectActionableLandingSpaces } from "./collect-spaces";
import {
  buildLocationsLandingPresentation,
  departmentLocationsConfigureHref,
  presentLandingFloor,
  presentLandingNeighborhood,
  presentLandingSpace,
} from "./from-runtime-state";
import {
  LANDING_COVERAGE_UNAVAILABLE_LABEL,
  LANDING_NO_ACTIVE_OPERATION_LABEL,
  LANDING_UNTYPED_LABEL,
} from "./types";

const NEXT_AT = new Date("2026-08-17T08:30:00.000Z");

function location(spaceId: string) {
  return {
    kind: "SPACE" as const,
    spaceId,
    unitId: "unit-1a",
    departmentId: "dept-1",
    facilityId: "fac-1",
  };
}

function fixtureProgram(spaceId: string, name: string, attached: boolean): LocationProgram {
  const base = emptyLocationProgram({
    departmentId: "dept-1",
    departmentName: "Dietary",
    spaceId,
    name,
  });
  if (!attached) return base;
  return {
    ...base,
    teams: [
      {
        id: "t1",
        name: "Servery AM",
        provenance: { source: "TEAM_ROOM_MEMBERSHIP", detail: "Works this room" },
      },
    ],
  };
}

function state(partial: {
  spaceId: string;
  name?: string;
  ot?: "assigned" | "unassigned";
  otKey?: string;
  otName?: string;
  cycle?: string | null;
  cycleLabel?: string;
  coverageAvailability?: RuntimeLocationState["coverage"]["availability"];
  slots?: RuntimeLocationState["coverage"]["slots"];
  exceptions?: RuntimeLocationState["exceptions"];
  overdueKeys?: string[];
  nextLabel?: string | null;
}): RuntimeLocationState {
  const loc = location(partial.spaceId);
  const assigned = (partial.ot ?? "assigned") === "assigned";
  return withRuntimeLocationAnswers({
    identity: {
      location: loc,
      displayName: partial.name ?? partial.spaceId,
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "Floor 3",
        neighborhoodName: "Central Terminal",
        unitName: "Central Terminal",
        spaceName: partial.name ?? partial.spaceId,
      },
      physical: { roomTypeKey: "servery", roomTypeLabel: "Servery" },
    },
    program: {
      locationProgram: fixtureProgram(
        loc.spaceId,
        partial.name ?? partial.spaceId,
        assigned,
      ),
      operationalType: {
        state: assigned ? "assigned" : "unassigned",
        key: assigned ? (partial.otKey ?? "SERVERY") : null,
        name: assigned ? (partial.otName ?? "Servery") : null,
        id: assigned ? "ot" : null,
        profileId: assigned ? "p1" : null,
        profileVersion: assigned ? 1 : null,
        profileStatus: assigned ? "ACTIVE" : null,
      },
      cycleSetRef: null,
      coverageExpectationRefs: [],
      logAttachmentRefs: [],
    },
    operation: {
      state: partial.cycle ? "ACTIVE" : "NONE",
      current: partial.cycle
        ? {
            cycleStableKey: partial.cycle,
            cycleVersion: 1,
            label: partial.cycleLabel ?? partial.cycle,
            hierarchyLabel: partial.cycleLabel ?? partial.cycle,
            window: { start: "06:00", end: "10:00" },
            timing: {
              configured: "06:00",
              adjusted: null,
              expectedToday: "06:00",
              actual: null,
              recordedAt: null,
            },
          }
        : null,
      upcoming: partial.cycle
        ? null
        : {
            cycleStableKey: "lunch",
            label: "Lunch",
            startsAt: "2026-08-17T11:00:00.000Z",
            minutesUntil: 150,
          },
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: {
      availability: partial.coverageAvailability ?? "evaluated",
      planLifecycle: "RUNTIME_VISIBLE",
      slots: partial.slots ?? [],
    },
    evidence: {
      requiredToday: partial.overdueKeys?.length ?? 0,
      dueNow: [],
      upcoming: [],
      completed: [],
      overdue: partial.overdueKeys ?? [],
      needsReview: [],
      correctiveOpen: [],
      items: [],
    },
    assets: { assets: [], openIssues: [], issuesAffectingOperation: [] },
    milestones: { items: [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: partial.exceptions ?? [],
    next:
      partial.nextLabel === null
        ? null
        : {
            kind: "evidence_window",
            at: NEXT_AT,
            label: partial.nextLabel ?? "Food Temperature",
            sourceId: "food-temp",
          },
    asOf: {
      now: new Date("2026-08-17T07:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  });
}

function coveredSlot(): RuntimeLocationState["coverage"]["slots"][number] {
  return {
    expectationId: "e1",
    templateStableKey: "cov",
    templateVersion: 1,
    roleKey: "SERVER",
    roleLabel: "SERVER",
    requiredCount: 1,
    filledCount: 1,
    state: "COVERED",
    cycleStableKey: "breakfast",
    assignmentIds: ["oa-1"],
    assignmentRefs: [
      { assignmentId: "oa-1", employeeId: null, employeeDisplayName: null },
    ],
  };
}

function uncoveredSlot(): RuntimeLocationState["coverage"]["slots"][number] {
  return {
    ...coveredSlot(),
    filledCount: 0,
    state: "UNCOVERED",
    assignmentIds: [],
    assignmentRefs: [],
  };
}

function treeNode(
  partial: Partial<LocationsTreeNode> &
    Pick<LocationsTreeNode, "id" | "label" | "kind" | "physicalId">,
): LocationsTreeNode {
  return {
    secondaryLabel: null,
    presentation: partial.presentation ?? (partial.kind === "ROOM" ? "ACTIONABLE" : "STRUCTURAL"),
    hierarchyLevel:
      partial.kind === "FLOOR"
        ? "LEVEL_1"
        : partial.kind === "NEIGHBORHOOD"
          ? "LEVEL_2"
          : partial.kind === "ROOM"
            ? "LEVEL_3"
            : "FACILITY",
    parentId: partial.parentId ?? null,
    unitId: partial.unitId ?? (partial.kind === "ROOM" ? "unit-1" : partial.physicalId),
    href:
      partial.href !== undefined
        ? partial.href
        : partial.kind === "ROOM"
          ? `/unit/unit-1?space=${partial.physicalId}`
          : partial.kind === "NEIGHBORHOOD"
            ? `/unit/${partial.physicalId}`
            : null,
    experienceKeys: partial.experienceKeys ?? [],
    areas: partial.areas ?? [],
    children: partial.children ?? [],
    ...partial,
  };
}

function landingView(roots: LocationsTreeNode[]): LocationsViewModel {
  return {
    facilityId: "fac-1",
    purpose: "LOCATIONS",
    lensMode: "DEPARTMENT",
    lensKey: "department:DIETARY",
    departmentKey: "DIETARY",
    revision: {
      hierarchyRevision: "1",
      assignmentRevision: "1",
      profileRevision: "1",
      bindingRevision: "1",
      policyRevision: "1",
      experienceRegistryVersion: 0,
      accessClassRevision: "1",
    },
    departmentSnapshots: [
      {
        departmentId: "dept-1",
        departmentKey: "DIETARY",
        label: "Dietary",
        roots,
        actionableLocationIds: [],
        unitIds: ["unit-1"],
        plantPolicy: null,
      },
    ],
    projectedUnitIds: ["unit-1"],
    diagnostics: [],
  };
}

test("healthy Servery is quiet: operation + next, no green coverage/logs", () => {
  const row = presentLandingSpace(
    state({
      spaceId: "servery-a",
      name: "3A Servery",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      slots: [coveredSlot()],
    }),
  );
  assert.equal(row.operationLabel, "Breakfast · Active");
  assert.equal(row.configurationLabel, null);
  assert.deepEqual(row.exceptionLabels, []);
  assert.equal(row.moreExceptionCount, 0);
  assert.equal(row.nextLabel, "Next: Food Temperature · 8:30 AM");
  assert.equal(row.coverageLabel, null);
  assert.equal(row.needsAttention, false);
  assert.doesNotMatch(JSON.stringify(row), /Covered|Logs Current|Ready|Unhealthy/);
});

test("exception Servery shows first 1–2 labels and +N more", () => {
  const loc = location("servery-a");
  const row = presentLandingSpace(
    state({
      spaceId: "servery-a",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      exceptions: [
        {
          source: "coverage",
          state: "UNCOVERED",
          location: loc,
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "SERVER uncovered",
          href: null,
        },
        {
          source: "evidence",
          state: "OVERDUE",
          location: loc,
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "Food Temperature overdue",
          href: "/staffing/log-book",
        },
        {
          source: "asset_issue",
          state: "EQUIPMENT_UNAVAILABLE",
          location: loc,
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "Refrigerator unavailable",
          href: "/asset-issues/1",
        },
      ],
    }),
  );
  assert.equal(row.operationLabel, "Breakfast · Active");
  assert.deepEqual(row.exceptionLabels, ["SERVER uncovered", "Food Temperature overdue"]);
  assert.equal(row.moreExceptionCount, 1);
  assert.equal(row.needsAttention, true);
  assert.equal(row.exceptionLabels.includes("Refrigerator unavailable"), false);
});

test("one exception has no +N remainder", () => {
  const loc = location("servery-a");
  const row = presentLandingSpace(
    state({
      spaceId: "servery-a",
      cycle: "breakfast",
      exceptions: [
        {
          source: "evidence",
          state: "OVERDUE",
          location: loc,
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "Food Temperature overdue",
          href: null,
        },
      ],
    }),
  );
  assert.deepEqual(row.exceptionLabels, ["Food Temperature overdue"]);
  assert.equal(row.moreExceptionCount, 0);
});

test("Retail copy has no Servery-specific language", () => {
  const row = presentLandingSpace(
    state({
      spaceId: "retail-1",
      name: "Cafe",
      otKey: "RETAIL",
      otName: "Retail",
      cycle: "lunch_service",
      cycleLabel: "Lunch service",
      nextLabel: "Holding temperature",
    }),
  );
  const blob = JSON.stringify(row);
  assert.equal(row.operationLabel, "Lunch service · Active");
  assert.doesNotMatch(blob, /Servery|Meal Service|tray|Tray/i);
});

test("Main Kitchen row stays sparse: exceptions only, not every coverage slot", () => {
  const loc = location("kitchen");
  const row = presentLandingSpace(
    state({
      spaceId: "kitchen",
      name: "Main Kitchen",
      otKey: "MAIN_KITCHEN",
      otName: "Main Kitchen",
      cycle: "production",
      cycleLabel: "Production",
      slots: [
        { ...coveredSlot(), roleKey: "COOK", roleLabel: "COOK", requiredCount: 2, filledCount: 2 },
        { ...uncoveredSlot(), roleKey: "PORTER", roleLabel: "PORTER" },
      ],
      exceptions: [
        {
          source: "coverage",
          state: "UNCOVERED",
          location: loc,
          operationalContext: { cycleStableKey: "production", operationalTypeKey: "MAIN_KITCHEN" },
          label: "PORTER uncovered",
          href: null,
        },
      ],
    }),
  );
  assert.equal(row.operationLabel, "Production · Active");
  assert.deepEqual(row.exceptionLabels, ["PORTER uncovered"]);
  assert.equal(row.coverageLabel, null);
  assert.doesNotMatch(JSON.stringify(row), /COOK ×2|2 assigned/);
});

test("no active operation is calm and may show next", () => {
  const row = presentLandingSpace(
    state({
      spaceId: "dining",
      name: "Dining Room",
      cycle: null,
      nextLabel: "Lunch",
    }),
  );
  assert.equal(row.operationLabel, LANDING_NO_ACTIVE_OPERATION_LABEL);
  assert.equal(row.nextLabel, "Next: Lunch · 8:30 AM");
  assert.equal(row.needsAttention, false);
  assert.doesNotMatch(JSON.stringify(row), /Closed|Failed|Offline|Inactive|Unconfigured/);
});

test("OA disabled shows Coverage unavailable and never schedule-derived staffing", () => {
  const row = presentLandingSpace(
    state({
      spaceId: "servery-a",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      coverageAvailability: "feature_disabled",
      slots: [],
    }),
  );
  assert.equal(row.operationLabel, "Breakfast · Active");
  assert.equal(row.coverageLabel, LANDING_COVERAGE_UNAVAILABLE_LABEL);
  assert.equal(row.nextLabel, "Next: Food Temperature · 8:30 AM");
  assert.doesNotMatch(JSON.stringify(row), /Uncovered|No staff|Staffing missing|ScheduleEntry/);
});

test("no published coverage expectation stays silent, not failing", () => {
  const row = presentLandingSpace(
    state({
      spaceId: "servery-a",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      coverageAvailability: "no_published_expectations",
    }),
  );
  assert.equal(row.coverageLabel, null);
  assert.equal(row.needsAttention, false);
});

test("untyped space is configuration state with Department Locations path", () => {
  const row = presentLandingSpace(
    state({
      spaceId: "utility",
      name: "Utility",
      ot: "unassigned",
      cycle: null,
      nextLabel: null,
    }),
    { canConfigureLocations: true },
  );
  assert.equal(row.configurationLabel, LANDING_UNTYPED_LABEL);
  assert.equal(row.operationLabel, LANDING_NO_ACTIVE_OPERATION_LABEL);
  assert.equal(row.needsAttention, false);
  assert.equal(row.configureHref, departmentLocationsConfigureHref("dept-1"));
  assert.equal(row.configureHref, "/admin/departments/dept-1?tab=locations");
});

test("Location Program without Operational Type is not a configuration gap", () => {
  const programmed = state({
    spaceId: "kitchen",
    name: "Main Kitchen",
    ot: "unassigned",
    cycle: "breakfast",
    cycleLabel: "Breakfast",
  });
  programmed.program.locationProgram = fixtureProgram("kitchen", "Main Kitchen", true);
  const row = presentLandingSpace(programmed, { canConfigureLocations: true });
  assert.equal(row.configurationLabel, null);
  assert.equal(row.configureHref, null);
  assert.equal(row.operationLabel, "Breakfast · Active");
});

test("untyped space hides configure link for non-managers", () => {
  const row = presentLandingSpace(
    state({ spaceId: "utility", ot: "unassigned", cycle: null, nextLabel: null }),
    { canConfigureLocations: false },
  );
  assert.equal(row.configureHref, null);
  assert.equal(row.configurationLabel, LANDING_UNTYPED_LABEL);
});

test("omit next when RLS has none", () => {
  const row = presentLandingSpace(
    state({ spaceId: "servery-a", cycle: "breakfast", cycleLabel: "Breakfast", nextLabel: null }),
  );
  assert.equal(row.nextLabel, null);
});

test("neighborhood aggregates child SPACE states without choosing a health score", () => {
  const a = state({
    spaceId: "a",
    cycle: "breakfast",
    cycleLabel: "Breakfast",
    slots: [coveredSlot()],
  });
  const b = state({
    spaceId: "b",
    cycle: "breakfast",
    cycleLabel: "Breakfast",
    overdueKeys: ["food-temp"],
    exceptions: [
      {
        source: "coverage",
        state: "UNCOVERED",
        location: location("b"),
        operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
        label: "SERVER uncovered",
        href: null,
      },
      {
        source: "evidence",
        state: "OVERDUE",
        location: location("b"),
        operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
        label: "Food Temperature overdue",
        href: null,
      },
    ],
    slots: [uncoveredSlot()],
  });
  const c = state({
    spaceId: "c",
    cycle: "breakfast",
    cycleLabel: "Breakfast",
    exceptions: [
      {
        source: "asset_issue",
        state: "SERVICE_AT_RISK",
        location: location("c"),
        operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
        label: "Refrigerator unavailable",
        href: null,
      },
    ],
    slots: [coveredSlot()],
  });
  const row = presentLandingNeighborhood([a, b, c]);
  assert.equal(row.operationLabel, "Breakfast · Active");
  assert.deepEqual(row.summaryFacts, [
    "3 operational spaces",
    "2 need attention",
    "1 overdue log",
  ]);
  assert.equal(row.coverageLabel, "2 of 3 location responsibilities covered");
  assert.equal(row.needsAttention, true);
  assert.doesNotMatch(JSON.stringify(row), /needs_attention|health|Unhealthy/);
});

test("neighborhood all current stays quiet", () => {
  const row = presentLandingNeighborhood([
    state({ spaceId: "a", cycle: "breakfast", cycleLabel: "Breakfast", slots: [coveredSlot()] }),
    state({ spaceId: "b", cycle: "breakfast", cycleLabel: "Breakfast", slots: [coveredSlot()] }),
  ]);
  assert.equal(row.operationLabel, "Breakfast · Active");
  assert.deepEqual(row.summaryFacts, ["2 operational spaces"]);
  assert.equal(row.coverageLabel, null);
  assert.equal(row.needsAttention, false);
});

test("mixed child operations do not pick one shared cycle", () => {
  const row = presentLandingNeighborhood([
    state({ spaceId: "a", cycle: "breakfast", cycleLabel: "Breakfast" }),
    state({ spaceId: "b", cycle: "breakfast", cycleLabel: "Breakfast" }),
    state({ spaceId: "c", cycle: "cleaning", cycleLabel: "Cleaning" }),
  ]);
  assert.equal(row.operationLabel, "2 active operations");
  assert.doesNotMatch(row.operationLabel ?? "", /Breakfast · Active/);
});

test("neighborhood OA disabled across children is Coverage unavailable", () => {
  const row = presentLandingNeighborhood([
    state({
      spaceId: "a",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      coverageAvailability: "feature_disabled",
    }),
    state({
      spaceId: "b",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      coverageAvailability: "feature_disabled",
    }),
  ]);
  assert.equal(row.coverageLabel, LANDING_COVERAGE_UNAVAILABLE_LABEL);
});

test("floor is presentation-only attention reduction", () => {
  const current = presentLandingFloor([
    state({ spaceId: "a", cycle: "breakfast", cycleLabel: "Breakfast" }),
    state({ spaceId: "b", cycle: "breakfast", cycleLabel: "Breakfast" }),
  ]);
  assert.deepEqual(current.summaryFacts, ["All current"]);
  assert.equal(current.needsAttention, false);
  assert.equal(current.grain, "FLOOR");

  const attention = presentLandingFloor([
    state({ spaceId: "a", cycle: "breakfast", cycleLabel: "Breakfast" }),
    state({
      spaceId: "b",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      exceptions: [
        {
          source: "evidence",
          state: "OVERDUE",
          location: location("b"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "Food Temperature overdue",
          href: null,
        },
      ],
    }),
  ]);
  assert.deepEqual(attention.summaryFacts, ["1 location needs attention"]);
  assert.equal(attention.needsAttention, true);
});

test("collect + join preserves hierarchy order and existing hrefs", () => {
  const servery = treeNode({
    id: "room-servery",
    label: "Servery",
    kind: "ROOM",
    physicalId: "space-servery",
    presentation: "ACTIONABLE",
    href: "/unit/unit-1?space=space-servery",
    experienceKeys: ["MEAL_SERVICE"],
    areas: [
      {
        areaKey: "service",
        label: "Service",
        order: 1,
        experiences: [
          {
            experienceKey: "MEAL_SERVICE",
            areaKey: "service",
            label: "Meal Service",
            order: 1,
            allowedActionKeys: [],
          },
        ],
      },
    ],
  });
  const dining = treeNode({
    id: "room-dining",
    label: "Dining Room",
    kind: "ROOM",
    physicalId: "space-dining",
    presentation: "ACTIONABLE",
    href: "/unit/unit-1?space=space-dining",
  });
  const neighborhood = treeNode({
    id: "nbhd-1",
    label: "Central Terminal",
    kind: "NEIGHBORHOOD",
    physicalId: "unit-1",
    presentation: "ACTIONABLE",
    href: "/unit/unit-1",
    children: [servery, dining],
  });
  const floor = treeNode({
    id: "floor-3",
    label: "Floor 3",
    kind: "FLOOR",
    physicalId: "floor-3-unit",
    presentation: "STRUCTURAL",
    href: null,
    children: [neighborhood],
  });
  const view = landingView([floor]);
  const collected = collectActionableLandingSpaces(view);
  assert.deepEqual(
    collected.refs.map((ref) => ref.spaceId),
    ["space-servery", "space-dining"],
  );
  assert.equal(floor.href, null);
  assert.equal(neighborhood.href, "/unit/unit-1");
  assert.equal(servery.href, "/unit/unit-1?space=space-servery");

  const presentation = buildLocationsLandingPresentation({
    ancestry: collected.ancestry,
    states: [
      state({ spaceId: "space-servery", cycle: "breakfast", cycleLabel: "Breakfast" }),
      state({
        spaceId: "space-dining",
        cycle: null,
        nextLabel: "Lunch",
        exceptions: [
          {
            source: "evidence",
            state: "OVERDUE",
            location: location("space-dining"),
            operationalContext: { cycleStableKey: null, operationalTypeKey: "DINING" },
            label: "Opening check overdue",
            href: null,
          },
        ],
        overdueKeys: ["open"],
      }),
    ],
  });

  assert.equal(presentation.byNodeId["room-servery"]?.operationLabel, "Breakfast · Active");
  assert.equal(presentation.byNodeId["room-dining"]?.operationLabel, LANDING_NO_ACTIVE_OPERATION_LABEL);
  assert.equal(presentation.byNodeId["nbhd-1"]?.grain, "NEIGHBORHOOD");
  assert.equal(presentation.byNodeId["nbhd-1"]?.summaryFacts.includes("1 needs attention"), true);
  assert.equal(presentation.byNodeId["floor-3"]?.grain, "FLOOR");
  assert.deepEqual(presentation.byNodeId["floor-3"]?.summaryFacts, ["1 location needs attention"]);
  assert.equal(presentation.spaceCount, 2);
});

test("golden Dietary projection still yields ACTIONABLE SPACE refs in tree order", () => {
  const view = adaptProjectionToLocationsView(DIETARY_GOLDEN_PROJECTION);
  const collected = collectActionableLandingSpaces(view);
  assert.ok(collected.refs.length > 0);
  assert.ok(collected.refs.every((ref) => ref.spaceId && ref.departmentId));
  const rooms: string[] = [];
  const walk = (nodes: readonly LocationsTreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "ROOM" && node.presentation === "ACTIONABLE") {
        rooms.push(node.physicalId);
      }
      walk(node.children);
    }
  };
  for (const snapshot of view.departmentSnapshots) walk(snapshot.roots);
  assert.deepEqual(
    collected.refs.map((ref) => ref.spaceId),
    rooms,
  );
});

test("adapter and landing page do not query domain services or persist RLS", () => {
  const adapter = readFileSync(
    join(process.cwd(), "src/lib/locations/landing/from-runtime-state.ts"),
    "utf8",
  );
  const collect = readFileSync(
    join(process.cwd(), "src/lib/locations/landing/collect-spaces.ts"),
    "utf8",
  );
  const page = readFileSync(join(process.cwd(), "src/app/(protected)/units/page.tsx"), "utf8");
  const browser = readFileSync(
    join(process.cwd(), "src/components/locations-hierarchy-browser.tsx"),
    "utf8",
  );

  assert.doesNotMatch(adapter, /prisma|ScheduleEntry|loadPublishedRunModel|evaluateCoverage/);
  assert.doesNotMatch(collect, /prisma|loadRuntimeLocationStates/);
  assert.match(page, /collectActionableLandingSpaces/);
  assert.equal(page.split("loadRuntimeLocationStates").length - 1, 2);
  assert.match(page, /presentExceptionFirstLocationBoard/);
  assert.doesNotMatch(page, /buildLocationsLandingPresentation/);
  assert.doesNotMatch(page, /LocationsHierarchyBrowser/);
  assert.doesNotMatch(page, /from \"@\/lib\/scheduling/);
  assert.doesNotMatch(browser, /Experience\{|countExperiences|ReadinessChip|needs_attention/);
  assert.match(browser, /Configure facility structure/);
  assert.match(browser, /Configure this location/);
  assert.doesNotMatch(page, /\/locations\//);
});

test("Phase 6D does not migrate workspace, TW, sidebar, or dashboard", () => {
  const unitPage = readFileSync(
    join(process.cwd(), "src/app/(protected)/unit/[unitId]/page.tsx"),
    "utf8",
  );
  const sidebar = readFileSync(join(process.cwd(), "src/components/left-sidebar.tsx"), "utf8");
  const twLoad = readFileSync(
    join(process.cwd(), "src/lib/todays-work/operating-locations/load.ts"),
    "utf8",
  );
  assert.doesNotMatch(unitPage, /buildLocationsLandingPresentation/);
  assert.doesNotMatch(sidebar, /loadRuntimeLocationStates|landingByNodeId/);
  assert.match(twLoad, /loadRuntimeLocationStates/);
});
