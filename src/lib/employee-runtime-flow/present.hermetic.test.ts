/**
 * Phase 6K — EmployeeRuntimeFlow presentation.
 * Pure. No Prisma. Uses shared 6J next. No ScheduleEntry.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { composeEmployeeRuntimeFlow } from "./compose";
import {
  EMPLOYEE_DEVICE_MISMATCH_LABEL,
  EMPLOYEE_NO_CONFIRMED_ASSIGNMENT_LABEL,
  EMPLOYEE_SPACE_NOT_ASSIGNED_LABEL,
  presentEmployeeRuntimeExperience,
} from "./present";
import { EMPLOYEE_ASSIGNMENT_UNAVAILABLE_LABEL } from "./types";
import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { WorkRequirement } from "@/lib/department-work/types";
import { emptyLocationProgram } from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";

const NEXT_AT = new Date("2026-08-17T15:30:00.000Z");

function assignment(
  partial: Partial<JobFlowAssignmentSnapshot> & { id: string },
): JobFlowAssignmentSnapshot {
  return {
    id: partial.id,
    roleKey: partial.roleKey ?? "SERVER",
    roleLabel: partial.roleLabel ?? "Server",
    unitId: partial.unitId ?? "unit-a",
    unitName: partial.unitName ?? "3A",
    startsAt: partial.startsAt ?? new Date("2026-08-17T10:00:00.000Z"),
    endsAt: partial.endsAt ?? new Date("2026-08-17T18:00:00.000Z"),
    status: partial.status ?? "ACTIVE",
    scopeKind: partial.scopeKind ?? "SPACES",
    locationCount: partial.locationCount,
    locationLabels: partial.locationLabels,
    sourceZoneName: partial.sourceZoneName ?? null,
  };
}

function location(spaceId: string, label: string): ResolvedAssignmentLocation {
  return {
    unitSpaceId: spaceId,
    unitId: "unit-a",
    label,
    sortOrder: 10,
    roomNumber: null,
    spaceName: label,
    unitName: "3A",
  };
}

function evidenceItem(
  key: string,
  name: string,
  productState: RuntimeLocationState["evidence"]["items"][number]["productState"],
  catalogStableKey = "food_temperature_log",
) {
  return {
    requirementKey: key,
    attachmentId: `att-${key}`,
    catalogStableKey,
    displayName: name,
    productState,
    cycleStableKey: "breakfast",
    window: { start: "08:00", end: "09:00" },
    recordId: productState.startsWith("COMPLETED") ? `rec-${key}` : null,
    href: `/staffing/logs/open?attachmentId=att-${key}&requirementKey=${key}`,
    needsSupervisorReview: false,
  };
}

function state(partial: {
  spaceId: string;
  name?: string;
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
  issues?: RuntimeLocationState["assets"]["openIssues"];
  milestones?: RuntimeLocationState["milestones"]["items"];
}): RuntimeLocationState {
  const items = partial.evidenceItems ?? [];
  return withRuntimeLocationAnswers({
    identity: {
      location: {
        kind: "SPACE",
        spaceId: partial.spaceId,
        unitId: "unit-a",
        departmentId: "dept-1",
        facilityId: "fac-1",
      },
      displayName: partial.name ?? partial.spaceId,
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "Floor 3",
        neighborhoodName: "3A",
        unitName: "3A",
        spaceName: partial.name ?? partial.spaceId,
      },
      physical: { roomTypeKey: null, roomTypeLabel: null },
    },
    program: {
      locationProgram: emptyLocationProgram({
        departmentId: "dept-1",
        departmentName: "Dietary",
        spaceId: partial.spaceId,
        name: partial.name ?? partial.spaceId,
      }),
      operationalType: {
        state: "assigned",
        key: "SERVERY",
        name: "Servery",
        id: "ot",
        profileId: "p1",
        profileVersion: 1,
        profileStatus: "ACTIVE",
      },
      cycleSetRef: null,
      coverageExpectationRefs: [],
      logAttachmentRefs: [],
    },
    operation: {
      state: "ACTIVE",
      current: {
        cycleStableKey: "breakfast",
        cycleVersion: 1,
        label: "Breakfast",
        hierarchyLabel: "Breakfast",
        window: { start: "06:00", end: "10:00" },
        timing: {
          configured: "06:00",
          adjusted: null,
          expectedToday: "06:00",
          actual: null,
          recordedAt: null,
        },
      },
      upcoming: null,
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: { availability: "evaluated", planLifecycle: "RUNTIME_VISIBLE", slots: [] },
    evidence: {
      requiredToday: items.length,
      dueNow: items.filter((row) => row.productState === "DUE").map((row) => row.requirementKey),
      upcoming: items.filter((row) => row.productState === "UPCOMING").map((row) => row.requirementKey),
      completed: items
        .filter((row) => row.productState === "COMPLETED")
        .map((row) => row.requirementKey),
      overdue: items.filter((row) => row.productState === "OVERDUE").map((row) => row.requirementKey),
      needsReview: [],
      correctiveOpen: [],
      items,
    },
    assets: {
      assets: [],
      openIssues: partial.issues ?? [],
      issuesAffectingOperation: (partial.issues ?? []).filter((issue) =>
        ["SERVICE_AT_RISK", "EQUIPMENT_UNAVAILABLE", "WORKAROUND_AVAILABLE"].includes(issue.impact),
      ),
    },
    milestones: { items: partial.milestones ?? [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: [],
    next: { kind: "cycle_start", at: NEXT_AT, label: "Lunch service begins", sourceId: "lunch" },
    asOf: {
      now: new Date("2026-08-17T11:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  });
}

function work(
  partial: Partial<WorkRequirement> & { occurrenceKey: string; label: string; state: WorkRequirement["state"] },
): WorkRequirement {
  return {
    occurrenceKey: partial.occurrenceKey,
    workPlanId: "wp",
    workPlanStableKey: "wp",
    workPlanVersion: 1,
    workPlanName: "Plan",
    workItemId: "item",
    workItemKey: "item",
    label: partial.label,
    instructions: null,
    priority: "ROUTINE",
    completionMode: partial.completionMode ?? "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "OPERATIONAL_CYCLE",
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    dueAt: null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "unit-a",
    unitName: "3A",
    spaceId: partial.spaceId ?? "servery-a",
    assetId: null,
    roleKeys: [],
    knowledgeArticleId: null,
    procedureTitle: null,
    linkedTemplateStableKey: partial.linkedTemplateStableKey ?? null,
    linkedTemplateId: null,
    state: partial.state,
    occurrenceId: null,
    occurrenceStatus: null,
    assignedEmployeeId: null,
    completedByLabel: null,
    completedAt: null,
    evidenceRecordId: null,
    sourceKind: "WORK_PLAN",
    sourceHref: "/staffing/work-plans",
  };
}

function present(
  flow: ReturnType<typeof composeEmployeeRuntimeFlow>,
  grain: "neighborhood" | "space" = "neighborhood",
  spaceId?: string,
) {
  return presentEmployeeRuntimeExperience({
    flow,
    grain,
    landingUnitId: "unit-a",
    spaceId: spaceId ?? null,
    timezone: "UTC",
  });
}

function serverFlow() {
  const oa = assignment({ id: "oa-1", locationLabels: ["3A Servery"] });
  return composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: oa,
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "3A Servery" }],
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [evidenceItem("H1", "Food Temperature", "DUE")],
        milestones: [
          {
            kind: "SERVERY_READY",
            label: "Servery Ready",
            statusKey: "not_recorded",
            cycleStableKey: "breakfast",
            timing: {
              configured: "07:00",
              adjusted: null,
              expectedToday: "07:00",
              actual: null,
              recordedAt: null,
            },
            canonical: true,
          },
        ],
      }),
    ],
    templateEvidence: [],
    workRequirements: [],
  });
}

test("Neighborhood Server case: assignment, next Food Temperature, no coverage", () => {
  const view = present(serverFlow());
  assert.equal(view.assignmentTitle, "Your responsibility");
  assert.equal(view.roleLabel, "Server");
  assert.equal(view.locationSummary, "3A Servery");
  assert.equal(view.next?.label, "Food Temperature");
  assert.match(view.next?.href ?? "", /\/staffing\/logs\/open/);
  assert.match(view.next?.href ?? "", /attachmentId=att-H1/);
  assert.equal(view.assignedSpaces.length, 1);
  assert.equal(view.assignedSpaces[0]?.name, "3A Servery");
  assert.equal(view.evidenceGroups.some((group) => group.id === "due_now"), true);
  assert.equal(view.milestones.some((row) => row.label === "Servery Ready"), true);
  assert.equal(JSON.stringify(view).includes("1 of 2"), false);
  assert.equal(JSON.stringify(view).includes("Coverage"), false);
  assert.equal(JSON.stringify(view).includes("Configure"), false);
});

test("multi SPACE Neighborhood hides 3C", () => {
  const oa = assignment({
    id: "oa-2",
    locationCount: 2,
    locationLabels: ["3A Servery", "3B Servery"],
  });
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: oa,
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery"), location("servery-b", "3B Servery")],
    spaceRefs: [
      { spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "3A Servery" },
      { spaceId: "servery-b", departmentId: "dept-1", unitId: "unit-a", displayName: "3B Servery" },
    ],
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [evidenceItem("H1", "Food Temperature", "OVERDUE")],
      }),
      state({ spaceId: "servery-b", name: "3B Servery" }),
      state({
        spaceId: "servery-c",
        name: "3C Servery",
        evidenceItems: [evidenceItem("H3", "Leak", "OVERDUE")],
      }),
    ],
    templateEvidence: [],
    workRequirements: [],
  });
  const view = present(flow);
  assert.deepEqual(
    view.assignedSpaces.map((row) => row.name),
    ["3A Servery", "3B Servery"],
  );
  assert.equal(view.assignedSpaces.some((row) => row.name === "3C Servery"), false);
  assert.equal(view.assignedSpaces[0]?.attentionLabel, "Food Temperature overdue");
  assert.equal(view.assignedSpaces[1]?.attentionLabel, "No work currently due");
});

test("UNIT scope presents resolved child spaces", () => {
  const oa = assignment({ id: "oa-unit", scopeKind: "UNIT", locationCount: 0, locationLabels: [] });
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: oa,
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: ["s1", "s2", "s3"].map((id) => ({
      spaceId: id,
      departmentId: "dept-1",
      unitId: "unit-a",
      displayName: id,
    })),
    states: ["s1", "s2", "s3"].map((id) => state({ spaceId: id, name: id })),
    templateEvidence: [],
    workRequirements: [],
  });
  const view = present(flow);
  assert.deepEqual(view.assignedSpaces.map((row) => row.spaceId), ["s1", "s2", "s3"]);
});

test("unavailable assignment shows Assignment unavailable and no execution", () => {
  const view = present(
    composeEmployeeRuntimeFlow({
      operationalAssignmentsEnabled: false,
      canonicalLogsEnabled: true,
      currentAssignment: assignment({ id: "oa-x" }),
      upcomingAssignment: null,
      assignmentLocations: [location("servery-a", "3A Servery")],
      spaceRefs: [],
      states: [],
      templateEvidence: [],
      workRequirements: [],
    }),
  );
  assert.equal(view.assignmentTitle, EMPLOYEE_ASSIGNMENT_UNAVAILABLE_LABEL);
  assert.equal(view.showExecution, false);
  assert.equal(view.assignedSpaces.length, 0);
  assert.equal(view.work.length, 0);
  assert.equal(view.evidenceGroups.length, 0);
});

test("no confirmed assignment is distinct from unavailable", () => {
  const view = present(
    composeEmployeeRuntimeFlow({
      operationalAssignmentsEnabled: true,
      canonicalLogsEnabled: true,
      currentAssignment: null,
      upcomingAssignment: null,
      assignmentLocations: [],
      spaceRefs: [],
      states: [],
      templateEvidence: [],
      workRequirements: [],
    }),
  );
  assert.equal(view.assignmentTitle, EMPLOYEE_NO_CONFIRMED_ASSIGNMENT_LABEL);
  assert.equal(view.showExecution, false);
});

test("upcoming-only assignment is not presented as current work", () => {
  const upcoming = assignment({
    id: "oa-up",
    locationLabels: ["Dining Room"],
    startsAt: new Date("2026-08-17T15:00:00.000Z"),
  });
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: null,
    upcomingAssignment: upcoming,
    assignmentLocations: [location("dining", "Dining Room")],
    spaceRefs: [{ spaceId: "dining", departmentId: "dept-1", unitId: "unit-a", displayName: "Dining Room" }],
    states: [state({ spaceId: "dining", name: "Dining Room" })],
    templateEvidence: [],
    workRequirements: [],
  });
  const view = present(flow);
  assert.equal(view.assignmentTitle, "Upcoming assignment");
  assert.equal(view.currentAssignment, null);
  assert.ok(view.upcomingAssignment?.locationSummary?.includes("Dining Room"));
  assert.equal(view.next?.label.startsWith("Next assignment"), true);
});

test("device mismatch keeps assignment and hides execution", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-b", unitId: "unit-b", unitName: "4B" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-b", displayName: "4B Servery" }],
    states: [state({ spaceId: "servery-a", name: "4B Servery" })],
    templateEvidence: [],
    workRequirements: [],
    deviceBoundUnitId: "unit-a",
  });
  const view = present(flow);
  assert.equal(view.deviceMismatch, true);
  assert.equal(view.mismatchLabel, EMPLOYEE_DEVICE_MISMATCH_LABEL);
  assert.equal(view.showExecution, false);
  assert.equal(view.work.length, 0);
  assert.equal(view.roleLabel, "Server");
});

test("SPACE assigned vs unassigned", () => {
  const assigned = present(serverFlow(), "space", "servery-a");
  assert.equal(assigned.spaceAssigned, true);
  assert.equal(assigned.showExecution, true);
  assert.equal(assigned.spaceNotAssignedLabel, null);

  const other = present(serverFlow(), "space", "servery-c");
  assert.equal(other.spaceAssigned, false);
  assert.equal(other.showExecution, false);
  assert.equal(other.spaceNotAssignedLabel, EMPLOYEE_SPACE_NOT_ASSIGNED_LABEL);
});

test("Harbor and template evidence are never merged", () => {
  const harbor = present(serverFlow());
  assert.equal(harbor.evidenceMode, "harbor");
  assert.ok(harbor.next?.href?.includes("/staffing/logs/open"));

  const templateFlow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: false,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "3A Servery" }],
    states: [state({ spaceId: "servery-a", name: "3A Servery" })],
    templateEvidence: [
      {
        requirementKey: "tpl-food",
        state: "DUE",
        stateLabel: "Due now",
        operationalDateKey: "2026-08-17",
        templateId: "tpl",
        templateStableKey: "cooler_temperature_log",
        templateVersion: 1,
        templateName: "Cooler Temperature",
        purposeType: "LOG",
        scheduleKind: "OPERATIONAL_CYCLE",
        cycleStableKey: null,
        cycleLabel: null,
        windowStartLocal: null,
        windowEndLocal: null,
        windowStartsAt: null,
        windowEndsAt: null,
        unitId: "unit-a",
        spaceId: "servery-a",
        assetId: null,
        assetType: null,
        spaceType: null,
        recordId: null,
        recordStatus: null,
        fields: [],
        instructions: null,
      },
    ],
    workRequirements: [],
  });
  const template = present(templateFlow);
  assert.equal(template.evidenceMode, "template");
  assert.match(template.evidenceGroups[0]?.items[0]?.href ?? "", /evidence=tpl-food/);
  assert.equal((template.next?.href ?? "").includes("/staffing/logs/open"), false);
});

test("work stays distinct from evidence and linkedTemplateStableKey stays compatible", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "3A Servery" }],
    states: [state({ spaceId: "servery-a", name: "3A Servery" })],
    templateEvidence: [],
    workRequirements: [
      work({
        occurrenceKey: "occ-1",
        label: "Dining Room cleaning",
        state: "DUE",
        completionMode: "LINKED_EVIDENCE",
        linkedTemplateStableKey: "cooler_temperature_log",
      }),
    ],
  });
  const view = present(flow);
  assert.equal(view.work[0]?.kind, "work");
  assert.equal(view.work[0]?.label, "Dining Room cleaning");
  assert.match(view.work[0]?.href ?? "", /cooler_temperature_log/);
  assert.equal(view.next?.label, "Dining Room cleaning");
});

test("linked Work Plan exact Harbor catalogStableKey uses Harbor href", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "3A Servery" }],
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [evidenceItem("H-cooler", "Cooler Temperature", "DUE", "cooler_temperature_log")],
      }),
    ],
    templateEvidence: [],
    workRequirements: [
      work({
        occurrenceKey: "occ-cooler",
        label: "Confirm cooler temperatures",
        state: "DUE",
        completionMode: "LINKED_EVIDENCE",
        linkedTemplateStableKey: "cooler_temperature_log",
      }),
    ],
  });
  const view = present(flow);
  assert.match(view.work[0]?.href ?? "", /\/staffing\/logs\/open/);
  assert.match(view.work[0]?.href ?? "", /attachmentId=att-H-cooler/);
  assert.equal((view.work[0]?.href ?? "").includes("evidence="), false);
});

test("linked Work Plan tmpl_* key does not fake-match Harbor catalogStableKey", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "3A Servery" }],
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [evidenceItem("H-cooler", "Cooler Temperature", "DUE", "cooler_temperature_log")],
      }),
    ],
    templateEvidence: [],
    workRequirements: [
      work({
        occurrenceKey: "occ-legacy",
        label: "Confirm cooler temperatures",
        state: "DUE",
        completionMode: "LINKED_EVIDENCE",
        linkedTemplateStableKey: "tmpl_123",
      }),
    ],
  });
  const view = present(flow);
  assert.match(view.work[0]?.href ?? "", /evidence=tmpl_123/);
  assert.equal((view.work[0]?.href ?? "").includes("/staffing/logs/open"), false);
});

test("dishwasher_sanitizer_log does not silently match high_temp_dishwasher_log", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "3A Servery" }],
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        evidenceItems: [
          evidenceItem("H-dish", "High Temp Dishwasher", "DUE", "high_temp_dishwasher_log"),
        ],
      }),
    ],
    templateEvidence: [],
    workRequirements: [
      work({
        occurrenceKey: "occ-dish",
        label: "Sanitizer check",
        state: "DUE",
        completionMode: "LINKED_EVIDENCE",
        linkedTemplateStableKey: "dishwasher_sanitizer_log",
      }),
    ],
  });
  const view = present(flow);
  assert.match(view.work[0]?.href ?? "", /evidence=dishwasher_sanitizer_log/);
  assert.equal((view.work[0]?.href ?? "").includes("/staffing/logs/open"), false);
});

test("employee next uses 6J result, location next stays secondary", () => {
  const view = present(serverFlow());
  assert.equal(view.next?.label, "Food Temperature");
  assert.equal(view.locationNext?.label, "Lunch service begins");
});

test("stale bundle flag is presented without dropping the screen", () => {
  const flow = serverFlow();
  flow.offline.stale = true;
  const view = present(flow);
  assert.equal(view.stale, true);
  assert.equal(view.showExecution, true);
});

test("asset impact appears without coverage facts", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "3A Servery")],
    spaceRefs: [{ spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "3A Servery" }],
    states: [
      state({
        spaceId: "servery-a",
        name: "3A Servery",
        issues: [
          {
            issueId: "iss-1",
            assetId: "asset-1",
            summary: "Refrigerator unavailable",
            impact: "EQUIPMENT_UNAVAILABLE",
            href: null,
          },
        ],
      }),
    ],
    templateEvidence: [],
    workRequirements: [],
  });
  const view = present(flow);
  assert.equal(view.issues[0]?.summary, "Refrigerator unavailable");
  assert.equal(view.issues[0]?.impactLabel, "Equipment unavailable");
});

test("page contracts: no new route, leftover panel retired, board untouched", () => {
  const root = process.cwd();
  const page = readFileSync(join(root, "src/app/(protected)/unit/[unitId]/page.tsx"), "utf8");
  const neighborhood = readFileSync(
    join(root, "src/app/(protected)/unit/[unitId]/neighborhood-workspace-page.tsx"),
    "utf8",
  );
  const space = readFileSync(join(root, "src/app/(protected)/unit/[unitId]/space-workspace-page.tsx"), "utf8");
  const employeePage = readFileSync(
    join(root, "src/app/(protected)/unit/[unitId]/employee-runtime-page.tsx"),
    "utf8",
  );
  const board = readFileSync(join(root, "src/app/(protected)/staffing/operations/page.tsx"), "utf8");
  const presentSrc = readFileSync(join(root, "src/lib/employee-runtime-flow/present.ts"), "utf8");
  assert.equal(page.includes("EmployeeJobFlowPanel"), false);
  assert.equal(page.includes("/job-flow"), false);
  assert.match(neighborhood, /tryRenderEmployeeRuntimeExperience/);
  assert.match(space, /tryRenderEmployeeRuntimeExperience/);
  assert.match(employeePage, /presentEmployeeRuntimeExperience/);
  assert.match(employeePage, /viewer.kind !== "employee"/);
  assert.equal(board.includes("presentEmployeeRuntimeExperience"), false);
  assert.equal(presentSrc.includes("ScheduleEntry"), false);
  assert.equal(presentSrc.includes("from \"@/lib/prisma\""), false);
});
