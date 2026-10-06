import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getDepartmentProduct } from "@/lib/department-products";
import { presentRequesterStatus } from "@/lib/operational-requests/request-semantics";

import { issueStatusesForListView, presentIssueAuthority } from "./issue-semantics";
import { parseRepairQueueFilter, repairMatchesQueueFilter } from "./repair-presentation";

test("Facility Plant Operations remains DEVELOPMENT", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
});

test("Work Order complete is not written as Issue or Request resolution", () => {
  const source = readFileSync(new URL("./corrective-maintenance.ts", import.meta.url), "utf8");
  assert.match(source, /never resolves an Issue/);
  assert.match(source, /Default: do not alter Request authority/);
  assert.match(source, /export async function triageRequestCreateIssue/);
  assert.match(source, /export async function triageRequestLinkIssue/);
  assert.match(source, /export async function triageRequestCreateIssueAndWorkOrder/);
  assert.match(source, /export async function declineRequest/);
  assert.match(source, /export async function resolveIssueOptionallyRequests/);
  assert.match(source, /export async function createIssueFromRecord/);
  assert.doesNotMatch(source, /laborRate|partsUsed|closeoutGate/);
});

test("Issue list views stay condition states, not Work Order execution", () => {
  assert.deepEqual(issueStatusesForListView("OPEN"), ["REPORTED", "ACKNOWLEDGED", "TRIAGED"]);
  assert.equal(presentIssueAuthority("MONITORING"), "MONITORING");
  assert.equal(presentIssueAuthority("IN_PROGRESS"), "OPEN");
});

test("requester IN_PROGRESS may derive from any linked Work Order", () => {
  assert.equal(
    presentRequesterStatus({
      status: "UNDER_REVIEW",
      linkedWorkOrderStatuses: ["COMPLETED", "ON_HOLD"],
    }),
    "IN_PROGRESS",
  );
  assert.equal(
    presentRequesterStatus({
      status: "UNDER_REVIEW",
      linkedWorkOrderStatuses: ["COMPLETED"],
    }),
    "ACCEPTED",
  );
});

test("Work Order queue exposes operational exception filters", () => {
  assert.equal(parseRepairQueueFilter("URGENT"), "URGENT");
  assert.equal(parseRepairQueueFilter("MINE"), "MINE");
  assert.equal(
    repairMatchesQueueFilter("OPEN", "UNASSIGNED", { assignedEmployeeId: null }),
    true,
  );
  assert.equal(
    repairMatchesQueueFilter("IN_PROGRESS", "MINE", {
      assignedEmployeeId: "e1",
      viewerEmployeeId: "e1",
    }),
    true,
  );
});
