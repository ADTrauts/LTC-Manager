/**
 * Phase 6P — Supervisor Operations Board presentation.
 * Formats and groups SupervisorOperationsViewModel. Does not create operational truth.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  SUPERVISOR_ASSIGNMENT_UNAVAILABLE,
  SUPERVISOR_COVERAGE_UNAVAILABLE,
  SUPERVISOR_MIXED_OPERATION_LABEL,
  SUPERVISOR_NO_ACTIVE_OPERATION_LABEL,
} from "./compose";
import {
  BOARD_SECTION_ORDER,
  SHARED_UNIT_SYNC_LIMITATION,
  presentSupervisorOperationsBoardUi,
} from "./present-ui";
import type { SupervisorOperationsViewModel } from "./types";

function view(partial: Partial<SupervisorOperationsViewModel> = {}): SupervisorOperationsViewModel {
  return {
    identity: {
      facilityId: "fac-1",
      facilityName: "Harbor",
      departmentId: "dept-1",
      departmentName: "Dietary",
      departmentKey: "DIETARY",
      operationalDateKey: "2026-08-17",
      timezone: "America/New_York",
      lastUpdated: "2026-08-17T11:00:00.000Z",
    },
    operation: {
      kind: "shared",
      label: "Breakfast · Active",
      currentLabel: "Breakfast · Active",
      nextLabel: null,
      activeLabels: ["Breakfast"],
    },
    plan: { status: "CONFIRMED" },
    presence: {
      availability: "available",
      scheduledCount: 14,
      callOffCount: 1,
      scheduledEmployees: [
        { id: "jane", name: "Jane Smith", hasCallOff: true },
        { id: "mary", name: "Mary A", hasCallOff: false },
      ],
    },
    assignments: {
      availability: "available",
      assignedCount: 12,
      assignments: [
        {
          id: "oa-jane",
          employeeId: "jane",
          employeeName: "Jane Smith",
          unitId: "unit-4b",
          unitName: "4B Servery",
          roleKey: "SERVER",
          roleLabel: "SERVER",
          status: "PLANNED",
        },
      ],
      callOffAffectsAssignment: [{ id: "jane", name: "Jane Smith", hasCallOff: true }],
    },
    coverage: {
      availability: "available",
      engine: "dietary",
      covered: 15,
      atRisk: 1,
      uncovered: 2,
      gaps: [
        {
          unitId: "unit-3a",
          unitName: "3A",
          locationLabel: "3A Servery",
          roleKey: "SERVER",
          roleLabel: "SERVER",
          state: "UNCOVERED",
          requiredCount: 1,
          filledCount: 0,
        },
        {
          unitId: "unit-3b",
          unitName: "3B",
          locationLabel: "3B Servery",
          roleKey: "SERVER",
          roleLabel: "SERVER",
          state: "AT_RISK",
          requiredCount: 1,
          filledCount: 1,
        },
        {
          unitId: "unit-4b",
          unitName: "4B",
          locationLabel: "4B Servery",
          roleKey: "SERVER",
          roleLabel: "SERVER",
          state: "UNCOVERED",
          requiredCount: 1,
          filledCount: 0,
        },
      ],
    },
    needsAttention: {
      people: [
        {
          status: "Call-off",
          temporal: "Current",
          employeeId: "jane",
          employeeName: "Jane Smith",
          sourceHref: "/staffing/assignments?departmentId=dept-1",
          availableActions: ["Open Assignment Board"],
        },
      ],
      coverage: [
        {
          status: "SERVER uncovered",
          temporal: "NotConfirmed",
          unitId: "unit-3a",
          unitName: "3A",
          locationLabel: "3A Servery",
          sourceHref: "/staffing/assignments?departmentId=dept-1",
          availableActions: ["Open Assignment Board"],
        },
        {
          status: "SERVER at risk",
          temporal: "Current",
          unitId: "unit-3b",
          unitName: "3B",
          locationLabel: "3B Servery",
          sourceHref: "/staffing/assignments?departmentId=dept-1",
          availableActions: ["Open Assignment Board"],
        },
      ],
      milestones: [
        {
          status: "Meal Service Started late",
          temporal: "Late",
          unitId: "unit-4a",
          unitName: "4A",
          locationLabel: "4A Servery",
          sourceHref: "/unit/unit-4a?space=s4a#milestones",
          availableActions: ["Open SPACE milestones"],
        },
        {
          status: "Servery Ready overdue",
          temporal: "Late",
          unitId: "unit-3a",
          unitName: "3A",
          locationLabel: "3A Servery",
          sourceHref: "/unit/unit-3a?space=s3a#milestones",
          availableActions: ["Open SPACE milestones"],
        },
        {
          status: "Key Time overdue",
          temporal: "Late",
          unitId: "unit-4a",
          unitName: "4A",
          locationLabel: "4A Servery",
          sourceHref: "/unit/unit-4a?space=s4a#milestones",
          availableActions: ["Open SPACE milestones"],
        },
      ],
      evidence: [
        {
          kind: "current",
          status: "Food Temperature overdue",
          temporal: "Late",
          unitId: "unit-3b",
          unitName: "3B",
          locationLabel: "3B Servery",
          spaceId: "s3b",
          sourceHref: "/unit/unit-3b?space=s3b#evidence",
          availableActions: ["Open SPACE evidence"],
          requirementKey: "food_temp",
          recordId: null,
        },
      ],
      assets: [
        {
          status: "Walk-in cooler — unavailable",
          temporal: "Late",
          unitId: "unit-kitchen",
          unitName: "Main Kitchen",
          locationLabel: "Main Kitchen",
          sourceHref: "/unit/unit-kitchen?space=kitchen#assets",
          availableActions: ["Open asset"],
        },
      ],
      work: [
        {
          status: "Dining Room cleaning — past due not confirmed",
          temporal: "NotConfirmed",
          unitId: "unit-3a",
          unitName: "3A",
          locationLabel: "3A Dining",
          sourceHref: "/staffing/operations?work=wp-1&unit=unit-3a",
          availableActions: ["Open Work"],
        },
      ],
      sync: [],
      configuration: [],
    },
    historicalAttention: [
      {
        kind: "historical",
        status: "Needs review — Cooler Temperature",
        temporal: "Current",
        unitId: "unit-3b",
        unitName: "3B",
        locationLabel: "3B Servery",
        spaceId: "s3b",
        sourceHref: "/staffing/log-book/rec-1",
        availableActions: ["Open evidence record"],
        requirementKey: "cooler_temp",
        recordId: "rec-1",
      },
    ],
    people: {
      callOffsAffectingAssignment: [{ id: "jane", name: "Jane Smith", hasCallOff: true }],
    },
    sync: { retryRequired: 0, pendingConflicts: 0, items: [], unscopableExcluded: false },
    overlay: { dietary: null, evs: null, plant: null },
    units: [],
    ...partial,
  };
}

test("dietary active board keeps compact operation and assignment/coverage distinction", () => {
  const presented = presentSupervisorOperationsBoardUi(view());
  assert.deepEqual(BOARD_SECTION_ORDER, [
    "current_operation",
    "assignment_coverage",
    "needs_attention",
    "people",
    "offline_sync",
    "department_overlay",
  ]);
  assert.equal(presented.currentOperation.label, "Breakfast · Active");
  assert.equal(presented.currentOperation.planStatus, "Confirmed plan");
  assert.equal(presented.assignmentCoverage.scheduledCount, 14);
  assert.equal(presented.assignmentCoverage.callOffCount, 1);
  assert.equal(presented.assignmentCoverage.scheduledHref, "/staffing");
  assert.deepEqual(
    presented.assignmentCoverage.chips.map((chip) => chip.label),
    ["Assigned", "Covered", "At Risk", "Uncovered"],
  );
  assert.equal(presented.assignmentCoverage.chips.find((chip) => chip.label === "Assigned")?.value, 12);
  assert.equal(presented.assignmentCoverage.chips.some((chip) => chip.label === "Unassigned"), false);
  assert.equal(presented.assignmentCoverage.assignmentUnavailable, false);
  assert.equal(presented.assignmentCoverage.quietCoverage, false);
  assert.equal(presented.locationsHref, "/units");
});

test("mixed operation uses the composer label and does not pick a cycle", () => {
  const presented = presentSupervisorOperationsBoardUi(
    view({
      operation: {
        kind: "mixed",
        label: SUPERVISOR_MIXED_OPERATION_LABEL,
        currentLabel: SUPERVISOR_MIXED_OPERATION_LABEL,
        nextLabel: null,
        activeLabels: ["Breakfast", "Production"],
      },
    }),
  );
  assert.equal(presented.currentOperation.label, "Multiple operations active");
});

test("quiet board hides empty exception groups and does not invent health chips", () => {
  const presented = presentSupervisorOperationsBoardUi(
    view({
      coverage: {
        availability: "available",
        engine: "dietary",
        covered: 8,
        atRisk: 0,
        uncovered: 0,
        gaps: [],
      },
      needsAttention: {
        people: [],
        coverage: [],
        milestones: [],
        evidence: [],
        assets: [],
        work: [],
        sync: [],
        configuration: [],
      },
      historicalAttention: [],
      people: { callOffsAffectingAssignment: [] },
    }),
  );
  assert.equal(presented.assignmentCoverage.quietCoverage, true);
  assert.deepEqual(
    presented.assignmentCoverage.chips.map((chip) => chip.label),
    ["Assigned", "Covered"],
  );
  assert.equal(presented.needsAttention.quiet, true);
  assert.deepEqual(presented.needsAttention.sections, []);
  assert.equal(presented.people.show, false);
  assert.equal(presented.sync.show, false);
});

test("OA unavailable shows explicit banners and no evaluated zero chips", () => {
  const presented = presentSupervisorOperationsBoardUi(
    view({
      plan: { status: null },
      assignments: {
        availability: "unavailable",
        assignedCount: 0,
        assignments: [],
        callOffAffectsAssignment: [],
      },
      coverage: {
        availability: "unavailable",
        engine: "none",
        covered: 0,
        atRisk: 0,
        uncovered: 0,
        gaps: [],
      },
      needsAttention: {
        people: [
          {
            status: SUPERVISOR_ASSIGNMENT_UNAVAILABLE,
            temporal: "NotConfirmed",
            sourceHref: "/staffing/assignments?departmentId=dept-1",
            availableActions: ["Open Assignment Board"],
          },
        ],
        coverage: [
          {
            status: SUPERVISOR_COVERAGE_UNAVAILABLE,
            temporal: "NotConfirmed",
            sourceHref: "/staffing/assignments?departmentId=dept-1",
            availableActions: ["Open Assignment Board"],
          },
        ],
        milestones: [],
        evidence: [],
        assets: [],
        work: [],
        sync: [],
        configuration: [],
      },
      historicalAttention: [],
      people: { callOffsAffectingAssignment: [] },
    }),
  );
  assert.equal(presented.assignmentCoverage.assignmentUnavailable, true);
  assert.equal(presented.assignmentCoverage.coverageUnavailable, true);
  assert.deepEqual(presented.assignmentCoverage.chips, []);
  assert.equal(presented.assignmentCoverage.scheduledCount, 14);
  assert.equal(presented.needsAttention.quiet, true);
  assert.equal(presented.people.show, false);
});

test("Needs Attention groups coverage, evidence, milestones, timing, work, and assets", () => {
  const presented = presentSupervisorOperationsBoardUi(view());
  const names = presented.needsAttention.sections.map((section) => section.category);
  assert.deepEqual(names, [
    "Coverage",
    "Evidence",
    "Service Milestones",
    "Service Timing",
    "Work",
    "Equipment / Asset Impact",
  ]);
  const coverage = presented.needsAttention.sections.find((section) => section.category === "Coverage");
  assert.equal(coverage?.items[0]?.title, "3A Servery");
  assert.match(coverage?.items[0]?.detail ?? "", /SERVER uncovered/);
  assert.match(coverage?.items[0]?.href ?? "", /\/staffing\/assignments/);

  const evidence = presented.needsAttention.sections.find((section) => section.category === "Evidence");
  assert.equal(evidence?.items.some((item) => item.kind === "current" && item.detail.includes("Food Temperature overdue")), true);
  assert.equal(
    evidence?.items.some(
      (item) => item.kind === "historical" && item.detail.includes("Needs review — Cooler Temperature"),
    ),
    true,
  );

  const milestones = presented.needsAttention.sections.find(
    (section) => section.category === "Service Milestones",
  );
  assert.match(milestones?.items[0]?.detail ?? "", /Servery Ready overdue/);
  assert.equal(names.some((name) => String(name) === "Readiness"), false);

  const timing = presented.needsAttention.sections.find((section) => section.category === "Service Timing");
  assert.equal(timing?.items.some((item) => item.detail.includes("Meal Service Started late")), true);
  assert.equal(timing?.items.some((item) => item.detail.includes("Key Time overdue")), true);

  const work = presented.needsAttention.sections.find((section) => section.category === "Work");
  assert.match(work?.items[0]?.detail ?? "", /Dining Room cleaning/);
  assert.equal(work?.items[0]?.href.includes("work="), true);

  const assets = presented.needsAttention.sections.find(
    (section) => section.category === "Equipment / Asset Impact",
  );
  assert.equal(assets?.items[0]?.title, "Main Kitchen");
  assert.match(assets?.items[0]?.detail ?? "", /unavailable/);
});

test("call-off with OA shows coverage impact; call-off without OA stays presence", () => {
  const withOa = presentSupervisorOperationsBoardUi(view());
  assert.equal(withOa.people.show, true);
  assert.equal(withOa.people.rows[0]?.title, "Jane Smith called off");
  assert.equal(withOa.people.rows[0]?.detail, "Coverage impact: 4B Servery");

  const presenceOnly = presentSupervisorOperationsBoardUi(
    view({
      presence: {
        availability: "available",
        scheduledCount: 14,
        callOffCount: 1,
        scheduledEmployees: [{ id: "pat", name: "Pat D", hasCallOff: true }],
      },
      assignments: {
        availability: "available",
        assignedCount: 12,
        assignments: [],
        callOffAffectsAssignment: [],
      },
      needsAttention: {
        ...view().needsAttention,
        people: [],
      },
      people: { callOffsAffectingAssignment: [] },
    }),
  );
  assert.equal(presenceOnly.assignmentCoverage.callOffCount, 1);
  assert.equal(presenceOnly.people.show, false);
});

test("sync section appears only when intervention exists and documents shared-unit scope", () => {
  const quiet = presentSupervisorOperationsBoardUi(view());
  assert.equal(quiet.sync.show, false);
  assert.equal(quiet.sync.limitationNote, null);

  const conflicted = presentSupervisorOperationsBoardUi(
    view({
      needsAttention: {
        ...view().needsAttention,
        sync: [
          {
            status: "Conflict review required",
            temporal: "Current",
            unitId: "shared-unit",
            unitName: "Shared pantry",
            sourceHref: "/unit/shared-unit",
            availableActions: ["Resolve offline conflict"],
          },
        ],
      },
      sync: {
        retryRequired: 0,
        pendingConflicts: 1,
        items: [{ kind: "pending_conflict", unitId: "shared-unit", unitName: "Shared pantry" }],
        unscopableExcluded: false,
      },
    }),
  );
  assert.equal(conflicted.sync.show, true);
  assert.equal(conflicted.sync.rows[0]?.title, "Conflict review required");
  assert.equal(conflicted.sync.limitationNote, SHARED_UNIT_SYNC_LIMITATION);
});

test("EVS and Plant overlays pass through without Dietary relabeling", () => {
  const evs = presentSupervisorOperationsBoardUi(
    view({
      identity: {
        ...view().identity,
        departmentName: "EVS",
        departmentKey: "EVS",
      },
      coverage: {
        availability: "available",
        engine: "evs",
        covered: 4,
        atRisk: 0,
        uncovered: 2,
        gaps: [],
      },
      overlay: {
        dietary: null,
        evs: {
          locationCovered: 4,
          locationAtRisk: 0,
          locationUncovered: 2,
          locationOverlapping: 1,
          locationRequired: 6,
          visibleUnitIds: null,
          locationCoverage: { unassigned: [], overlapping: [] },
          filters: {
            floor: null,
            unit: null,
            zone: null,
            employee: null,
            floors: [],
            units: [],
            zones: [],
            employees: [],
          },
        },
        plant: null,
      },
    }),
  );
  assert.equal(evs.evs?.locationUncovered, 2);
  assert.equal(evs.currentOperation.departmentName, "EVS");

  const plant = presentSupervisorOperationsBoardUi(
    view({
      overlay: {
        dietary: null,
        evs: null,
        plant: {
          newRequests: 2,
          untriaged: 1,
          urgent: 1,
          outOfServiceAssets: 0,
          openWorkOrders: 3,
          inProgressWorkOrders: 0,
          waitingVendor: 0,
          waitingParts: 0,
          overdueWorkOrders: 0,
          unassignedWorkOrders: 0,
          requests: [],
          workOrders: [],
          requestingDepartments: [],
          technicians: [],
        },
      },
    }),
  );
  assert.equal(plant.plant?.urgent, 1);
  assert.equal(plant.plant?.openWorkOrders, 3);
});

test("no-active operation and no plan status stay compact", () => {
  const presented = presentSupervisorOperationsBoardUi(
    view({
      operation: {
        kind: "none",
        label: SUPERVISOR_NO_ACTIVE_OPERATION_LABEL,
        currentLabel: null,
        nextLabel: "Lunch",
        activeLabels: [],
      },
      plan: { status: "DRAFT" },
    }),
  );
  assert.equal(presented.currentOperation.label, "No active operation");
  assert.equal(presented.currentOperation.planStatus, "Draft plan");
});

test("Board presentation source scan: ViewModel only, legacy chips removed, access unchanged", () => {
  const root = process.cwd();
  const page = readFileSync(join(root, "src/app/(protected)/staffing/operations/page.tsx"), "utf8");
  const boardView = readFileSync(
    join(root, "src/components/supervisor-operations/supervisor-operations-board-view.tsx"),
    "utf8",
  );
  const presentUi = readFileSync(
    join(root, "src/lib/dietary-job-flow/supervisor-operations/present-ui.ts"),
    "utf8",
  );
  const files = [page, boardView, presentUi].join("\n");

  assert.match(page, /loadSupervisorOperationsViewModel/);
  assert.match(page, /SupervisorOperationsBoardView/);
  assert.match(page, /authMethod === "QUICK_PIN"/);
  assert.match(page, /hasAtLeastRole\(session\.role, "SUPERVISOR"\)/);
  assert.match(page, /isAnyStaffingOperationalFeatureEnabled\("jobFlow"\)/);
  assert.match(page, /prisma\./);
  assert.equal(boardView.includes("prisma"), false);
  assert.equal(presentUi.includes("prisma"), false);

  assert.match(boardView, /presentSupervisorOperationsBoardUi/);
  assert.match(boardView, /Assignment & Coverage/);
  assert.match(boardView, /Needs Attention/);
  assert.match(boardView, /View locations/);
  assert.match(files, /Service Milestones/);
  assert.equal(files.includes("Unassigned:"), false);
  assert.equal(files.includes("Ready confirmed"), false);
  assert.equal(files.includes("Started late"), false);
  assert.equal(files.includes("View all Units"), false);
  assert.equal(files.includes("GROUP_ORDER"), false);
  assert.equal(files.includes("Readiness"), false);
  assert.equal(files.includes("health %"), false);
  assert.equal(files.includes("buildDietaryCoverageSummary"), false);
  assert.equal(files.includes("computeReadinessBatch"), false);
  assert.equal(files.includes("loadDashboardQueries"), false);
  assert.equal(files.includes("EmployeeRuntimeFlow"), false);
  assert.match(presentUi, /SHARED_UNIT_SYNC_LIMITATION/);
  assert.match(presentUi, /no departmentId/);
});
