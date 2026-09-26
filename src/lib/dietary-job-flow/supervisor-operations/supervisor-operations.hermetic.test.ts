/**
 * Phase 6O — Supervisor Operations composition pipeline (pure).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { emptyLocationProgram } from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";

import {
  SUPERVISOR_ASSIGNMENT_UNAVAILABLE,
  SUPERVISOR_COVERAGE_UNAVAILABLE,
  SUPERVISOR_MIXED_OPERATION_LABEL,
  aggregateSupervisorOperation,
  composeSupervisorOperations,
} from "./compose";
import type { SupervisorOperationsFacts } from "./facts";
import { presentSupervisorOperationsBoard } from "./present";

function evidenceItem(
  partial: Partial<RuntimeLocationState["evidence"]["items"][number]> & {
    requirementKey: string;
    displayName: string;
    productState: RuntimeLocationState["evidence"]["items"][number]["productState"];
  },
): RuntimeLocationState["evidence"]["items"][number] {
  return {
    requirementKey: partial.requirementKey,
    attachmentId: partial.attachmentId ?? `att-${partial.requirementKey}`,
    catalogStableKey: partial.catalogStableKey ?? "food_temperature_log",
    displayName: partial.displayName,
    productState: partial.productState,
    cycleStableKey: "breakfast",
    window: { start: "08:00", end: "09:00" },
    recordId: partial.recordId ?? null,
    href: partial.href ?? null,
    needsSupervisorReview: partial.needsSupervisorReview ?? false,
  };
}

function state(partial: {
  spaceId: string;
  name?: string;
  unitId?: string;
  operationLabel?: string;
  operationKey?: string;
  operationState?: "ACTIVE" | "NONE";
  upcomingLabel?: string;
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
  milestones?: RuntimeLocationState["milestones"]["items"];
  issues?: RuntimeLocationState["assets"]["issuesAffectingOperation"];
}): RuntimeLocationState {
  const items = partial.evidenceItems ?? [];
  return withRuntimeLocationAnswers({
    identity: {
      location: {
        kind: "SPACE",
        spaceId: partial.spaceId,
        unitId: partial.unitId ?? "unit-a",
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
      state: partial.operationState ?? (partial.operationLabel ? "ACTIVE" : "NONE"),
      current: partial.operationLabel
        ? {
            cycleStableKey: partial.operationKey ?? partial.operationLabel.toLowerCase(),
            cycleVersion: 1,
            label: partial.operationLabel,
            hierarchyLabel: partial.operationLabel,
            window: { start: "08:00", end: "09:00" },
            timing: {
              configured: "08:00",
              adjusted: null,
              expectedToday: "08:00",
              actual: null,
              recordedAt: null,
            },
          }
        : null,
      upcoming: partial.upcomingLabel
        ? {
            cycleStableKey: "lunch",
            label: partial.upcomingLabel,
            startsAt: "2026-08-17T15:00:00.000Z",
            minutesUntil: 40,
          }
        : null,
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: { availability: "evaluated", planLifecycle: "RUNTIME_VISIBLE", slots: [] },
    evidence: {
      requiredToday: items.length,
      dueNow: [],
      upcoming: [],
      completed: [],
      overdue: items.filter((row) => row.productState === "OVERDUE").map((row) => row.requirementKey),
      needsReview: items.filter((row) => row.needsSupervisorReview).map((row) => row.requirementKey),
      correctiveOpen: [],
      items,
    },
    assets: {
      assets: [],
      openIssues: [],
      issuesAffectingOperation: partial.issues ?? [],
    },
    milestones: { items: partial.milestones ?? [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: [],
    next: null,
    asOf: {
      now: new Date("2026-08-17T11:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  });
}

function facts(partial: Partial<SupervisorOperationsFacts> = {}): SupervisorOperationsFacts {
  return {
    now: new Date("2026-08-17T11:00:00.000Z"),
    timezone: "America/New_York",
    operationalDateKey: "2026-08-17",
    oaEnabled: true,
    harborLogsEnabled: true,
    facility: { id: "fac-1", displayName: "Harbor" },
    department: { id: "dept-1", name: "Dietary", key: "DIETARY" },
    states: [],
    planStatus: "CONFIRMED",
    presenceEmployees: [],
    assignments: [],
    coverageCounts: { covered: 0, atRisk: 0, uncovered: 0 },
    coverageGaps: [],
    historicalRecords: [],
    workExceptions: [],
    sync: { retryRequired: 0, pendingConflicts: 0, items: [], unscopableExcluded: false },
    evsOverlay: null,
    plantOverlay: null,
    ...partial,
  };
}

test("sparse / empty board is quiet", () => {
  const view = composeSupervisorOperations(facts());
  assert.equal(view.operation.kind, "none");
  assert.equal(view.presence.scheduledCount, 0);
  assert.equal(view.assignments.assignedCount, 0);
  assert.deepEqual(view.needsAttention.people, []);
  assert.deepEqual(view.needsAttention.coverage, []);
  assert.deepEqual(view.needsAttention.evidence, []);
});

test("shared active operation becomes Breakfast · Active", () => {
  const view = composeSupervisorOperations(
    facts({
      states: [
        state({ spaceId: "s1", operationLabel: "Breakfast", operationKey: "breakfast" }),
        state({ spaceId: "s2", operationLabel: "Breakfast", operationKey: "breakfast" }),
      ],
    }),
  );
  assert.equal(view.operation.kind, "shared");
  assert.equal(view.operation.currentLabel, "Breakfast · Active");
});

test("mixed operations do not pick an arbitrary Breakfast header", () => {
  const aggregated = aggregateSupervisorOperation([
    state({ spaceId: "s1", operationLabel: "Breakfast", operationKey: "breakfast" }),
    state({ spaceId: "s2", operationLabel: "Production", operationKey: "production" }),
    state({ spaceId: "s3", operationLabel: "Cleaning", operationKey: "cleaning" }),
  ]);
  assert.equal(aggregated.kind, "mixed");
  assert.equal(aggregated.currentLabel, SUPERVISOR_MIXED_OPERATION_LABEL);
  assert.equal(aggregated.nextLabel, null);
});

test("no active operation stays none", () => {
  const view = composeSupervisorOperations(
    facts({ states: [state({ spaceId: "s1", operationState: "NONE" })] }),
  );
  assert.equal(view.operation.kind, "none");
  assert.equal(view.operation.currentLabel, null);
});

test("scheduled without OA is presence, not an Unassigned exception", () => {
  const view = composeSupervisorOperations(
    facts({
      presenceEmployees: [
        { id: "mary", firstName: "Mary", lastName: "A", hasCallOff: false },
        { id: "john", firstName: "John", lastName: "B", hasCallOff: false },
        { id: "sarah", firstName: "Sarah", lastName: "C", hasCallOff: false },
      ],
      assignments: [
        {
          id: "oa-1",
          employeeId: "mary",
          employeeName: "Mary A",
          unitId: "unit-a",
          unitName: "3A",
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "ACTIVE",
        },
        {
          id: "oa-2",
          employeeId: "john",
          employeeName: "John B",
          unitId: "unit-a",
          unitName: "3A",
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "ACTIVE",
        },
      ],
    }),
  );
  assert.equal(view.presence.scheduledCount, 3);
  assert.equal(view.assignments.assignedCount, 2);
  assert.equal(
    view.needsAttention.people.some((row) => row.status.toLowerCase().includes("unassigned")),
    false,
  );
  const board = presentSupervisorOperationsBoard(view);
  assert.equal(board.summary.scheduled, 3);
  assert.equal(board.summary.assigned, 2);
  assert.equal(board.summary.unassigned, 0);
  assert.equal(
    board.exceptions.some((row) => row.status === "Unassigned"),
    false,
  );
});

test("OA without ScheduleEntry still counts as assigned", () => {
  const view = composeSupervisorOperations(
    facts({
      presenceEmployees: [],
      assignments: [
        {
          id: "oa-1",
          employeeId: "pat",
          employeeName: "Pat D",
          unitId: "unit-a",
          unitName: "3A",
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "ACTIVE",
        },
      ],
    }),
  );
  assert.equal(view.presence.scheduledCount, 0);
  assert.equal(view.assignments.assignedCount, 1);
});

test("call-off is people attention only when it affects an OA", () => {
  const view = composeSupervisorOperations(
    facts({
      presenceEmployees: [
        { id: "mary", firstName: "Mary", lastName: "A", hasCallOff: true },
        { id: "lee", firstName: "Lee", lastName: "E", hasCallOff: true },
      ],
      assignments: [
        {
          id: "oa-1",
          employeeId: "mary",
          employeeName: "Mary A",
          unitId: "unit-a",
          unitName: "3A",
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "ACTIVE",
        },
      ],
    }),
  );
  assert.equal(view.presence.callOffCount, 2);
  assert.deepEqual(
    view.needsAttention.people.map((row) => row.employeeId),
    ["mary"],
  );
});

test("OA unavailable: presence remains, assignment and coverage are unavailable", () => {
  const view = composeSupervisorOperations(
    facts({
      oaEnabled: false,
      presenceEmployees: [
        { id: "mary", firstName: "Mary", lastName: "A", hasCallOff: false },
        { id: "john", firstName: "John", lastName: "B", hasCallOff: false },
      ],
      assignments: [
        {
          id: "oa-1",
          employeeId: "mary",
          employeeName: "Mary A",
          unitId: "unit-a",
          unitName: "3A",
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "ACTIVE",
        },
      ],
      coverageCounts: { covered: 9, atRisk: 0, uncovered: 0 },
      coverageGaps: [
        {
          unitId: "unit-a",
          unitName: "3A",
          locationLabel: null,
          roleKey: "SERVER",
          roleLabel: "Server",
          state: "UNCOVERED",
          requiredCount: 2,
          filledCount: 1,
        },
      ],
    }),
  );
  assert.equal(view.presence.availability, "available");
  assert.equal(view.presence.scheduledCount, 2);
  assert.equal(view.assignments.availability, "unavailable");
  assert.equal(view.assignments.assignedCount, 0);
  assert.equal(view.coverage.availability, "unavailable");
  assert.equal(view.coverage.covered, 0);
  assert.equal(view.plan.status, null);
  assert.equal(view.needsAttention.people[0]?.status, SUPERVISOR_ASSIGNMENT_UNAVAILABLE);
  assert.equal(view.needsAttention.coverage[0]?.status, SUPERVISOR_COVERAGE_UNAVAILABLE);
});

test("coverage at-risk does not become covered because many people are scheduled", () => {
  const view = composeSupervisorOperations(
    facts({
      presenceEmployees: [
        { id: "1", firstName: "A", lastName: "1", hasCallOff: false },
        { id: "2", firstName: "A", lastName: "2", hasCallOff: false },
        { id: "3", firstName: "A", lastName: "3", hasCallOff: false },
        { id: "4", firstName: "A", lastName: "4", hasCallOff: false },
        { id: "5", firstName: "A", lastName: "5", hasCallOff: false },
      ],
      assignments: [
        {
          id: "oa-1",
          employeeId: "1",
          employeeName: "A 1",
          unitId: "unit-a",
          unitName: "3A",
          roleKey: "SERVER",
          roleLabel: "Server",
          status: "ACTIVE",
        },
      ],
      coverageCounts: { covered: 0, atRisk: 1, uncovered: 0 },
      coverageGaps: [
        {
          unitId: "unit-a",
          unitName: "3A",
          locationLabel: null,
          roleKey: "SERVER",
          roleLabel: "Server",
          state: "AT_RISK",
          requiredCount: 2,
          filledCount: 1,
        },
      ],
    }),
  );
  assert.equal(view.coverage.atRisk, 1);
  assert.equal(view.coverage.covered, 0);
  assert.equal(view.needsAttention.coverage[0]?.status, "Server at risk");
});

test("Harbor current overdue and historical template review coexist", () => {
  const view = composeSupervisorOperations(
    facts({
      states: [
        state({
          spaceId: "servery-a",
          name: "3A Servery",
          evidenceItems: [
            evidenceItem({
              requirementKey: "H-food",
              displayName: "Food Temperature",
              productState: "OVERDUE",
            }),
          ],
        }),
      ],
      historicalRecords: [
        {
          id: "tpl-review",
          unitId: "unit-a",
          spaceId: null,
          templateName: "Cooler Temperature Log",
          status: "NEEDS_REVIEW",
          outOfStandard: false,
          correctiveActionText: null,
          logAttachmentId: null,
          logRequirementKey: null,
          requirementKey: "tmpl_123",
        },
      ],
    }),
  );
  assert.equal(view.needsAttention.evidence[0]?.status, "Food Temperature overdue");
  assert.equal(view.historicalAttention[0]?.status, "Needs review — Cooler Temperature Log");
  assert.equal(view.historicalAttention[0]?.sourceHref, "/staffing/log-book/tpl-review");
});

test("Harbor off does not invent current dues from RLS", () => {
  const view = composeSupervisorOperations(
    facts({
      harborLogsEnabled: false,
      states: [
        state({
          spaceId: "servery-a",
          evidenceItems: [
            evidenceItem({
              requirementKey: "H-food",
              displayName: "Food Temperature",
              productState: "OVERDUE",
            }),
          ],
        }),
      ],
    }),
  );
  assert.deepEqual(view.needsAttention.evidence, []);
});

test("servery ready not recorded is a milestone exception, not computed readiness", () => {
  const view = composeSupervisorOperations(
    facts({
      states: [
        state({
          spaceId: "servery-a",
          name: "3A Servery",
          milestones: [
            {
              kind: "SERVERY_READY",
              label: "Servery Ready",
              cycleStableKey: "breakfast",
              timing: {
                configured: "08:00",
                adjusted: null,
                expectedToday: "08:00",
                actual: null,
                recordedAt: null,
              },
              statusKey: "not_recorded",
              canonical: true,
            },
          ],
        }),
      ],
    }),
  );
  assert.equal(view.needsAttention.milestones[0]?.status, "Servery Ready not recorded");
  const board = presentSupervisorOperationsBoard(view);
  assert.equal(board.exceptions[0]?.group, "Readiness");
});

test("late Key Time is service timing", () => {
  const view = composeSupervisorOperations(
    facts({
      states: [
        state({
          spaceId: "servery-a",
          milestones: [
            {
              kind: "KEY_TIME",
              label: "Trayline start",
              cycleStableKey: "breakfast",
              timing: {
                configured: "07:30",
                adjusted: null,
                expectedToday: "07:30",
                actual: null,
                recordedAt: null,
              },
              statusKey: "overdue",
              canonical: true,
            },
          ],
        }),
      ],
    }),
  );
  const board = presentSupervisorOperationsBoard(view);
  assert.equal(board.exceptions[0]?.group, "ServiceTiming");
  assert.match(board.exceptions[0]?.status ?? "", /Trayline start overdue/);
});

test("only operational-impact assets become generic exceptions", () => {
  const view = composeSupervisorOperations(
    facts({
      states: [
        state({
          spaceId: "kitchen",
          name: "Main Kitchen",
          issues: [
            {
              issueId: "iss-1",
              assetId: "fridge",
              impact: "EQUIPMENT_UNAVAILABLE",
              summary: "Walk-in refrigerator",
              href: "/assets/fridge",
            },
          ],
        }),
      ],
      plantOverlay: {
        newRequests: 0,
        untriaged: 0,
        urgent: 0,
        outOfServiceAssets: 0,
        openWorkOrders: 1,
        inProgressWorkOrders: 0,
        waitingVendor: 0,
        waitingParts: 0,
        overdueWorkOrders: 0,
        unassignedWorkOrders: 0,
        requests: [],
        workOrders: [
          {
            id: "wo-ordinary",
            repairCode: "R-1",
            title: "Tighten hinge",
            status: "OPEN",
            priority: "LOW",
            assignedEmployeeName: null,
            unitName: "Main Kitchen",
            dueAt: null,
            overdue: false,
          },
        ],
        requestingDepartments: [],
        technicians: [],
      },
    }),
  );
  assert.equal(view.needsAttention.assets.length, 1);
  assert.match(view.needsAttention.assets[0]?.status ?? "", /Walk-in refrigerator/);
  assert.equal(view.overlay.plant?.openWorkOrders, 1);
});

test("work exception stays work, not evidence", () => {
  const view = composeSupervisorOperations(
    facts({
      workExceptions: [
        {
          occurrenceKey: "wp-1",
          label: "Hood filter",
          unitId: "unit-a",
          unitName: "3A",
          state: "PAST_DUE_NOT_CONFIRMED",
          assignedEmployeeId: "mary",
        },
      ],
    }),
  );
  assert.match(view.needsAttention.work[0]?.status ?? "", /past due/);
  assert.deepEqual(view.needsAttention.evidence, []);
});

test("sync items stay outside RLS and keep department-scoped facts", () => {
  const view = composeSupervisorOperations(
    facts({
      sync: {
        retryRequired: 0,
        pendingConflicts: 1,
        items: [
          { kind: "pending_conflict", unitId: "dietary-unit", unitName: "3A" },
        ],
        unscopableExcluded: false,
      },
    }),
  );
  assert.equal(view.sync.pendingConflicts, 1);
  assert.equal(view.needsAttention.sync[0]?.unitId, "dietary-unit");
});

test("EVS overlay uses location coverage engine, not Dietary gaps", () => {
  const view = composeSupervisorOperations(
    facts({
      department: { id: "evs-1", name: "EVS", key: "EVS" },
      coverageCounts: { covered: 4, atRisk: 0, uncovered: 2 },
      evsOverlay: {
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
    }),
  );
  assert.equal(view.coverage.engine, "evs");
  assert.equal(view.overlay.evs?.locationUncovered, 2);
});

test("pipeline source scan: one RLS batch, OA flag, no readiness/dashboard/cycle engines", () => {
  const root = process.cwd();
  const files = [
    "src/lib/dietary-job-flow/load-supervisor-operations-board.ts",
    "src/lib/dietary-job-flow/supervisor-operations/load-facts.ts",
    "src/lib/dietary-job-flow/supervisor-operations/compose.ts",
    "src/lib/dietary-job-flow/supervisor-operations/present.ts",
  ]
    .map((rel) => readFileSync(join(root, rel), "utf8"))
    .join("\n");
  assert.match(files, /isOperationalAssignmentsEnabled/);
  assert.match(files, /isCanonicalLogsEnabled/);
  assert.match(files, /loadRuntimeLocationStates/);
  assert.match(files, /presentSupervisorEvidenceAttention/);
  assert.match(files, /buildDietaryCoverageSummary/);
  assert.match(files, /buildLocationCoverageSummary/);
  assert.match(files, /loadSupervisorWorkExceptions/);
  assert.equal(files.includes("resolveOperationalCycle"), false);
  assert.equal(files.includes("loadSupervisorCycleOverview"), false);
  assert.equal(files.includes("computeReadinessBatch"), false);
  assert.equal(files.includes("loadDashboardQueries"), false);
  assert.equal(files.includes("loadSupervisorAssetExceptions"), false);
  assert.equal(files.includes('status: "Unassigned"'), false);
  assert.match(files, /unitId: \{ in: departmentUnitIds \}/);
});
