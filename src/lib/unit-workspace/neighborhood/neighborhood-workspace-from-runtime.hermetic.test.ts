/**
 * Phase 6F — Neighborhood workspace is a presentation aggregation of child SPACE RLS.
 * Pure adapter. No Prisma. No ScheduleEntry. No Neighborhood RLS.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { LocationsTreeNode, LocationsViewModel } from "@/lib/locations/types";
import { emptyLocationProgram } from "@/lib/department-administration/location-program";
import { presentExceptionFirstLocationCard } from "@/lib/locations/exception-first";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";
import { resolveSpaceWorkspaceViewer } from "@/lib/unit-workspace/space";

import { collectNeighborhoodActionableSpaces, isStructuralNeighborhoodUnit } from "./collect-spaces";
import { neighborhoodExceptionRank, presentNeighborhoodWorkspace } from "./from-runtime-state";
import {
  NEIGHBORHOOD_COVERAGE_UNAVAILABLE_LABEL,
  NEIGHBORHOOD_NO_ACTIVE_OPERATION_LABEL,
  NEIGHBORHOOD_NO_OPERATIONAL_SPACES_COPY,
} from "./types";

const NEXT_A = new Date("2026-08-17T12:30:00.000Z");
const NEXT_B = new Date("2026-08-17T15:00:00.000Z");

function location(spaceId: string, unitId = "unit-ct") {
  return {
    kind: "SPACE" as const,
    spaceId,
    unitId,
    departmentId: "dept-1",
    facilityId: "fac-1",
  };
}

function state(partial: {
  spaceId: string;
  name?: string;
  unitId?: string;
  ot?: "assigned" | "unassigned";
  cycle?: string | null;
  cycleLabel?: string;
  coverageAvailability?: RuntimeLocationState["coverage"]["availability"];
  slots?: RuntimeLocationState["coverage"]["slots"];
  exceptions?: RuntimeLocationState["exceptions"];
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
  overdue?: string[];
  dueNow?: string[];
  upcomingKeys?: string[];
  completed?: string[];
  assets?: RuntimeLocationState["assets"]["assets"];
  issues?: RuntimeLocationState["assets"]["openIssues"];
  milestones?: RuntimeLocationState["milestones"]["items"];
  changes?: RuntimeLocationState["changes"];
  nextAt?: Date | null;
  nextLabel?: string | null;
}): RuntimeLocationState {
  const loc = location(partial.spaceId, partial.unitId);
  const assigned = (partial.ot ?? "assigned") === "assigned";
  const items = partial.evidenceItems ?? [];
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
      physical: { roomTypeKey: null, roomTypeLabel: null },
    },
    program: {
      locationProgram: assigned
        ? {
            ...emptyLocationProgram({
              departmentId: loc.departmentId,
              departmentName: "Dietary",
              spaceId: loc.spaceId,
              name: partial.name ?? partial.spaceId,
            }),
            teams: [
              {
                id: "t1",
                name: "Servery AM",
                provenance: { source: "TEAM_ROOM_MEMBERSHIP", detail: "Works this room" },
              },
            ],
          }
        : emptyLocationProgram({
            departmentId: loc.departmentId,
            departmentName: "Dietary",
            spaceId: loc.spaceId,
            name: partial.name ?? partial.spaceId,
          }),
      operationalType: {
        state: assigned ? "assigned" : "unassigned",
        key: assigned ? "SERVERY" : null,
        name: assigned ? "Servery" : null,
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
      upcoming: null,
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: {
      availability: partial.coverageAvailability ?? "evaluated",
      planLifecycle: "RUNTIME_VISIBLE",
      slots: partial.slots ?? [],
    },
    evidence: {
      requiredToday: items.length,
      dueNow: partial.dueNow ?? [],
      upcoming: partial.upcomingKeys ?? [],
      completed: partial.completed ?? [],
      overdue: partial.overdue ?? [],
      needsReview: [],
      correctiveOpen: [],
      items,
    },
    assets: {
      assets: partial.assets ?? [],
      openIssues: partial.issues ?? [],
      issuesAffectingOperation: (partial.issues ?? []).filter(
        (issue) =>
          issue.impact === "SERVICE_AT_RISK" || issue.impact === "EQUIPMENT_UNAVAILABLE",
      ),
    },
    milestones: { items: partial.milestones ?? [] },
    readiness: DEFERRED_READINESS,
    changes: partial.changes ?? [],
    exceptions: partial.exceptions ?? [],
    next:
      partial.nextLabel === null || partial.nextAt === null
        ? null
        : {
            kind: "evidence_window",
            at: partial.nextAt ?? NEXT_A,
            label: partial.nextLabel ?? "Food Temperature",
            sourceId: `${partial.spaceId}-next`,
          },
    asOf: {
      now: new Date("2026-08-17T11:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  });
}

function slot(state: "COVERED" | "UNCOVERED" | "AT_RISK") {
  return {
    expectationId: "e1",
    templateStableKey: "cov",
    templateVersion: 1,
    roleKey: "SERVER",
    roleLabel: "Server",
    requiredCount: 1,
    filledCount: state === "COVERED" ? 1 : 0,
    state,
    cycleStableKey: "breakfast",
    assignmentIds: state === "COVERED" ? ["oa-1"] : [],
    assignmentRefs:
      state === "COVERED"
        ? [{ assignmentId: "oa-1", employeeId: null, employeeDisplayName: null }]
        : [],
  } satisfies RuntimeLocationState["coverage"]["slots"][number];
}

function evidence(key: string, name: string, productState: RuntimeLocationState["evidence"]["items"][number]["productState"]) {
  return {
    requirementKey: key,
    attachmentId: `att-${key}`,
    catalogStableKey: "food_temperature_log",
    displayName: name,
    productState,
    cycleStableKey: "breakfast",
    window: { start: "08:00", end: "09:00" },
    recordId: productState.startsWith("COMPLETED") ? `rec-${key}` : null,
    href: productState.startsWith("COMPLETED") ? `/staffing/logs/records/rec-${key}` : null,
    needsSupervisorReview: false,
  };
}

const supervisor = resolveSpaceWorkspaceViewer({
  role: "SUPERVISOR",
  authMethod: "PASSWORD",
  authKind: "user",
  uid: "u1",
});
const employee = resolveSpaceWorkspaceViewer({
  role: "STAFF",
  authMethod: "QUICK_PIN",
  authKind: "employee",
  uid: "emp-1",
});

function present(states: RuntimeLocationState[]) {
  return presentNeighborhoodWorkspace(states, {
    unitId: "unit-ct",
    unitName: "Central Terminal",
    viewer: supervisor,
  });
}

test("one child SPACE still renders the aggregate shell", () => {
  const child = state({ spaceId: "kitchen", name: "Main Kitchen", cycle: "breakfast", cycleLabel: "Breakfast" });
  const view = present([child]);
  assert.equal(view.spaceCount, 1);
  assert.equal(view.spaces[0]?.name, "Main Kitchen");
  assert.equal(view.spaces[0]?.href, "/unit/unit-ct?space=kitchen");
  assert.equal(view.operation.label, "Breakfast · Active");
  assert.deepEqual(view.spaces[0]?.card, presentExceptionFirstLocationCard(child));
});

test("Central Terminal: 3 children, mixed operations, one needs attention", () => {
  const view = present([
    state({
      spaceId: "servery",
      name: "Servery",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      slots: [slot("UNCOVERED")],
      exceptions: [
        {
          source: "coverage",
          state: "UNCOVERED",
          location: location("servery"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "SERVER uncovered",
          href: null,
        },
        {
          source: "evidence",
          state: "OVERDUE",
          location: location("servery"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "Food Temperature overdue",
          href: null,
        },
      ],
    }),
    state({ spaceId: "dining", name: "Dining Room", cycle: null }),
    state({
      spaceId: "utility",
      name: "Utility Room",
      cycle: "cleaning",
      cycleLabel: "Cleaning",
    }),
  ]);

  assert.equal(view.spaceCount, 3);
  assert.equal(view.operation.kind, "mixed");
  assert.equal(view.operation.label, "2 active operations");
  assert.equal(view.attentionCount, 1);
  assert.deepEqual(
    view.spaces.map((row) => row.name),
    ["Servery", "Dining Room", "Utility Room"],
  );
  assert.equal(view.spaces[1]?.landing.operationLabel, "No active operation");
  assert.equal(view.spaces[0]?.card.happeningLabel, "Breakfast · Active");
  assert.match(view.spaces[0]?.href ?? "", /#coverage/);
  assert.equal(view.atRiskCount, 1);
  assert.ok(!JSON.stringify(view).toLowerCase().includes("unhealthy"));
  assert.ok(!("health" in view));
});

test("all-current neighborhood stays calm", () => {
  const view = present([
    state({ spaceId: "a", name: "A", cycle: "breakfast", cycleLabel: "Breakfast" }),
    state({ spaceId: "b", name: "B", cycle: "breakfast", cycleLabel: "Breakfast" }),
  ]);
  assert.equal(view.attentionCount, 0);
  assert.equal(view.exceptions.length, 0);
  assert.equal(view.operation.label, "Breakfast · Active");
});

test("shared vs mixed vs no active operation", () => {
  const none = present([
    state({ spaceId: "a", cycle: null, nextLabel: "Lunch", nextAt: NEXT_B }),
    state({ spaceId: "b", cycle: null, nextLabel: "Food Temperature", nextAt: NEXT_A }),
  ]);
  assert.equal(none.operation.label, NEIGHBORHOOD_NO_ACTIVE_OPERATION_LABEL);
  assert.equal(none.next?.label, "Food Temperature");
  assert.equal(none.next?.spaceName, "b");
  assert.equal(none.next?.timeLabel, "12:30 PM");
});

test("OA disabled and mixed coverage availability", () => {
  const disabled = present([
    state({ spaceId: "a", coverageAvailability: "feature_disabled" }),
    state({ spaceId: "b", coverageAvailability: "feature_disabled" }),
  ]);
  assert.equal(disabled.coverage.unavailable, true);
  assert.equal(disabled.coverage.summary, NEIGHBORHOOD_COVERAGE_UNAVAILABLE_LABEL);

  const mixed = present([
    state({ spaceId: "a", coverageAvailability: "feature_disabled" }),
    state({
      spaceId: "b",
      coverageAvailability: "evaluated",
      slots: [slot("COVERED")],
    }),
  ]);
  assert.equal(mixed.coverage.availability, "mixed");
  assert.match(mixed.coverage.summary ?? "", /coverage unavailable/);
  assert.doesNotMatch(mixed.coverage.summary ?? "", /^Covered$|^Uncovered$/);

  const src = readFileSync(join(import.meta.dirname, "from-runtime-state.ts"), "utf8");
  assert.equal(src.includes("ScheduleEntry"), false);
  assert.equal(src.includes("from \"@/lib/prisma\""), false);
});

test("coverage aggregates child slots without inventing neighborhood demand", () => {
  const view = present([
    state({ spaceId: "a", slots: [slot("COVERED")] }),
    state({ spaceId: "b", slots: [slot("COVERED")] }),
    state({ spaceId: "c", slots: [slot("UNCOVERED")] }),
  ]);
  assert.equal(view.coverage.evaluatedCount, 3);
  assert.equal(view.coverage.coveredCount, 2);
  assert.equal(view.coverage.uncoveredCount, 1);
  assert.doesNotMatch(view.coverage.summary ?? "", /SERVER ×3/);
});

test("evidence overdue across two spaces keeps identity", () => {
  const view = present([
    state({
      spaceId: "servery",
      name: "3A Servery",
      overdue: ["temp-a"],
      evidenceItems: [evidence("temp-a", "Food Temperature", "OVERDUE")],
    }),
    state({
      spaceId: "dining",
      name: "Dining Room",
      overdue: ["temp-b"],
      evidenceItems: [evidence("temp-b", "Food Temperature", "OVERDUE")],
    }),
  ]);
  assert.equal(view.overdueEvidenceCount, 2);
  const attention = view.evidence.groups.find((group) => group.id === "needs_attention");
  assert.equal(attention?.items.length, 2);
  assert.equal(attention?.items[0]?.spaceName, "3A Servery");
  assert.equal(attention?.items[1]?.spaceName, "Dining Room");
  assert.match(attention?.items[0]?.href ?? "", /space=servery/);
});

test("asset SERVICE_AT_RISK stays on the owning SPACE", () => {
  const view = present([
    state({
      spaceId: "servery",
      name: "Main Servery",
      assets: [
        {
          assetId: "ref-1",
          name: "Refrigerator #3",
          status: "DEGRADED",
          openIssueCount: 1,
          openWorkOrderCount: 1,
        },
      ],
      issues: [
        {
          issueId: "iss-1",
          assetId: "ref-1",
          impact: "SERVICE_AT_RISK",
          summary: "Door seal damaged",
          href: "/asset-issues/iss-1",
        },
      ],
      exceptions: [
        {
          source: "asset_issue",
          state: "SERVICE_AT_RISK",
          location: location("servery"),
          operationalContext: { cycleStableKey: null, operationalTypeKey: "SERVERY" },
          label: "Door seal damaged",
          href: "/asset-issues/iss-1",
        },
      ],
    }),
    state({
      spaceId: "utility",
      name: "Utility Room",
      assets: [
        {
          assetId: "cart-1",
          name: "Cart",
          status: "OPERATIONAL",
          openIssueCount: 0,
          openWorkOrderCount: 1,
        },
      ],
    }),
  ]);
  const fridge = view.assets.find((row) => row.assetId === "ref-1");
  const cart = view.assets.find((row) => row.assetId === "cart-1");
  assert.equal(fridge?.spaceName, "Main Servery");
  assert.equal(fridge?.issues[0]?.operationalException, true);
  assert.equal(cart?.spaceName, "Utility Room");
  assert.equal(cart?.issues.length, 0);
  assert.equal(view.exceptions.every((row) => row.spaceId === "servery"), true);
});

test("milestones and Servery Ready remain child-specific", () => {
  const view = present([
    state({
      spaceId: "servery",
      name: "3A Servery",
      milestones: [
        {
          kind: "SERVERY_READY",
          label: "Servery Ready",
          cycleStableKey: "breakfast",
          timing: {
            configured: null,
            adjusted: null,
            expectedToday: null,
            actual: "07:43",
            recordedAt: null,
          },
          statusKey: "not_recorded",
          canonical: false,
        },
      ],
    }),
    state({
      spaceId: "kitchen",
      name: "Main Kitchen",
      milestones: [
        {
          kind: "KEY_TIME",
          label: "Food leaves Main Kitchen",
          cycleStableKey: "kt",
          timing: {
            configured: "07:35",
            adjusted: "07:40",
            expectedToday: "07:40",
            actual: "07:41",
            recordedAt: null,
          },
          statusKey: "completed_on_time",
          canonical: true,
        },
      ],
    }),
  ]);
  assert.equal(view.milestones.length, 2);
  assert.equal(view.milestones[0]?.spaceName, "3A Servery");
  assert.equal(view.milestones[0]?.kind, "SERVERY_READY");
  assert.equal(view.milestones[1]?.adjusted, "7:40 AM");
  assert.ok(!JSON.stringify(view).includes("Neighborhood Ready"));
});

test("changes keep SPACE identity and chronological order", () => {
  const view = present([
    state({
      spaceId: "kitchen",
      name: "Main Kitchen",
      changes: [
        {
          kind: "KEY_TIME_ADJUSTED",
          sourceId: "kt",
          at: new Date("2026-08-17T11:35:00.000Z"),
          detail: "Breakfast production Key Time adjusted +5 min",
          doesNotRewriteBuild: true,
        },
      ],
    }),
    state({
      spaceId: "servery",
      name: "3A Servery",
      changes: [
        {
          kind: "SERVERY_READY",
          sourceId: "ready",
          at: new Date("2026-08-17T11:43:00.000Z"),
          detail: "Servery Ready",
          doesNotRewriteBuild: true,
        },
      ],
    }),
  ]);
  assert.equal(view.today[0]?.spaceName, "Main Kitchen");
  assert.equal(view.today[1]?.spaceName, "3A Servery");
});

test("untyped child is configuration, not neighborhood attention", () => {
  const view = present([
    state({ spaceId: "kitchen", name: "Main Kitchen", ot: "unassigned" }),
  ]);
  assert.equal(view.spaces[0]?.landing.configurationLabel, "Location Program not attached");
  assert.equal(view.attentionCount, 0);
});

test("no children is a safe empty aggregate", () => {
  const view = present([]);
  assert.equal(view.spaceCount, 0);
  assert.equal(view.operation.label, NEIGHBORHOOD_NO_ACTIVE_OPERATION_LABEL);
  assert.equal(view.next, null);
  assert.equal(view.emptySpaces?.copy, NEIGHBORHOOD_NO_OPERATIONAL_SPACES_COPY);
  assert.equal(view.emptySpaces?.facilityBuilderHref, null);
  assert.equal(view.emptySpaces?.departmentLocationsHref, null);
});

test("zero-space manager actions distinguish Facility Builder from Department Locations", () => {
  const physicalMissing = presentNeighborhoodWorkspace([], {
    unitId: "unit-empty",
    unitName: "Empty Parent",
    viewer: supervisor,
    emptySpaceActions: {
      facilityBuilderHref: "/admin/facility/builder",
      departmentLocationsHref: null,
    },
  });
  assert.equal(physicalMissing.emptySpaces?.facilityBuilderHref, "/admin/facility/builder");
  assert.equal(physicalMissing.emptySpaces?.departmentLocationsHref, null);

  const programmingMissing = presentNeighborhoodWorkspace([], {
    unitId: "unit-empty",
    unitName: "Empty Parent",
    viewer: supervisor,
    emptySpaceActions: {
      facilityBuilderHref: null,
      departmentLocationsHref: "/admin/departments/dept-1?tab=locations",
    },
  });
  assert.equal(programmingMissing.emptySpaces?.facilityBuilderHref, null);
  assert.equal(
    programmingMissing.emptySpaces?.departmentLocationsHref,
    "/admin/departments/dept-1?tab=locations",
  );

  const employeeEmpty = presentNeighborhoodWorkspace([], {
    unitId: "unit-empty",
    unitName: "Empty Parent",
    viewer: employee,
  });
  assert.equal(employeeEmpty.emptySpaces?.copy, NEIGHBORHOOD_NO_OPERATIONAL_SPACES_COPY);
  assert.equal(employeeEmpty.emptySpaces?.facilityBuilderHref, null);
  assert.equal(employeeEmpty.emptySpaces?.departmentLocationsHref, null);
});

test("employee density hides management coverage complexity", () => {
  const view = presentNeighborhoodWorkspace(
    [
      state({ spaceId: "a", slots: [slot("UNCOVERED")], dueNow: ["due-1"], evidenceItems: [evidence("due-1", "Hand Hygiene", "DUE")] }),
    ],
    { unitId: "unit-ct", unitName: "Central Terminal", viewer: employee },
  );
  assert.equal(view.showDetailedCoverage, false);
  assert.equal(view.sectionOrder[1], "spaces");
  assert.equal(view.sectionOrder[2], "evidence");
  assert.equal(view.managerLinks.logBookHref, null);
});

test("exception rank prefers uncovered, then at-risk, then asset, then overdue", () => {
  assert.ok(
    neighborhoodExceptionRank({ source: "coverage", state: "UNCOVERED" } as never) <
      neighborhoodExceptionRank({ source: "coverage", state: "AT_RISK" } as never),
  );
  assert.ok(
    neighborhoodExceptionRank({ source: "asset_issue", state: "SERVICE_AT_RISK" } as never) <
      neighborhoodExceptionRank({ source: "evidence", state: "OVERDUE" } as never),
  );
});

test("collect children from hierarchy; floors do not pull descendant rooms", () => {
  const room = (id: string, unitId: string, parentId: string): LocationsTreeNode => ({
    id,
    label: id,
    secondaryLabel: null,
    presentation: "ACTIONABLE",
    physicalId: id,
    kind: "ROOM",
    hierarchyLevel: "LEVEL_3",
    parentId,
    unitId,
    href: `/unit/${unitId}?space=${id}`,
    experienceKeys: [],
    areas: [],
    children: [],
  });
  const tree: LocationsViewModel = {
    facilityId: "fac-1",
    purpose: "LOCATIONS",
    lensMode: "DEPARTMENT",
    lensKey: "DIETARY",
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
    projectedUnitIds: ["floor-1", "unit-ct"],
    diagnostics: [],
    departmentSnapshots: [
      {
        departmentId: "dept-1",
        departmentKey: "DIETARY",
        label: "Dietary",
        actionableLocationIds: ["servery"],
        unitIds: ["floor-1", "unit-ct"],
        plantPolicy: null,
        roots: [
          {
            id: "floor-1-node",
            label: "Floor 3",
            secondaryLabel: null,
            presentation: "STRUCTURAL",
            physicalId: "floor-1",
            kind: "FLOOR",
            hierarchyLevel: "LEVEL_1",
            parentId: null,
            unitId: "floor-1",
            href: null,
            experienceKeys: [],
            areas: [],
            children: [
              {
                id: "ct-node",
                label: "Central Terminal",
                secondaryLabel: null,
                presentation: "ACTIONABLE",
                physicalId: "unit-ct",
                kind: "NEIGHBORHOOD",
                hierarchyLevel: "LEVEL_2",
                parentId: "floor-1-node",
                unitId: "unit-ct",
                href: "/unit/unit-ct",
                experienceKeys: [],
                areas: [],
                children: [room("servery", "unit-ct", "ct-node")],
              },
            ],
          },
        ],
      },
    ],
  };

  const neighborhood = collectNeighborhoodActionableSpaces(tree, "unit-ct");
  assert.deepEqual(
    neighborhood.refs.map((row) => row.spaceId),
    ["servery"],
  );
  const floor = collectNeighborhoodActionableSpaces(tree, "floor-1");
  assert.equal(floor.refs.length, 0);
  assert.equal(isStructuralNeighborhoodUnit("FLOOR"), true);
  assert.equal(isStructuralNeighborhoodUnit("BUILDING"), true);
  assert.equal(isStructuralNeighborhoodUnit("NEIGHBORHOOD"), false);
  assert.equal(isStructuralNeighborhoodUnit("LEGACY_LOCATION"), false);
  assert.equal(isStructuralNeighborhoodUnit(null), false);
  assert.equal(isStructuralNeighborhoodUnit(undefined), false);
});
