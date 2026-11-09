/**
 * Phase 2C-2G-2 — activated employee Job Flow plan-derived Work cutover.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { WorkRequirement } from "@/lib/department-work/types";

import { composeEmployeeRuntimeFlow } from "./compose";
import {
  isOneOffCompatibilityWork,
  isPlanDerivedCompatibilityWork,
} from "./job-flow-item";
import { presentEmployeeRuntimeExperience } from "./present";
import {
  serializeEmployeeRuntimeJobFlowItemContext,
  serializeEmployeeRuntimeWorkContext,
} from "./serialize-offline";
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
    workPlanId: partial.sourceKind === "ONE_OFF" ? "" : "wp-published",
    workPlanStableKey: partial.sourceKind === "ONE_OFF" ? "one_off" : "published_plan",
    workPlanVersion: partial.sourceKind === "ONE_OFF" ? 0 : 3,
    workPlanName: partial.sourceKind === "ONE_OFF" ? "One-off Work" : "Published Plan",
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

function composeWithPublishedPlanFixture() {
  return composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment("oa-1"),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [{ spaceId: "space-1", departmentId: "dept-1", unitId: "unit-1", displayName: "Servery" }],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({
        occurrenceKey: "plan-due",
        label: "Plan wipe",
        state: "DUE",
        sourceKind: "WORK_PLAN",
      }),
      work({
        occurrenceKey: "plan-overdue",
        label: "Plan overdue",
        state: "PAST_DUE_NOT_CONFIRMED",
        sourceKind: "WORK_PLAN",
      }),
      work({
        occurrenceKey: "oo-due",
        occurrenceId: "db-oo-due",
        label: "One-off ask",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
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
}

test("activated cutover: WORK_PLAN items excluded; ONE_OFF and parallel flow.work retained", () => {
  const flow = composeWithPublishedPlanFixture();
  assert.equal(flow.items.filter(isPlanDerivedCompatibilityWork).length, 0);
  assert.equal(flow.items.filter(isOneOffCompatibilityWork).length, 1);
  assert.equal(flow.work.filter((row) => row.sourceKind === "WORK_PLAN").length, 2);
  assert.equal(flow.work.filter((row) => row.sourceKind === "ONE_OFF").length, 1);
  assert.equal(flow.items.filter((row) => row.ownerKind === "WORK_ORDER").length, 1);
  assert.equal(flow.items.filter((row) => row.ownerKind === "ASSIGNMENT_EXCEPTION").length, 1);
  assert.equal(flow.items.find(isOneOffCompatibilityWork)?.ownerId, "db-oo-due");
});

test("employee presentation and next-action ignore plan-derived; one-off remains actionable", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment("oa-1"),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [{ spaceId: "space-1", departmentId: "dept-1", unitId: "unit-1", displayName: "Servery" }],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({
        occurrenceKey: "plan-overdue",
        label: "Plan overdue",
        state: "PAST_DUE_NOT_CONFIRMED",
        sourceKind: "WORK_PLAN",
      }),
      work({
        occurrenceKey: "oo-due",
        occurrenceId: "db-oo-due",
        label: "One-off ask",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
  });

  assert.equal(flow.next.kind, "due_work");
  assert.equal(flow.next.sourceId, "db-oo-due");
  assert.equal(flow.next.label, "One-off ask");

  const view = presentEmployeeRuntimeExperience({
    flow,
    grain: "neighborhood",
    landingUnitId: "unit-1",
    timezone: "America/New_York",
  });
  assert.equal(view.work.length, 1);
  assert.equal(view.work[0]?.label, "One-off ask");
  assert.equal(
    view.work.some((row) => row.label === "Plan overdue"),
    false,
  );
});

test("empty plan-only configuration stays valid; no invented overdue", () => {
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
      work({
        occurrenceKey: "plan-overdue",
        label: "Plan overdue",
        state: "PAST_DUE_NOT_CONFIRMED",
        sourceKind: "WORK_PLAN",
      }),
    ],
  });
  assert.equal(flow.items.length, 0);
  assert.equal(flow.next.kind, "none");
});

test("offline item snapshot and workContext both omit plan-derived advertising", () => {
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
      work({ occurrenceKey: "plan-a", label: "Plan", state: "DUE", sourceKind: "WORK_PLAN" }),
      work({
        occurrenceKey: "oo-a",
        occurrenceId: "db-oo-a",
        label: "One-off",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
  });

  const itemsCtx = serializeEmployeeRuntimeJobFlowItemContext(flow, {
    lastSyncedAt: "2026-11-08T12:00:00.000Z",
    snapshotOperationalDate: "2026-11-08",
  });
  assert.ok(itemsCtx);
  assert.equal(itemsCtx.items.filter((row) => row.compatibilitySource === "WORK_PLAN").length, 0);
  assert.equal(itemsCtx.items.filter((row) => row.compatibilitySource === "ONE_OFF").length, 1);
  assert.equal(
    itemsCtx.items.find((row) => row.compatibilitySource === "ONE_OFF")?.offlineAction,
    "COMPLETE_OPERATIONAL_TASK",
  );

  // flow.work stays unfiltered; presentation workContext is ONE_OFF-only (2C-2H-2).
  assert.equal(flow.work.some((row) => row.occurrenceKey === "plan-a"), true);
  const workCtx = serializeEmployeeRuntimeWorkContext(flow, "2026-11-08T12:00:00.000Z");
  assert.ok(workCtx);
  assert.equal(workCtx.requirements.some((row) => row.occurrenceKey === "plan-a"), false);
  assert.equal(workCtx.requirements.some((row) => row.occurrenceKey === "oo-a"), true);
});

test("resolveUnitWorkRequirements and Dashboard readers are not rewritten by this cutover", () => {
  const root = process.cwd();
  const compose = readFileSync(join(root, "src/lib/employee-runtime-flow/compose.ts"), "utf8");
  assert.match(compose, /withoutPlanDerivedCompatibilityWork/);
  assert.equal(compose.includes("resolveUnitWorkRequirements"), false);
  const load = readFileSync(join(root, "src/lib/employee-runtime-flow/load-flow.ts"), "utf8");
  assert.equal(load.includes("withoutPlanDerivedCompatibilityWork"), false);
});
