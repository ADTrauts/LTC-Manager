/**
 * Phase 2C-2C — unified employee Job Flow presentation from flow.items.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { WorkRequirement } from "@/lib/department-work/types";
import { emptyLocationProgram } from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";

import { composeEmployeeRuntimeFlow } from "./compose";
import { resolveEmployeeNextAction } from "./next-action";
import { presentEmployeeRuntimeExperience } from "./present";
import type { JobFlowWorkOrderSource } from "./job-flow-item";

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

function work(
  partial: Partial<WorkRequirement> & {
    occurrenceKey: string;
    label: string;
    state: WorkRequirement["state"];
  },
): WorkRequirement {
  const sourceKind = partial.sourceKind ?? "ONE_OFF";
  return {
    occurrenceKey: partial.occurrenceKey,
    workPlanId: sourceKind === "WORK_PLAN" ? "wp" : "",
    workPlanStableKey: sourceKind === "WORK_PLAN" ? "wp" : "one_off",
    workPlanVersion: sourceKind === "WORK_PLAN" ? 1 : 0,
    workPlanName: sourceKind === "WORK_PLAN" ? "Plan" : "One-off Work",
    workItemId: "item",
    workItemKey: "item",
    label: partial.label,
    instructions: null,
    priority: "ROUTINE",
    completionMode: partial.completionMode ?? "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
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
    occurrenceId:
      partial.occurrenceId ?? (sourceKind === "ONE_OFF" ? `db-${partial.occurrenceKey}` : null),
    occurrenceStatus: null,
    assignedEmployeeId: null,
    completedByLabel: null,
    completedAt: null,
    evidenceRecordId: null,
    sourceKind,
    sourceHref:
      partial.sourceHref ??
      (sourceKind === "WORK_PLAN"
        ? "/staffing/work-plans"
        : `/staffing/operations?work=${partial.occurrenceKey}`),
  };
}

function state(partial: {
  spaceId: string;
  name?: string;
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
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
    operation: { state: "NONE", current: null, upcoming: null, provenance: "NEW_PERIOD_KEY_TIME" },
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
      openIssues: [],
      issuesAffectingOperation: [],
    },
    milestones: { items: partial.milestones ?? [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: [],
    next: null,
    asOf: {
      now: new Date("2026-08-17T12:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "America/New_York",
    },
  });
}

function present(flow: ReturnType<typeof composeEmployeeRuntimeFlow>) {
  return presentEmployeeRuntimeExperience({
    flow,
    grain: "neighborhood",
    landingUnitId: "unit-a",
    timezone: "America/New_York",
  });
}

test("presentation parity: Work, Records, Key Points, WO appear once from items", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "Servery")],
    spaceRefs: [
      {
        spaceId: "servery-a",
        departmentId: "dept-1",
        unitId: "unit-a",
        displayName: "Servery",
      },
    ],
    states: [
      state({
        spaceId: "servery-a",
        name: "Servery",
        evidenceItems: [
          {
            requirementKey: "H1",
            attachmentId: "att-H1",
            catalogStableKey: "cooler",
            displayName: "Cooler log",
            productState: "DUE",
            cycleStableKey: "breakfast",
            window: { start: "08:00", end: "09:00" },
            recordId: null,
            href: "/staffing/logs/open?attachmentId=att-H1&requirementKey=H1",
            needsSupervisorReview: false,
          },
        ],
        milestones: [
          {
            kind: "SERVERY_READY",
            label: "Servery Ready",
            cycleStableKey: null,
            timing: {
              configured: null,
              adjusted: null,
              expectedToday: null,
              actual: null,
              recordedAt: null,
            },
            statusKey: "not_recorded",
            canonical: false,
          },
        ],
      }),
    ],
    templateEvidence: [],
    workRequirements: [work({ occurrenceKey: "w1", label: "Wipe tables", state: "DUE" })],
    workOrders: [
      {
        id: "wo-1",
        repairCode: "R-1",
        title: "Fix sink",
        status: "ASSIGNED",
        dueAt: null,
        unitId: "unit-a",
        spaceId: "servery-a",
        assetId: null,
        pmOccurrenceId: null,
        workOrderKind: "CORRECTIVE",
      } satisfies JobFlowWorkOrderSource,
    ],
    assignmentExceptions: [
      {
        id: "call-off:se-1",
        kind: "CALL_OFF",
        label: "Shift called off",
        ownerState: "CALL_OFF",
        unitId: "unit-a",
        href: "/staffing?date=2026-08-17",
      },
    ],
  });

  const view = present(flow);
  assert.equal(view.work.length, 1);
  assert.equal(view.work[0]?.label, "Wipe tables");
  assert.equal(view.workOrders.length, 1);
  assert.equal(view.workOrders[0]?.href, "/repairs/wo-1");
  assert.equal(view.evidenceGroups.flatMap((g) => g.items).length, 1);
  assert.equal(view.milestones.length, 1);
  assert.equal(view.exceptions.length, 1);
  assert.equal(view.exceptions[0]?.label, "Shift called off");

  // No duplicate ids across work + evidence (same source would share owner)
  const ids = [
    ...view.work.map((row) => `work:${row.id}`),
    ...view.workOrders.map((row) => `wo:${row.id}`),
    ...view.evidenceGroups.flatMap((g) => g.items.map((row) => `ev:${row.id}`)),
  ];
  assert.equal(ids.length, new Set(ids).size);
});

test("next-action ignores informational exceptions and completed items", () => {
  const items = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "Servery")],
    spaceRefs: [
      {
        spaceId: "servery-a",
        departmentId: "dept-1",
        unitId: "unit-a",
        displayName: "Servery",
      },
    ],
    states: [],
    templateEvidence: [],
    workRequirements: [work({ occurrenceKey: "w-done", label: "Done", state: "COMPLETED" })],
    assignmentExceptions: [
      {
        id: "call-off:x",
        kind: "CALL_OFF",
        label: "Called off",
        ownerState: "CALL_OFF",
        unitId: "unit-a",
        href: null,
      },
    ],
    workOrders: [
      {
        id: "wo-due",
        repairCode: "R-2",
        title: "Belt",
        status: "IN_PROGRESS",
        dueAt: null,
        unitId: "unit-a",
        spaceId: null,
        assetId: null,
        pmOccurrenceId: null,
        workOrderKind: "CORRECTIVE",
      },
    ],
  });

  assert.equal(items.next.kind, "due_work_order");
  assert.equal(items.next.sourceId, "wo-due");
  assert.notEqual(items.next.kind, "none");

  const onlyException = resolveEmployeeNextAction({
    items: items.items.filter((row) => row.ownerKind === "ASSIGNMENT_EXCEPTION"),
    work: [],
    evidence: [],
    milestones: [],
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    locationNext: null,
  });
  assert.equal(onlyException.kind, "none");
});

test("progressive empty: no Assignment / no Cycle / no Records / no WO", () => {
  const noAssignment = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: null,
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [],
  });
  assert.equal(noAssignment.assignmentAvailability, "no_confirmed_assignment");
  assert.equal(noAssignment.items.length, 0);
  const view = present(noAssignment);
  assert.equal(view.showExecution, false);
  assert.equal(view.work.length, 0);
  assert.equal(view.workOrders.length, 0);

  const evaluatedEmpty = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [location("servery-a", "Servery")],
    spaceRefs: [
      {
        spaceId: "servery-a",
        departmentId: "dept-1",
        unitId: "unit-a",
        displayName: "Servery",
      },
    ],
    states: [state({ spaceId: "servery-a", name: "Servery" })],
    templateEvidence: [],
    workRequirements: [],
  });
  const emptyView = present(evaluatedEmpty);
  assert.equal(emptyView.showExecution, true);
  assert.equal(emptyView.work.length, 0);
  assert.equal(emptyView.workOrders.length, 0);
  assert.equal(emptyView.evidenceGroups.length, 0);
  assert.equal(emptyView.milestones.length, 0);
  assert.equal(emptyView.next, null);
});

test("PM-generated WO presents once; identity stays owner-stable across spaces", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [
      location("servery-a", "Servery"),
      location("kitchen-a", "Kitchen"),
    ],
    spaceRefs: [
      { spaceId: "servery-a", departmentId: "dept-1", unitId: "unit-a", displayName: "Servery" },
      { spaceId: "kitchen-a", departmentId: "dept-1", unitId: "unit-a", displayName: "Kitchen" },
    ],
    states: [
      state({ spaceId: "servery-a", name: "Servery" }),
      state({ spaceId: "kitchen-a", name: "Kitchen" }),
    ],
    templateEvidence: [],
    workRequirements: [],
    workOrders: [
      {
        id: "wo-pm",
        repairCode: "R-PM",
        title: "Filter change",
        status: "ASSIGNED",
        dueAt: null,
        unitId: "unit-a",
        spaceId: "kitchen-a",
        assetId: "asset-1",
        pmOccurrenceId: "pm-1",
        workOrderKind: "PREVENTIVE",
      },
    ],
    preventiveMaintenance: [
      {
        id: "pm-1",
        label: "Filter change",
        status: "OPEN",
        unitId: "unit-a",
        spaceId: "kitchen-a",
        assetId: "asset-1",
        activeWorkOrderId: null,
        dueAt: null,
      },
    ],
  });
  assert.equal(flow.items.filter((row) => row.ownerKind === "WORK_ORDER").length, 1);
  assert.equal(flow.items.filter((row) => row.ownerKind === "PREVENTIVE_MAINTENANCE").length, 0);
  const view = present(flow);
  assert.equal(view.workOrders.length, 1);
  assert.equal(view.workOrders[0]?.id, "wo-pm");
});

test("compatibility fences remain closed; offline serialize still reads parallel Work", () => {
  const root = process.cwd();
  const phase2a = readFileSync(
    join(root, "src/lib/department-administration/phase-2a-location-function-authoring.hermetic.test.ts"),
    "utf8",
  );
  const phase2b = readFileSync(
    join(root, "src/lib/department-work/phase-2b-generic-work-authoring.hermetic.test.ts"),
    "utf8",
  );
  assert.match(phase2a, /LOCATION_FUNCTION_AUTHORING_RETIRED/);
  assert.match(phase2b, /GENERIC_WORK_AUTHORING_RETIRED/);

  const ui = readFileSync(
    join(root, "src/components/unit-workspace/employee-runtime-experience.tsx"),
    "utf8",
  );
  assert.match(ui, /workOrders/);
  assert.match(ui, /exceptions/);
  assert.match(ui, /employee-runtime-work-order-item/);

  const offline = readFileSync(
    join(root, "src/lib/employee-runtime-flow/serialize-offline.ts"),
    "utf8",
  );
  assert.match(offline, /flow\.work/);
  // Phase 2C-2D adds additive jobFlowItemContext from flow.items; Work commands stay on workContext.
  assert.match(offline, /flow\.items/);
  assert.match(offline, /serializeEmployeeRuntimeJobFlowItemContext/);
});
