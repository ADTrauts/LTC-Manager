/**
 * Phase 4B hermetic tests: materialization rules, skip authority, cron auth,
 * Work Order copy, and source contracts. No database.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDepartmentProduct } from "@/lib/department-products";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/asset-operations/types";

import { decidePmPlanAuthority } from "./authority";
import { isPmActiveWorkOrderStatus, isPmTerminalWorkOrderStatus } from "./active-work-order";
import { isPlantPmCronAuthorized } from "./cron-auth";
import { presentPmWorkOrderContext } from "./pm-context";
import { preventiveWorkOrderCopy } from "./work-order-create";
import { presentPmOccurrence } from "./version-semantics";

test("Facility Plant Operations remains DEVELOPMENT", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
});

test("active Work Order statuses match canonical OPEN_WORK_ORDER_STATUSES", () => {
  for (const status of OPEN_WORK_ORDER_STATUSES) {
    assert.equal(isPmActiveWorkOrderStatus(status), true);
  }
  assert.equal(isPmActiveWorkOrderStatus("COMPLETED"), false);
  assert.equal(isPmActiveWorkOrderStatus("CLOSED"), false);
  assert.equal(isPmActiveWorkOrderStatus("CANCELLED"), false);
  assert.equal(isPmTerminalWorkOrderStatus("CANCELLED"), true);
});

test("OPEN overdue is a projection, not a stored status", () => {
  assert.equal(
    presentPmOccurrence({
      status: "OPEN",
      scheduledDate: "2027-10-15",
      facilityToday: "2027-10-20",
    }),
    "OVERDUE",
  );
});

test("Work Order copy uses Plan name and scheduled date, not a generic title", () => {
  const copy = preventiveWorkOrderCopy({
    planName: "Quarterly Dishwasher PM",
    scheduledDate: "2026-10-15",
  });
  assert.equal(copy.title, "Quarterly Dishwasher PM");
  assert.match(copy.description, /Preventive Maintenance/);
  assert.match(copy.description, /Oct 15, 2026/);
  const instructed = preventiveWorkOrderCopy({
    planName: "Quarterly Dishwasher PM",
    instructions: "Inspect spray arms.",
    scheduledDate: "2026-10-15",
  });
  assert.equal(instructed.description, "Inspect spray arms.");
});

test("PM Work Order projection exposes plan name, scheduled date, and occurrence", () => {
  const ctx = presentPmWorkOrderContext({
    workOrderKind: "PREVENTIVE",
    pmOccurrence: {
      id: "occ1",
      scheduledDate: "2027-10-15",
      planVersion: { name: "Quarterly Dishwasher PM" },
    },
  });
  assert.deepEqual(ctx, {
    occurrenceId: "occ1",
    planName: "Quarterly Dishwasher PM",
    scheduledDate: "2027-10-15",
  });
  assert.equal(
    presentPmWorkOrderContext({
      workOrderKind: "CORRECTIVE",
      pmOccurrence: {
        id: "occ1",
        scheduledDate: "2027-10-15",
        planVersion: { name: "Quarterly Dishwasher PM" },
      },
    }),
    null,
  );
});

test("Supervisor+ can skip; staff cannot; skip is not Build publish", () => {
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
  assert.equal(decidePmPlanAuthority({ ...base, role: "STAFF" }).canSkip, false);
  assert.equal(decidePmPlanAuthority({ ...base, role: "SUPERVISOR" }).canSkip, true);
  assert.equal(decidePmPlanAuthority({ ...base, role: "SUPERVISOR" }).canDraft, true);
  assert.equal(decidePmPlanAuthority({ ...base, role: "SUPERVISOR" }).canPublish, false);
});

test("cron Bearer CRON_SECRET is timing-safe and rejects mismatches", () => {
  const secret = "plant-pm-secret";
  const url = "https://vssyl.com/api/internal/plant/preventive-maintenance";
  assert.equal(isPlantPmCronAuthorized(new Request(url), secret), false);
  assert.equal(
    isPlantPmCronAuthorized(
      new Request(url, { headers: { authorization: "Bearer other" } }),
      secret,
    ),
    false,
  );
  assert.equal(
    isPlantPmCronAuthorized(
      new Request(url, { headers: { authorization: `Bearer ${secret}` } }),
      secret,
    ),
    true,
  );
});

test("generator and cron do not fake a user session", () => {
  const generator = readFileSync(
    join(process.cwd(), "src/lib/preventive-maintenance/generator.ts"),
    "utf8",
  );
  const create = readFileSync(
    join(process.cwd(), "src/lib/preventive-maintenance/work-order-create.ts"),
    "utf8",
  );
  const route = readFileSync(
    join(process.cwd(), "src/app/api/internal/plant/preventive-maintenance/route.ts"),
    "utf8",
  );
  const cron = readFileSync(
    join(process.cwd(), "src/lib/preventive-maintenance/cron.ts"),
    "utf8",
  );
  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  const closeout = readFileSync(
    join(process.cwd(), "src/lib/asset-operations/work-order-closeout.ts"),
    "utf8",
  );
  assert.doesNotMatch(generator, /createWorkOrderDirect/);
  assert.doesNotMatch(create, /createWorkOrderDirect/);
  assert.doesNotMatch(create, /sessionUserIdForFk/);
  assert.match(create, /reportedById:\s*null/);
  assert.match(create, /workOrderKind:\s*"PREVENTIVE"/);
  assert.match(create, /issueId:\s*null/);
  assert.match(route, /handlePlantPmCron/);
  assert.match(cron, /isPlantPmCronAuthorized/);
  assert.match(cron, /runPmGeneration/);
  assert.match(vercel, /\/api\/internal\/plant\/preventive-maintenance/);
  assert.match(vercel, /0 6 \* \* \*/);
  assert.match(closeout, /completePmOccurrenceForWorkOrder/);
});
