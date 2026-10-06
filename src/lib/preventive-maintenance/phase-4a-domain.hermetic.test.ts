import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDepartmentProduct } from "@/lib/department-products";

import { decidePmPlanAuthority } from "./authority";
import { isPmPlanGenerationEligible, pmIneligibilityReason } from "./eligibility";
import {
  assertPmPublishedVersionImmutable,
  getOccurrenceCalendarState,
  nextPmPlanVersionNumber,
  presentPmOccurrence,
} from "./version-semantics";

test("Facility Plant Operations remains DEVELOPMENT", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
});

test("published and superseded versions are immutable", () => {
  assert.throws(() => assertPmPublishedVersionImmutable("PUBLISHED"), /immutable/);
  assert.throws(() => assertPmPublishedVersionImmutable("SUPERSEDED"), /immutable/);
  assert.doesNotThrow(() => assertPmPublishedVersionImmutable("DRAFT"));
  assert.equal(nextPmPlanVersionNumber(1), 2);
});

test("OPEN occurrences project UPCOMING DUE OVERDUE from facility today", () => {
  assert.equal(
    getOccurrenceCalendarState({ scheduledDate: "2027-10-15", facilityToday: "2027-10-14" }),
    "UPCOMING",
  );
  assert.equal(
    getOccurrenceCalendarState({ scheduledDate: "2027-10-15", facilityToday: "2027-10-15" }),
    "DUE",
  );
  assert.equal(
    getOccurrenceCalendarState({ scheduledDate: "2027-10-15", facilityToday: "2027-10-16" }),
    "OVERDUE",
  );
  assert.equal(
    presentPmOccurrence({
      status: "COMPLETED",
      scheduledDate: "2027-10-15",
      facilityToday: "2027-10-20",
    }),
    "COMPLETED",
  );
  assert.equal(
    presentPmOccurrence({
      status: "SKIPPED",
      scheduledDate: "2027-10-15",
      facilityToday: "2027-10-10",
    }),
    "SKIPPED",
  );
});

test("Asset RETIRED does not imply Plan RETIRED", () => {
  assert.equal(
    isPmPlanGenerationEligible({ planStatus: "PUBLISHED", assetStatus: "RETIRED" }),
    false,
  );
  assert.equal(
    pmIneligibilityReason({ planStatus: "PUBLISHED", assetStatus: "RETIRED" }),
    "ASSET_RETIRED",
  );
  assert.equal(
    isPmPlanGenerationEligible({ planStatus: "PUBLISHED", assetStatus: "OUT_OF_SERVICE" }),
    true,
  );
  assert.equal(
    isPmPlanGenerationEligible({ planStatus: "RETIRED", assetStatus: "OPERATIONAL" }),
    false,
  );
  assert.equal(
    pmIneligibilityReason({ planStatus: "RETIRED", assetStatus: "OPERATIONAL" }),
    "PLAN_RETIRED",
  );
  assert.equal(
    isPmPlanGenerationEligible({ planStatus: "PUBLISHED", assetStatus: "OPERATIONAL" }),
    true,
  );
});

test("Build publish is Manager+, not Supervisor or PIN", () => {
  const base = {
    flagEnabled: true,
    sessionFacilityId: "f1",
    facilityId: "f1",
    departmentId: "d1",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "d1",
    authMethod: "PASSWORD" as const,
  };
  assert.equal(decidePmPlanAuthority({ ...base, role: "STAFF" }).canPublish, false);
  assert.equal(decidePmPlanAuthority({ ...base, role: "SUPERVISOR" }).canPublish, false);
  assert.equal(decidePmPlanAuthority({ ...base, role: "MANAGER" }).canPublish, true);
  assert.equal(decidePmPlanAuthority({ ...base, role: "MANAGER" }).canRetire, true);
  assert.equal(
    decidePmPlanAuthority({ ...base, role: "MANAGER", authMethod: "QUICK_PIN" }).canPublish,
    false,
  );
});

test("phase 4A domain does not generate Work Orders or cron", () => {
  const service = readFileSync(join(process.cwd(), "src/lib/preventive-maintenance/plan-service.ts"), "utf8");
  assert.doesNotMatch(service, /createWorkOrder/);
  assert.doesNotMatch(service, /preventiveMaintenanceSchedule/);
  assert.doesNotMatch(service, /cron/i);
  const files = [
    "src/lib/preventive-maintenance/plan-service.ts",
    "src/lib/preventive-maintenance/schedule.ts",
    "src/lib/preventive-maintenance/eligibility.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /\/api\/internal\/plant/);
  }
});
