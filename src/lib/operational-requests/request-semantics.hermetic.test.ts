import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isLegacyRequestExecutionStatus,
  presentRequestAuthority,
  presentRequesterStatus,
  requesterProjectedStatusLabel,
  requesterVisibleStatusLabel,
} from "@/lib/operational-requests";

test("legacy ACTIVE-shaped Request statuses remain readable as labels", () => {
  assert.equal(requesterVisibleStatusLabel("WORK_IN_PROGRESS"), "Work in progress");
  assert.equal(requesterVisibleStatusLabel("WAITING_ON_VENDOR"), "Waiting on vendor");
  assert.equal(isLegacyRequestExecutionStatus("WORK_IN_PROGRESS"), true);
  assert.equal(isLegacyRequestExecutionStatus("UNDER_REVIEW"), false);
});

test("Request authority is intake/outcome, not Work Order execution", () => {
  assert.equal(presentRequestAuthority("REPORTED"), "RECEIVED");
  assert.equal(presentRequestAuthority("ACKNOWLEDGED"), "RECEIVED");
  assert.equal(presentRequestAuthority("UNDER_REVIEW"), "ACCEPTED");
  assert.equal(presentRequestAuthority("WORK_ASSIGNED"), "ACCEPTED");
  assert.equal(presentRequestAuthority("WORK_IN_PROGRESS"), "ACCEPTED");
  assert.equal(presentRequestAuthority("WAITING_ON_VENDOR"), "ACCEPTED");
  assert.equal(presentRequestAuthority("CANCELLED"), "DECLINED");
  assert.equal(presentRequestAuthority("RESOLVED", null), "RESOLVED_WITHOUT_WORK");
  assert.equal(presentRequestAuthority("RESOLVED", "wo-1"), "CLOSED");
  assert.equal(presentRequestAuthority("CLOSED"), "CLOSED");
});

test("requester projection can show IN_PROGRESS from linked work without stored WO status", () => {
  assert.equal(
    presentRequesterStatus({
      status: "UNDER_REVIEW",
      workOrderId: "wo-1",
      workOrderStatus: "IN_PROGRESS",
    }),
    "IN_PROGRESS",
  );
  assert.equal(
    presentRequesterStatus({
      status: "UNDER_REVIEW",
      workOrderId: "wo-1",
      workOrderStatus: "WAITING_ON_VENDOR",
    }),
    "IN_PROGRESS",
  );
  assert.equal(
    presentRequesterStatus({
      status: "UNDER_REVIEW",
      workOrderId: "wo-1",
      workOrderStatus: "COMPLETED",
    }),
    "ACCEPTED",
  );
  assert.equal(requesterProjectedStatusLabel("IN_PROGRESS"), "In progress");
  assert.equal(
    presentRequesterStatus({
      status: "UNDER_REVIEW",
      linkedWorkOrderStatuses: ["OPEN", "IN_PROGRESS"],
    }),
    "IN_PROGRESS",
  );
});

test("historical WO-shaped Request statuses still project IN_PROGRESS", () => {
  assert.equal(
    presentRequesterStatus({ status: "WORK_IN_PROGRESS" }),
    "IN_PROGRESS",
  );
  assert.equal(
    presentRequesterStatus({ status: "WAITING_ON_VENDOR" }),
    "IN_PROGRESS",
  );
  assert.equal(presentRequesterStatus({ status: "REPORTED" }), "RECEIVED");
  assert.equal(presentRequesterStatus({ status: "CANCELLED" }), "DECLINED");
  assert.equal(presentRequesterStatus({ status: "RESOLVED" }), "RESOLVED");
});

test("technician Work Order progress is not written onto Request.status", () => {
  const source = readFileSync(new URL("../asset-operations/work-order-service.ts", import.meta.url), "utf8");
  assert.match(source, /Work Order execution status is not copied onto OperationalRequest.status/);
  assert.doesNotMatch(source, /"WORK_IN_PROGRESS"/);
  assert.doesNotMatch(source, /assignedEmployeeId \? "WORK_ASSIGNED"/);
  assert.match(source, /Request authority stays intake\/outcome/);
});
