/**
 * Phase 2C-2E — plan-derived vs one-off CompatWork separation.
 * Live item cutover is activated in 2C-2G-2; this suite still certifies sourceKind.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { WorkRequirement } from "@/lib/department-work/types";

import { composeEmployeeRuntimeFlow } from "./compose";
import {
  composeJobFlowItems,
  isOneOffCompatibilityWork,
  isPlanDerivedCompatibilityWork,
  jobFlowItemFromCompatibilityWork,
} from "./job-flow-item";
import { serializeEmployeeRuntimeJobFlowItemContext } from "./serialize-offline";
import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";

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
    workPlanId: partial.workPlanId ?? (partial.sourceKind === "ONE_OFF" ? "" : "wp"),
    workPlanStableKey: partial.workPlanStableKey ?? (partial.sourceKind === "ONE_OFF" ? "one_off" : "wp"),
    workPlanVersion: partial.workPlanVersion ?? (partial.sourceKind === "ONE_OFF" ? 0 : 1),
    workPlanName: partial.workPlanName ?? (partial.sourceKind === "ONE_OFF" ? "One-off Work" : "Plan"),
    workItemId: partial.workItemId ?? "item",
    workItemKey: partial.workItemKey ?? "item",
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

test("source discriminator is stable and cannot confuse occurrence types", () => {
  const plan = jobFlowItemFromCompatibilityWork(
    work({
      occurrenceKey: "same-label",
      occurrenceId: "occ-plan",
      label: "Same label",
      state: "DUE",
      sourceKind: "WORK_PLAN",
    }),
  );
  const oneOff = jobFlowItemFromCompatibilityWork(
    work({
      occurrenceKey: "same-label-oo",
      occurrenceId: "occ-oo",
      label: "Same label",
      state: "DUE",
      sourceKind: "ONE_OFF",
    }),
  );
  assert.notEqual(plan.ownerId, oneOff.ownerId);
  assert.notEqual(plan.compatibilitySource, oneOff.compatibilitySource);
  assert.equal(plan.href?.includes("work-plans"), true);
  assert.equal(oneOff.href?.includes("operations"), true);
});

test("live compose excludes plan-derived items; flow.work retains both for offline/completion", () => {
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
      work({ occurrenceKey: "p1", label: "Plan wipe", state: "DUE", sourceKind: "WORK_PLAN" }),
      work({
        occurrenceKey: "o1",
        occurrenceId: "db-o1",
        label: "One-off ask",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
  });
  assert.equal(flow.work.length, 2);
  assert.equal(flow.items.filter(isPlanDerivedCompatibilityWork).length, 0);
  assert.equal(flow.items.filter(isOneOffCompatibilityWork).length, 1);
});

test("offline item snapshot omits plan-derived; Work commands stay on workContext path", () => {
  const items = composeJobFlowItems({
    compatibilityWork: [
      work({ occurrenceKey: "p1", label: "Plan", state: "DUE", sourceKind: "WORK_PLAN" }),
      work({
        occurrenceKey: "o1",
        occurrenceId: "db-o1",
        label: "One-off",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
  });
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: null,
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({ occurrenceKey: "p1", label: "Plan", state: "DUE", sourceKind: "WORK_PLAN" }),
      work({
        occurrenceKey: "o1",
        occurrenceId: "db-o1",
        label: "One-off",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
  });
  const ctx = serializeEmployeeRuntimeJobFlowItemContext(flow, {
    lastSyncedAt: "t",
    snapshotOperationalDate: "2026-11-08",
  });
  assert.ok(ctx);
  assert.equal(
    ctx.items.find((row) => row.compatibilitySource === "WORK_PLAN"),
    undefined,
  );
  assert.equal(
    ctx.items.find((row) => row.compatibilitySource === "ONE_OFF")?.compatibilitySource,
    "ONE_OFF",
  );
  assert.equal(flow.work.filter((row) => row.sourceKind === "WORK_PLAN").length, 1);
  void items;
});

test("authoring fences remain closed; cutover helper is wired into compose", () => {
  const root = process.cwd();
  const compose = readFileSync(join(root, "src/lib/employee-runtime-flow/compose.ts"), "utf8");
  assert.equal(compose.includes("withoutPlanDerivedCompatibilityWork"), true);
  assert.match(
    readFileSync(
      join(root, "src/lib/department-work/phase-2b-generic-work-authoring.hermetic.test.ts"),
      "utf8",
    ),
    /GENERIC_WORK_AUTHORING_RETIRED/,
  );
  assert.match(
    readFileSync(
      join(root, "src/lib/department-administration/phase-2a-location-function-authoring.hermetic.test.ts"),
      "utf8",
    ),
    /LOCATION_FUNCTION_AUTHORING_RETIRED/,
  );
});
