/**
 * Phase 11B EVS hermetic coverage — flags, authority, department isolation resolve.
 * Room summary cases live in space-work-summary.hermetic.test.ts (leave as is).
 * SPACE_TYPE expansion: resolve-requirements.hermetic.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  isDepartmentJobFlowEnabled,
  isDepartmentWorkPlansEnabled,
} from "@/lib/department-operations";
import { decideWorkAuthority } from "@/lib/department-work/authority";
import { resolveWorkRequirements } from "@/lib/department-work/resolve-requirements";
import type { PublishedWorkPlanForResolve } from "@/lib/department-work/types";
import { decideJobFlowAuthority } from "@/lib/dietary-job-flow/job-flow-authority";
import { isDietaryWorkPlansEnabled, isEvsOperationsEnabled } from "@/lib/feature-flags";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

function planForDept(
  departmentHint: string,
  itemKey: string,
  unitId: string,
): PublishedWorkPlanForResolve {
  return {
    id: `plan_${departmentHint}`,
    stableKey: `${departmentHint}_plan`,
    version: 1,
    name: `${departmentHint} Plan`,
    status: "PUBLISHED",
    effectiveStartDate: null,
    effectiveEndDate: null,
    weekdays: [],
    applicabilities: [
      {
        kind: "SPECIFIC_UNIT",
        unitId,
        spaceId: null,
        spaceType: null,
        assetId: null,
        assetType: null,
      },
    ],
    items: [
      {
        id: `item_${itemKey}`,
        itemKey,
        label: itemKey,
        instructions: null,
        displaySequence: 10,
        priority: "ROUTINE",
        completionMode: "EXPLICIT_CONFIRMATION",
        responsibilityMode: "UNIT_SHARED",
        scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
        cycleStableKeys: [],
        windowStartLocal: null,
        windowEndLocal: null,
        dueOffsetKind: null,
        dueOffsetMinutes: null,
        roleKeys: [],
        unitId: null,
        spaceId: null,
        assetId: null,
        knowledgeArticleId: null,
        procedureTitleSnapshot: null,
        linkedTemplateStableKey: null,
        linkedTemplateId: null,
        supervisorVisible: true,
      },
    ],
  };
}

test("EVS flag defaults false; Dietary work flags unchanged when EVS disabled", () => {
  withEnv("EVS_OPERATIONS_ENABLED", undefined, () => {
    withEnv("DIETARY_WORK_PLANS_ENABLED", "true", () => {
      assert.equal(isEvsOperationsEnabled(), false);
      assert.equal(isDepartmentWorkPlansEnabled("EVS"), false);
      assert.equal(isDepartmentJobFlowEnabled("EVS"), false);
      assert.equal(isDietaryWorkPlansEnabled(), true);
      assert.equal(isDepartmentWorkPlansEnabled("DIETARY"), true);
    });
  });
});

test("when EVS enabled and Dietary work disabled, only EVS work-plans key is true", () => {
  withEnv("EVS_OPERATIONS_ENABLED", "true", () => {
    withEnv("DIETARY_WORK_PLANS_ENABLED", "false", () => {
      assert.equal(isDepartmentWorkPlansEnabled("EVS"), true);
      assert.equal(isDepartmentWorkPlansEnabled("DIETARY"), false);
      assert.equal(isDepartmentJobFlowEnabled("EVS"), true);
      assert.equal(isDepartmentJobFlowEnabled("DIETARY"), false);
    });
  });
});

test("cross-department resolve: Runtime-scoped publishedPlans keep Dietary/EVS work isolated", () => {
  const dietaryPlan = planForDept("dietary", "tray_count", "u_shared");
  const evsPlan = planForDept("evs", "surface_wipe", "u_shared");
  const now = new Date("2026-08-07T15:00:00.000Z");
  const assignment = [{ employeeId: "e1", unitId: "u_shared", roleKey: null }];

  // Callers (load-runtime-work) pass only that department's published plans.
  const dietaryOnly = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dept_dietary",
    operationalDateKey: "2026-08-07",
    now,
    facilityTimezone: "America/New_York",
    unitId: "u_shared",
    publishedPlans: [dietaryPlan],
    publishedCycles: [],
    confirmedAssignments: assignment,
    existingOccurrences: [],
  });
  assert.ok(dietaryOnly.some((r) => r.workItemKey === "tray_count"));
  assert.ok(!dietaryOnly.some((r) => r.workItemKey === "surface_wipe"));

  const evsOnly = resolveWorkRequirements({
    facilityId: "f1",
    departmentId: "dept_evs",
    operationalDateKey: "2026-08-07",
    now,
    facilityTimezone: "America/New_York",
    unitId: "u_shared",
    publishedPlans: [evsPlan],
    publishedCycles: [],
    confirmedAssignments: assignment,
    existingOccurrences: [],
  });
  assert.ok(evsOnly.some((r) => r.workItemKey === "surface_wipe"));
  assert.ok(!evsOnly.some((r) => r.workItemKey === "tray_count"));
});

test("decideWorkAuthority: EVS flag off denies; flag on STAFF completes; Quick PIN cannot manage; FA without primary denied", () => {
  const base = {
    role: "MANAGER" as const,
    authMethod: "PASSWORD" as const,
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "evs",
    departmentExists: true,
    primaryDepartmentId: "evs",
    departmentLabel: "EVS",
  };

  const off = decideWorkAuthority({ ...base, flagEnabled: false });
  assert.equal(off.canViewRuntime, false);
  assert.equal(off.canManage, false);

  const staff = decideWorkAuthority({
    ...base,
    flagEnabled: true,
    role: "STAFF",
    primaryDepartmentId: null,
  });
  assert.equal(staff.canComplete, true);
  assert.equal(staff.canManage, false);

  const pin = decideWorkAuthority({
    ...base,
    flagEnabled: true,
    authMethod: "QUICK_PIN",
  });
  assert.equal(pin.canComplete, true);
  assert.equal(pin.canManage, false);
  assert.equal(pin.canPublish, false);

  const fa = decideWorkAuthority({
    ...base,
    flagEnabled: true,
    role: "FACILITY_ADMINISTRATOR",
    primaryDepartmentId: "dietary",
  });
  assert.equal(fa.canManage, false);
  assert.match(fa.reason ?? "", /Facility Administrator/);
});

test("decideJobFlowAuthority: EVS flag off denies; STAFF can view own Job Flow when enabled", () => {
  const denied = decideJobFlowAuthority({
    flagEnabled: false,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "evs",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(denied.canViewOwnJobFlow, false);

  const staff = decideJobFlowAuthority({
    flagEnabled: true,
    role: "STAFF",
    authMethod: "PASSWORD",
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "evs",
    departmentExists: true,
    primaryDepartmentId: null,
  });
  assert.equal(staff.canViewOwnJobFlow, true);
  assert.equal(staff.canViewSupervisorBoard, false);
});
