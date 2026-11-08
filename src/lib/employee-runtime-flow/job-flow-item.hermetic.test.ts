import assert from "node:assert/strict";
import test from "node:test";

import type { WorkRequirement } from "@/lib/department-work/types";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";

import {
  composeJobFlowItems,
  jobFlowItemFromCompatibilityWork,
  jobFlowItemsFromAssignmentExceptions,
  jobFlowItemsFromPreventiveMaintenance,
  jobFlowItemsFromWorkOrders,
} from "./job-flow-item";
import { composeEmployeeRuntimeFlow } from "./compose";
import type { EmployeeRuntimeEvidenceItem, EmployeeRuntimeMilestone } from "./types";

function work(
  partial: Partial<WorkRequirement> & {
    occurrenceKey: string;
    label: string;
    state: WorkRequirement["state"];
  },
): WorkRequirement {
  return {
    occurrenceKey: partial.occurrenceKey,
    workPlanId: partial.workPlanId ?? "wp",
    workPlanStableKey: partial.workPlanStableKey ?? "wp",
    workPlanVersion: partial.workPlanVersion ?? 1,
    workPlanName: partial.workPlanName ?? "Plan",
    workItemId: partial.workItemId ?? "item",
    workItemKey: partial.workItemKey ?? "item",
    label: partial.label,
    instructions: partial.instructions ?? null,
    priority: partial.priority ?? "ROUTINE",
    completionMode: partial.completionMode ?? "EXPLICIT_CONFIRMATION",
    responsibilityMode: partial.responsibilityMode ?? "UNIT_SHARED",
    scheduleKind: partial.scheduleKind ?? "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: partial.cycleStableKey ?? null,
    windowStartLocal: partial.windowStartLocal ?? null,
    windowEndLocal: partial.windowEndLocal ?? null,
    dueAt: partial.dueAt ?? null,
    windowStartsAt: partial.windowStartsAt ?? null,
    windowEndsAt: partial.windowEndsAt ?? null,
    unitId: partial.unitId ?? "unit-1",
    unitName: partial.unitName ?? "Unit 1",
    spaceId: partial.spaceId ?? "space-1",
    assetId: partial.assetId ?? null,
    roleKeys: partial.roleKeys ?? [],
    knowledgeArticleId: partial.knowledgeArticleId ?? null,
    procedureTitle: partial.procedureTitle ?? null,
    linkedTemplateStableKey: partial.linkedTemplateStableKey ?? null,
    linkedTemplateId: partial.linkedTemplateId ?? null,
    state: partial.state,
    occurrenceId: partial.occurrenceId ?? null,
    occurrenceStatus: partial.occurrenceStatus ?? null,
    assignedEmployeeId: partial.assignedEmployeeId ?? null,
    completedByLabel: partial.completedByLabel ?? null,
    completedAt: partial.completedAt ?? null,
    evidenceRecordId: partial.evidenceRecordId ?? null,
    sourceKind: partial.sourceKind ?? "WORK_PLAN",
    sourceHref: partial.sourceHref ?? "/staffing/work-plans",
  };
}

test("compatibility Work becomes an owner-referenced COMPATIBILITY_WORK item", () => {
  const row = work({
    occurrenceKey: "occ-1",
    occurrenceId: "db-occ-1",
    label: "Wipe tables",
    state: "PAST_DUE_NOT_CONFIRMED",
    dueAt: new Date("2026-11-08T15:00:00.000Z"),
  });
  const item = jobFlowItemFromCompatibilityWork(row);
  assert.equal(item.ownerKind, "COMPATIBILITY_WORK");
  assert.equal(item.ownerId, "db-occ-1");
  assert.equal(item.compatibility, true);
  assert.equal(item.ownerState, "PAST_DUE_NOT_CONFIRMED");
  assert.equal(item.attention, "needs_attention");
  assert.equal(item.place.spaceId, "space-1");
  assert.equal(item.time.dueAt?.toISOString(), "2026-11-08T15:00:00.000Z");
  assert.equal(item.href, "/staffing/work-plans");
});

test("optional contributors that are not wired yet contribute zero items", () => {
  assert.deepEqual(jobFlowItemsFromWorkOrders([]), []);
  assert.deepEqual(jobFlowItemsFromPreventiveMaintenance([{ id: "pm-1", label: "x" }]), []);
  assert.deepEqual(jobFlowItemsFromAssignmentExceptions([{ id: "ex-1", label: "y" }]), []);
  assert.deepEqual(composeJobFlowItems({}), []);
});

test("composeJobFlowItems merges Work, Records, and Key Points without inventing WO/PM", () => {
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
    kind: "MEAL_READY",
    label: "Ready for service",
    statusKey: "OPEN",
  };
  const items = composeJobFlowItems({
    compatibilityWork: [work({ occurrenceKey: "w1", label: "Sweep", state: "DUE" })],
    harborEvidence: [evidence],
    milestones: [milestone],
  });
  assert.equal(items.length, 3);
  assert.equal(items.filter((row) => row.ownerKind === "COMPATIBILITY_WORK").length, 1);
  assert.equal(items.filter((row) => row.ownerKind === "RECORD_REQUIREMENT").length, 1);
  assert.equal(items.filter((row) => row.ownerKind === "OPERATING_RHYTHM_KEY_POINT").length, 1);
  assert.equal(items.every((row) => row.ownerKind !== "WORK_ORDER"), true);
  assert.equal(
    items.find((row) => row.ownerKind === "RECORD_REQUIREMENT")?.compatibility,
    false,
  );
});

test("Employee Runtime Flow compose attaches items while preserving work array", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: null,
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [work({ occurrenceKey: "w-signed-in", label: "Check", state: "DUE" })],
  });
  assert.equal(flow.assignmentAvailability, "no_confirmed_assignment");
  assert.equal(flow.work.length, 1);
  assert.equal(flow.items.length, 1);
  assert.equal(flow.items[0]?.ownerKind, "COMPATIBILITY_WORK");
  assert.equal(flow.items[0]?.ownerId, "w-signed-in");
});

test("template evidence adapter stays Records-owned and non-compatibility", () => {
  const row = {
    requirementKey: "tpl-req",
    state: "DUE",
    stateLabel: "Due",
    operationalDateKey: "2026-11-08",
    templateId: "tpl",
    templateStableKey: "tpl",
    templateVersion: 1,
    templateName: "Sanitizer",
    purposeType: "LOG",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    cycleLabel: null,
    windowStartLocal: "10:00",
    windowEndLocal: "11:00",
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "u1",
    spaceId: "s1",
    assetId: null,
    assetType: null,
    spaceType: null,
    recordId: null,
    recordStatus: null,
    fields: [],
    instructions: null,
  } as EvidenceRequirement;
  const items = composeJobFlowItems({ templateEvidence: [row] });
  assert.equal(items[0]?.ownerKind, "RECORD_REQUIREMENT");
  assert.equal(items[0]?.compatibility, false);
  assert.equal(items[0]?.label, "Sanitizer");
});
