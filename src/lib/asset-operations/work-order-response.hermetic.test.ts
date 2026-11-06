import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { decideAssetOperationsAuthority } from "./authority";
import {
  presentWorkOrder,
  presentWorkOrderPriority,
  presentWorkOrderResponseHistoryLine,
  presentWorkOrderResponseRequirement,
  workOrderPriorityAuthorityLabel,
  workOrderRequiresImmediateResponse,
} from "./work-order-semantics";

test("immediate response is separate from queue priority and ends when the Work Order closes", () => {
  assert.equal(
    workOrderRequiresImmediateResponse({ status: "OPEN", responseRequirement: "STANDARD" }),
    false,
  );
  assert.equal(
    workOrderRequiresImmediateResponse({ status: "OPEN", responseRequirement: "IMMEDIATE" }),
    true,
  );
  assert.equal(
    workOrderRequiresImmediateResponse({ status: "ON_HOLD", responseRequirement: "IMMEDIATE" }),
    true,
  );
  assert.equal(
    workOrderRequiresImmediateResponse({ status: "COMPLETED", responseRequirement: "IMMEDIATE" }),
    false,
  );
  assert.equal(
    workOrderRequiresImmediateResponse({ status: "CANCELLED", responseRequirement: "IMMEDIATE" }),
    false,
  );
  const shown = presentWorkOrder({
    status: "OPEN",
    priority: "EMERGENCY",
    responseRequirement: "STANDARD",
  });
  assert.equal(shown.priority, "EMERGENCY");
  assert.equal(shown.responseRequirement, "STANDARD");
  assert.equal(workOrderPriorityAuthorityLabel(presentWorkOrderPriority("EMERGENCY")), "Emergency");
  assert.equal(workOrderPriorityAuthorityLabel(presentWorkOrderPriority("LOW")), "Routine");
});

test("the Work Order screen shows Response Requirement separately from priority", () => {
  const standard = presentWorkOrderResponseRequirement({
    responseRequirement: "STANDARD",
    status: "OPEN",
    canManageWorkOrders: true,
    hasResponsibleDepartment: true,
  });
  assert.equal(standard.label, "Standard");
  assert.equal(standard.editable, true);
  assert.match(standard.explanation, /assignment and deadline/);

  const immediate = presentWorkOrderResponseRequirement({
    responseRequirement: "IMMEDIATE",
    status: "IN_PROGRESS",
    canManageWorkOrders: true,
    hasResponsibleDepartment: true,
  });
  assert.equal(immediate.label, "Immediate");
  assert.equal(immediate.editable, true);
  assert.match(immediate.explanation, /On-Call Coverage/);

  const access = {
    flagEnabled: true,
    sessionFacilityId: "facility",
    facilityId: "facility",
    departmentId: "department",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "department",
  };
  const staffDecision = decideAssetOperationsAuthority({
    ...access,
    role: "STAFF",
    authMethod: "PASSWORD",
  });
  const staff = presentWorkOrderResponseRequirement({
    responseRequirement: "IMMEDIATE",
    status: "OPEN",
    canManageWorkOrders: staffDecision.canManageWorkOrders,
    hasResponsibleDepartment: true,
  });
  assert.equal(staff.label, "Immediate");
  assert.equal(staff.editable, false);
  assert.equal(staff.readOnlyReason, "role");

  const pinDecision = decideAssetOperationsAuthority({
    ...access,
    role: "SUPERVISOR",
    authMethod: "QUICK_PIN",
  });
  const pin = presentWorkOrderResponseRequirement({
    responseRequirement: "STANDARD",
    status: "ASSIGNED",
    canManageWorkOrders: pinDecision.canManageWorkOrders,
    hasResponsibleDepartment: true,
  });
  assert.equal(pinDecision.canManageWorkOrders, false);
  assert.equal(pin.editable, false);
  assert.equal(pin.readOnlyReason, "role");

  const completed = presentWorkOrderResponseRequirement({
    responseRequirement: "IMMEDIATE",
    status: "COMPLETED",
    canManageWorkOrders: true,
    hasResponsibleDepartment: true,
  });
  assert.equal(completed.label, "Immediate");
  assert.equal(completed.editable, false);
  assert.equal(completed.readOnlyReason, "completed");

  const cancelled = presentWorkOrderResponseRequirement({
    responseRequirement: "IMMEDIATE",
    status: "CANCELLED",
    canManageWorkOrders: true,
    hasResponsibleDepartment: true,
  });
  assert.equal(cancelled.editable, false);
  assert.equal(cancelled.readOnlyReason, "cancelled");

  const held = presentWorkOrderResponseRequirement({
    responseRequirement: "IMMEDIATE",
    status: "ON_HOLD",
    canManageWorkOrders: true,
    hasResponsibleDepartment: true,
  });
  assert.equal(held.editable, true);
  const waiting = presentWorkOrderResponseRequirement({
    responseRequirement: "IMMEDIATE",
    status: "WAITING_ON_VENDOR",
    canManageWorkOrders: true,
    hasResponsibleDepartment: true,
  });
  assert.equal(waiting.editable, true);

  assert.equal(presentWorkOrderResponseHistoryLine("OPENED"), "Immediate response required");
  assert.equal(presentWorkOrderResponseHistoryLine("CLEARED"), "Response returned to Standard");
  assert.equal(
    presentWorkOrderResponseHistoryLine("COMPLETED"),
    "Immediate-response Work Order completed",
  );
  assert.equal(
    presentWorkOrderResponseHistoryLine("CANCELLED"),
    "Immediate-response Work Order cancelled",
  );
  assert.equal(presentWorkOrderResponseHistoryLine("OPENED")?.includes("OPENED"), false);
});

test("the Work Order screen changes Response Requirement only through the domain service", () => {
  const source = readFileSync(
    new URL("../../app/(protected)/repairs/actions.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("export async function setWorkOrderResponseRequirementAction");
  assert.ok(start >= 0);
  const next = source.indexOf("export async function ", start + 20);
  const body = source.slice(start, next === -1 ? undefined : next);
  assert.match(body, /setWorkOrderResponseRequirement\(/);
  assert.equal(body.includes("enqueueNotification"), false);
  assert.equal(body.includes("processNotification"), false);
  assert.equal(body.includes("notificationPriority"), false);
  assert.equal(body.includes("dueAt"), false);
  assert.equal(body.includes("assignedEmployeeId"), false);
  assert.equal(body.includes("priority:"), false);
  const create = source.slice(
    source.indexOf("export async function createRepairAction"),
    source.indexOf("export async function ", source.indexOf("export async function createRepairAction") + 20),
  );
  assert.equal(create.includes("responseRequirement"), false);
});
