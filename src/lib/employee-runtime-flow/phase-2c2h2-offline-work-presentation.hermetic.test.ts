/**
 * Phase 2C-2H-2 — newly issued offline workContext omits WORK_PLAN advertising.
 * Preserves ONE_OFF presentation, old cached bundles, and COMPLETE_OPERATIONAL_TASK sync.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { WorkRequirement } from "@/lib/department-work/types";
import {
  OFFLINE_JOB_FLOW_ITEM_SCHEMA_VERSION,
  type OfflineRuntimeBundle,
} from "@/lib/offline/types";
import { validateBundleForOfflineCommand } from "@/lib/offline/bundle-validation";

import { composeEmployeeRuntimeFlow } from "./compose";
import {
  filterWorkRequirementsForOfflinePresentation,
  readOfflineJobFlowItems,
  serializeEmployeeRuntimeJobFlowItemContext,
  serializeEmployeeRuntimeWorkContext,
  serializeOfflineWorkContextRequirements,
} from "./serialize-offline";

function assignment(
  partial: Partial<JobFlowAssignmentSnapshot> & { id: string },
): JobFlowAssignmentSnapshot {
  return {
    id: partial.id,
    roleKey: partial.roleKey ?? "SERVER",
    roleLabel: partial.roleLabel ?? "Server",
    unitId: partial.unitId ?? "unit-a",
    unitName: partial.unitName ?? "3A",
    startsAt: partial.startsAt ?? new Date("2026-11-08T10:00:00.000Z"),
    endsAt: partial.endsAt ?? new Date("2026-11-08T18:00:00.000Z"),
    status: partial.status ?? "ACTIVE",
    scopeKind: partial.scopeKind ?? "UNIT",
    locationCount: partial.locationCount,
    locationLabels: partial.locationLabels,
    sourceZoneName: partial.sourceZoneName ?? null,
  };
}

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
    unitId: partial.unitId ?? "unit-a",
    unitName: "3A",
    spaceId: partial.spaceId ?? "servery-a",
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
      partial.sourceHref ??
      (partial.sourceKind === "WORK_PLAN"
        ? "/staffing/work-plans"
        : `/staffing/operations?work=${partial.occurrenceKey}`),
  };
}

function sampleBundle(partial?: Partial<OfflineRuntimeBundle>): OfflineRuntimeBundle {
  return {
    bundleVersion: "2026-11-08:abc",
    serverRevision: "abc",
    issuedAt: new Date().toISOString(),
    offlineAuthorizedUntil: new Date(Date.now() + 3600_000).toISOString(),
    lastSuccessfulSyncAt: null,
    facilityId: "fac1",
    facilityTimezone: "America/New_York",
    facilityName: "Facility",
    departmentId: "dep1",
    departmentName: "Dietary",
    unitId: "unit1",
    unitName: "3A",
    deviceFacilityId: "fac1",
    deviceBoundUnitId: "unit1",
    actor: {
      displayName: "Test",
      role: "STAFF",
      authMethod: "QUICK_PIN",
      authKind: "employee",
      actorRef: "employee:emp1",
      sessionVersion: 2,
    },
    operationalDate: "2026-11-08",
    mealContext: { applicableMealType: null, label: null, expectedServiceTime: null },
    milestones: [],
    procedureLabels: [],
    ...partial,
  };
}

test("new workContext excludes WORK_PLAN and retains ONE_OFF", () => {
  const rows = [
    work({ occurrenceKey: "plan-1", label: "Plan wipe", state: "DUE", sourceKind: "WORK_PLAN" }),
    work({
      occurrenceKey: "oo-1",
      occurrenceId: "db-oo-1",
      label: "One-off wipe",
      state: "DUE",
      sourceKind: "ONE_OFF",
    }),
    work({
      occurrenceKey: "plan-done",
      label: "Done plan",
      state: "COMPLETED",
      sourceKind: "WORK_PLAN",
    }),
  ];
  const filtered = filterWorkRequirementsForOfflinePresentation(rows);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.occurrenceKey, "oo-1");
  assert.equal(filtered[0]?.sourceKind, "ONE_OFF");

  const ctx = serializeOfflineWorkContextRequirements(filtered, "t");
  assert.equal(ctx.requirements.map((r) => r.occurrenceKey).join(","), "oo-1");
});

test("does not infer ONE_OFF from missing plan ids", () => {
  const ambiguousPlanShaped = work({
    occurrenceKey: "ghost",
    label: "Looks empty",
    state: "DUE",
    sourceKind: "WORK_PLAN",
  });
  // Authoritative sourceKind wins even if ids were emptied by a caller.
  ambiguousPlanShaped.workPlanId = "";
  ambiguousPlanShaped.workPlanStableKey = "";
  ambiguousPlanShaped.workPlanVersion = 0;
  assert.equal(filterWorkRequirementsForOfflinePresentation([ambiguousPlanShaped]).length, 0);
});

test("compose flow.work remains unfiltered while serialization filters", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({ occurrenceKey: "plan-a", label: "Plan", state: "DUE", sourceKind: "WORK_PLAN" }),
      work({
        occurrenceKey: "oo-a",
        occurrenceId: "db-oo",
        label: "One-off",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
  });
  assert.equal(flow.work.filter((r) => r.sourceKind === "WORK_PLAN").length, 1);
  assert.equal(flow.work.filter((r) => r.sourceKind === "ONE_OFF").length, 1);
  assert.equal(flow.items.filter((r) => r.compatibilitySource === "WORK_PLAN").length, 0);
  assert.equal(flow.items.filter((r) => r.compatibilitySource === "ONE_OFF").length, 1);

  const workCtx = serializeEmployeeRuntimeWorkContext(flow, "t");
  assert.ok(workCtx);
  assert.equal(workCtx.requirements.length, 1);
  assert.equal(workCtx.requirements[0]?.occurrenceKey, "oo-a");

  const itemsCtx = serializeEmployeeRuntimeJobFlowItemContext(flow, {
    lastSyncedAt: "t",
    snapshotOperationalDate: "2026-11-08",
  });
  assert.ok(itemsCtx);
  assert.equal(itemsCtx.items.filter((r) => r.compatibilitySource === "ONE_OFF").length, 1);
  assert.equal(itemsCtx.items.filter((r) => r.compatibilitySource === "WORK_PLAN").length, 0);
});

test("no duplicate Work presentation between items and workContext for ONE_OFF", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({
        occurrenceKey: "oo-dup",
        occurrenceId: "db-oo-dup",
        label: "One-off",
        state: "CURRENT",
        sourceKind: "ONE_OFF",
      }),
    ],
  });
  const workCtx = serializeEmployeeRuntimeWorkContext(flow, "t");
  const itemsCtx = serializeEmployeeRuntimeJobFlowItemContext(flow, {
    lastSyncedAt: "t",
    snapshotOperationalDate: "2026-11-08",
  });
  assert.equal(workCtx?.requirements.length, 1);
  assert.equal(itemsCtx?.items.filter((r) => r.ownerKind === "COMPATIBILITY_WORK").length, 1);
});

test("Work presentation filter does not rewrite Records or milestone serializers", () => {
  const root = process.cwd();
  const serialize = readFileSync(
    join(root, "src/lib/employee-runtime-flow/serialize-offline.ts"),
    "utf8",
  );
  assert.match(serialize, /serializeEmployeeRuntimeEvidenceContext/);
  assert.match(serialize, /filterWorkRequirementsForOfflinePresentation/);
  // Filter is scoped to Work requirements only.
  const filterFn = serialize.slice(
    serialize.indexOf("filterWorkRequirementsForOfflinePresentation"),
    serialize.indexOf("export function serializeOfflineWorkContextRequirements"),
  );
  assert.equal(filterFn.includes("Evidence"), false);
  assert.equal(filterFn.includes("milestone"), false);

  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({ occurrenceKey: "plan-x", label: "Plan", state: "DUE", sourceKind: "WORK_PLAN" }),
    ],
  });
  assert.equal(serializeEmployeeRuntimeWorkContext(flow, "t")?.requirements.length ?? 0, 0);
});

test("assigned WO stays read-only; exceptions informational", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({ occurrenceKey: "plan-a", label: "Plan", state: "DUE", sourceKind: "WORK_PLAN" }),
    ],
    workOrders: [
      {
        id: "wo-1",
        repairCode: "R-1",
        title: "Fix sink",
        status: "ASSIGNED",
        dueAt: null,
        unitId: "unit-a",
        spaceId: null,
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
        unitId: "unit-a",
        href: null,
      },
    ],
  });
  const itemsCtx = serializeEmployeeRuntimeJobFlowItemContext(flow, {
    lastSyncedAt: "t",
    snapshotOperationalDate: "2026-11-08",
  });
  assert.ok(itemsCtx);
  const wo = itemsCtx.items.find((r) => r.ownerKind === "WORK_ORDER");
  assert.equal(wo?.offlineAction, null);
  const ex = itemsCtx.items.find((r) => r.ownerKind === "ASSIGNMENT_EXCEPTION");
  assert.equal(ex?.informational, true);
  assert.equal(ex?.offlineAction, null);
});

test("previously issued cached bundle with WORK_PLAN workContext remains readable", () => {
  const legacy = sampleBundle({
    workContext: {
      lastSyncedAt: "2026-10-01T00:00:00.000Z",
      requirements: [
        {
          occurrenceKey: "old-plan",
          label: "Legacy plan task",
          state: "DUE",
          priority: "ROUTINE",
          completionMode: "EXPLICIT_CONFIRMATION",
          workPlanStableKey: "published_plan",
          workPlanVersion: 1,
          workItemKey: "item",
          workPlanId: "wp",
          workItemId: "item",
          instructions: null,
          knowledgeArticleId: null,
          procedureTitle: null,
          dueAt: null,
          cycleStableKey: null,
          windowStartLocal: null,
          windowEndLocal: null,
          assignedEmployeeId: null,
        },
      ],
    },
    jobFlowItemContext: {
      schemaVersion: OFFLINE_JOB_FLOW_ITEM_SCHEMA_VERSION,
      lastSyncedAt: "2026-10-01T00:00:00.000Z",
      snapshotOperationalDate: "2026-10-01",
      items: [],
    },
  });
  assert.equal(legacy.workContext?.requirements.length, 1);
  assert.equal(legacy.workContext?.requirements[0]?.occurrenceKey, "old-plan");
  assert.deepEqual(readOfflineJobFlowItems(legacy), []);
  const scope = validateBundleForOfflineCommand({
    bundle: legacy,
    facilityId: "fac1",
    unitId: "unit1",
    actorRef: "employee:emp1",
    sessionVersion: 2,
    deviceFacilityId: "fac1",
    deviceBoundUnitId: "unit1",
  });
  assert.equal(scope.ok, true);
});

test("unsupported jobFlowItem schemaVersion still degrades safely", () => {
  const bundle = sampleBundle({
    jobFlowItemContext: {
      schemaVersion: 99 as typeof OFFLINE_JOB_FLOW_ITEM_SCHEMA_VERSION,
      lastSyncedAt: "t",
      snapshotOperationalDate: "2026-11-08",
      items: [
        {
          ownerKind: "COMPATIBILITY_WORK",
          ownerId: "oo-1",
          label: "x",
          ownerState: "DUE",
          attention: "due_now",
          place: { unitId: null, spaceId: null, assetId: null },
          time: { dueAt: null, windowStartLocal: null, windowEndLocal: null },
          href: null,
          compatibility: true,
          compatibilitySource: "ONE_OFF",
          informational: false,
          offlineAction: "COMPLETE_OPERATIONAL_TASK",
        },
      ],
    },
  });
  assert.deepEqual(readOfflineJobFlowItems(bundle), []);
});

test("progressive configuration: empty work advertising when no ONE_OFF", () => {
  const noWork = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [],
  });
  assert.equal(serializeEmployeeRuntimeWorkContext(noWork, "t")?.requirements.length ?? 0, 0);

  const planOnly = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({ occurrenceKey: "p1", label: "Plan", state: "DUE", sourceKind: "WORK_PLAN" }),
      work({
        occurrenceKey: "p2",
        label: "Plan overdue",
        state: "PAST_DUE_NOT_CONFIRMED",
        sourceKind: "WORK_PLAN",
      }),
    ],
  });
  assert.equal(planOnly.items.length, 0);
  assert.equal(serializeEmployeeRuntimeWorkContext(planOnly, "t")?.requirements.length ?? 0, 0);

  const noAssignment = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: null,
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workRequirements: [
      work({
        occurrenceKey: "oo-orphan",
        occurrenceId: "db",
        label: "One-off",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
  });
  // Composition rules may still retain work; presentation filter is source-aware only.
  const orphanCtx = serializeEmployeeRuntimeWorkContext(noAssignment, "t");
  assert.ok(orphanCtx);
  assert.equal(orphanCtx.requirements.every((r) => r.occurrenceKey === "oo-orphan"), true);
});

test("sync processor does not gate Work completion on workContext membership", () => {
  const root = process.cwd();
  const sync = readFileSync(join(root, "src/lib/offline/process-sync-command.ts"), "utf8");
  assert.match(sync, /COMPLETE_OPERATIONAL_TASK/);
  assert.match(sync, /processWorkCompletionCommand/);
  assert.equal(sync.includes("workContext"), false);
  assert.match(sync, /ALREADY_ACCEPTED/);
  assert.match(sync, /CONFLICT_REVIEW_REQUIRED/);
});

test("bundle builder uses shared ONE_OFF presentation filter", () => {
  const root = process.cwd();
  const builder = readFileSync(join(root, "src/lib/offline/build-runtime-bundle.ts"), "utf8");
  assert.match(builder, /filterWorkRequirementsForOfflinePresentation/);
  assert.match(builder, /serializeOfflineWorkContextRequirements/);
  assert.match(builder, /serializeEmployeeRuntimeWorkContext/);
});

test("resolveUnitWorkRequirements is not rewritten by offline presentation filter", () => {
  const root = process.cwd();
  const serialize = readFileSync(
    join(root, "src/lib/employee-runtime-flow/serialize-offline.ts"),
    "utf8",
  );
  assert.equal(serialize.includes("resolveUnitWorkRequirements"), false);
  assert.match(serialize, /sourceKind === "ONE_OFF"/);
});
