/**
 * Phase 11B EVS hermetic coverage — flags, authority, department isolation resolve.
 * Room summary cases live in space-work-summary.hermetic.test.ts (leave as is).
 * SPACE_TYPE expansion: resolve-requirements.hermetic.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  isDepartmentJobFlowEnabled,
} from "@/lib/department-operations";
import { decideJobFlowAuthority } from "@/lib/dietary-job-flow/job-flow-authority";

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
