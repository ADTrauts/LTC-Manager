/**
 * Phase 2C-2F — shadow comparison for plan-derived Work cutover.
 * Helper behavior remains hermetically certified; 2C-2G-2 wires it into compose.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { WorkRequirement } from "@/lib/department-work/types";

import { composeEmployeeRuntimeFlow } from "./compose";
import {
  composeJobFlowItems,
  isOneOffCompatibilityWork,
  isPlanDerivedCompatibilityWork,
  withoutPlanDerivedCompatibilityWork,
} from "./job-flow-item";
import { resolveEmployeeNextAction } from "./next-action";
import type { EmployeeRuntimeEvidenceItem, EmployeeRuntimeMilestone } from "./types";

function work(
  partial: Partial<WorkRequirement> & {
    occurrenceKey: string;
    label: string;
    state: WorkRequirement["state"];
    sourceKind: WorkRequirement["sourceKind"];
  },
): WorkRequirement {
  return {
    occurrenceKey: partial.occurrenceKey,
    workPlanId: partial.sourceKind === "ONE_OFF" ? "" : "wp",
    workPlanStableKey: partial.sourceKind === "ONE_OFF" ? "one_off" : "wp",
    workPlanVersion: partial.sourceKind === "ONE_OFF" ? 0 : 1,
    workPlanName: partial.sourceKind === "ONE_OFF" ? "One-off Work" : "Plan",
    workItemId: "item",
    workItemKey: "item",
    label: partial.label,
    instructions: null,
    priority: "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    dueAt: null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "unit-1",
    unitName: "Unit 1",
    spaceId: "space-1",
    assetId: null,
    roleKeys: [],
    knowledgeArticleId: null,
    procedureTitle: null,
    linkedTemplateStableKey: null,
    linkedTemplateId: null,
    state: partial.state,
    occurrenceId: partial.occurrenceId ?? null,
    occurrenceStatus: null,
    assignedEmployeeId: null,
    completedByLabel: null,
    completedAt: null,
    evidenceRecordId: null,
    sourceKind: partial.sourceKind,
    sourceHref:
      partial.sourceKind === "ONE_OFF"
        ? `/staffing/operations?work=${partial.occurrenceKey}`
        : "/staffing/work-plans",
  };
}

function assignment(id: string): JobFlowAssignmentSnapshot {
  return {
    id,
    roleKey: "SERVER",
    roleLabel: "Server",
    unitId: "unit-1",
    unitName: "Unit 1",
    startsAt: new Date("2026-11-08T12:00:00.000Z"),
    endsAt: new Date("2026-11-08T20:00:00.000Z"),
    status: "ACTIVE",
    scopeKind: "UNIT",
    sourceZoneName: null,
  };
}

test("shadow: plan-derived removed; one-off and canonical owners preserved", () => {
  const evidence: EmployeeRuntimeEvidenceItem = {
    attachmentId: "att-1",
    requirementKey: "req-1",
    displayName: "Cooler log",
    spaceId: "space-1",
    productState: "DUE",
    category: "due_now",
    window: { start: "07:00", end: "09:00" },
    recordId: null,
    href: "/logs",
    catalogStableKey: "cooler",
  };
  const milestone: EmployeeRuntimeMilestone = {
    spaceId: "space-1",
    spaceName: "Servery",
    kind: "KEY_TIME",
    label: "Breakfast",
    statusKey: "due",
    cycleStableKey: "breakfast",
    expectedLocal: "07:30",
  };

  const current = composeJobFlowItems({
    compatibilityWork: [
      work({ occurrenceKey: "plan-a", label: "Plan wipe", state: "DUE", sourceKind: "WORK_PLAN" }),
      work({
        occurrenceKey: "oo-a",
        occurrenceId: "db-oo-a",
        label: "One-off ask",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
    harborEvidence: [evidence],
    milestones: [milestone],
    workOrders: [
      {
        id: "wo-1",
        repairCode: "R-1",
        title: "Fix sink",
        status: "ASSIGNED",
        dueAt: null,
        unitId: "unit-1",
        spaceId: "space-1",
        assetId: null,
        pmOccurrenceId: null,
        workOrderKind: "CORRECTIVE",
      },
    ],
    assignmentExceptions: [
      {
        id: "call-off:1",
        kind: "CALL_OFF",
        label: "Called off",
        ownerState: "CALL_OFF",
        unitId: "unit-1",
        href: null,
      },
    ],
  });

  const proposed = withoutPlanDerivedCompatibilityWork(current);

  assert.equal(current.filter(isPlanDerivedCompatibilityWork).length, 1);
  assert.equal(proposed.filter(isPlanDerivedCompatibilityWork).length, 0);
  assert.equal(proposed.filter(isOneOffCompatibilityWork).length, 1);
  assert.equal(proposed.filter((row) => row.ownerKind === "RECORD_REQUIREMENT").length, 1);
  assert.equal(proposed.filter((row) => row.ownerKind === "OPERATING_RHYTHM_KEY_POINT").length, 1);
  assert.equal(proposed.filter((row) => row.ownerKind === "WORK_ORDER").length, 1);
  assert.equal(proposed.filter((row) => row.ownerKind === "ASSIGNMENT_EXCEPTION").length, 1);

  // Stable identities for retained rows
  assert.deepEqual(
    proposed
      .filter((row) => row.ownerKind !== "COMPATIBILITY_WORK" || row.compatibilitySource === "ONE_OFF")
      .map((row) => `${row.ownerKind}:${row.ownerId}`)
      .sort(),
    current
      .filter((row) => !isPlanDerivedCompatibilityWork(row))
      .map((row) => `${row.ownerKind}:${row.ownerId}`)
      .sort(),
  );
});

test("shadow next-action: drops plan-derived overdue without inventing overdue on remaining items", () => {
  const planOverdue = work({
    occurrenceKey: "plan-late",
    label: "Late plan task",
    state: "PAST_DUE_NOT_CONFIRMED",
    sourceKind: "WORK_PLAN",
  });
  const oneOffDue = work({
    occurrenceKey: "oo-due",
    occurrenceId: "db-oo",
    label: "One-off due",
    state: "DUE",
    sourceKind: "ONE_OFF",
  });
  const currentItems = composeJobFlowItems({
    compatibilityWork: [planOverdue, oneOffDue],
  });
  const proposedItems = withoutPlanDerivedCompatibilityWork(currentItems);

  const currentNext = resolveEmployeeNextAction({
    items: currentItems,
    work: [planOverdue, oneOffDue],
    evidence: [],
    milestones: [],
    currentAssignment: assignment("oa-1"),
    upcomingAssignment: null,
    locationNext: null,
  });
  const proposedNext = resolveEmployeeNextAction({
    items: proposedItems,
    work: [oneOffDue],
    evidence: [],
    milestones: [],
    currentAssignment: assignment("oa-1"),
    upcomingAssignment: null,
    locationNext: null,
  });

  assert.equal(currentNext.kind, "overdue_work");
  assert.equal(proposedNext.kind, "due_work");
  assert.equal(proposedNext.sourceId, "db-oo");
  assert.equal(proposedNext.label, "One-off due");
});

test("shadow empty config remains valid; live compose excludes plan-derived", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment("oa-1"),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({ occurrenceKey: "p1", label: "Plan", state: "DUE", sourceKind: "WORK_PLAN" }),
    ],
  });
  assert.equal(flow.items.filter(isPlanDerivedCompatibilityWork).length, 0);
  assert.equal(flow.work.filter((row) => row.sourceKind === "WORK_PLAN").length, 1);
  const emptyNext = resolveEmployeeNextAction({
    items: flow.items,
    work: [],
    evidence: [],
    milestones: [],
    currentAssignment: assignment("oa-1"),
    upcomingAssignment: null,
    locationNext: null,
  });
  assert.equal(emptyNext.kind, "none");
});

test("cutover is activated in compose only; loaders and present stay filter-free", () => {
  const root = process.cwd();
  const compose = readFileSync(join(root, "src/lib/employee-runtime-flow/compose.ts"), "utf8");
  const load = readFileSync(join(root, "src/lib/employee-runtime-flow/load-flow.ts"), "utf8");
  const present = readFileSync(join(root, "src/lib/employee-runtime-flow/present.ts"), "utf8");
  assert.equal(compose.includes("withoutPlanDerivedCompatibilityWork"), true);
  assert.equal(load.includes("withoutPlanDerivedCompatibilityWork"), false);
  assert.equal(present.includes("withoutPlanDerivedCompatibilityWork"), false);
});
