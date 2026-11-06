import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isNotificationEventType, type NotificationEventType } from "./event-types";
import { isLivePublisherEnabled, LIVE_PUBLISHER_ENABLED } from "./live-publishers";
import { parseNotificationPayload } from "./payload";
import {
  assignmentAttentionThreadKey,
  coverageAttentionThreadKey,
  type CoverageAttentionThread,
} from "./thread-key";

const breakfast: CoverageAttentionThread = {
  kind: "coverage",
  facilityId: "facility-a",
  serviceDate: "2026-10-29",
  departmentId: "department-dietary",
  spaceId: "space-1b",
  responsibility: "DIETARY_SUPERVISOR_ROUNDING",
  cycleStableKey: "breakfast",
  episodeId: "episode-breakfast",
};

test("known notification event names are accepted and arbitrary names are not", () => {
  const known: NotificationEventType = "coverage.became_at_risk";
  const reserved: NotificationEventType = "chat.message.created";
  const keyPoint: NotificationEventType = "milestone.overdue";
  assert.equal(isNotificationEventType(known), true);
  assert.equal(isNotificationEventType(reserved), true);
  assert.equal(isNotificationEventType(keyPoint), true);
  assert.equal(isNotificationEventType("not.an.event"), false);
  assert.equal(isNotificationEventType("readiness.at_risk"), false);

  // @ts-expect-error arbitrary event names are outside the catalog
  const rejected: NotificationEventType = "not.an.event";
  assert.equal(rejected, "not.an.event");
});

test("coverage thread identity ignores priority and condition and keeps the service grain", () => {
  const atRisk = coverageAttentionThreadKey(breakfast);
  const uncovered = coverageAttentionThreadKey({ ...breakfast });
  assert.equal(atRisk, uncovered);
  assert.equal(atRisk.includes("AT_RISK"), false);
  assert.equal(atRisk.includes("URGENT"), false);
  assert.equal(atRisk.includes("breakfast"), true);

  const lunch = coverageAttentionThreadKey({ ...breakfast, cycleStableKey: "lunch" });
  const otherFacility = coverageAttentionThreadKey({ ...breakfast, facilityId: "facility-b" });
  const nextDay = coverageAttentionThreadKey({ ...breakfast, serviceDate: "2026-10-30" });
  const otherDepartment = coverageAttentionThreadKey({
    ...breakfast,
    departmentId: "department-evs",
  });
  const otherSpace = coverageAttentionThreadKey({ ...breakfast, spaceId: "space-2a" });
  const otherResponsibility = coverageAttentionThreadKey({
    ...breakfast,
    responsibility: "COOK",
  });
  const laterEpisode = coverageAttentionThreadKey({
    ...breakfast,
    episodeId: "episode-later",
  });

  assert.notEqual(atRisk, lunch);
  assert.notEqual(atRisk, otherFacility);
  assert.notEqual(atRisk, nextDay);
  assert.notEqual(atRisk, otherDepartment);
  assert.notEqual(atRisk, otherSpace);
  assert.notEqual(atRisk, otherResponsibility);
  assert.notEqual(atRisk, laterEpisode);

  const priorityIsNotIdentity: "priority" extends keyof CoverageAttentionThread ? true : false = false;
  const conditionIsNotIdentity: "condition" extends keyof CoverageAttentionThread ? true : false = false;
  assert.equal(priorityIsNotIdentity, false);
  assert.equal(conditionIsNotIdentity, false);
});

test("coverage thread key rejects a service date that is not a facility civil date", () => {
  assert.throws(
    () => coverageAttentionThreadKey({ ...breakfast, serviceDate: "10/29/2026" }),
    /YYYY-MM-DD/,
  );
  assert.throws(
    () => coverageAttentionThreadKey({ ...breakfast, serviceDate: "2026-02-31" }),
    /real calendar date/,
  );
  assert.throws(
    () => coverageAttentionThreadKey({ ...breakfast, responsibility: "  " }),
    /responsibility/,
  );
});

test("an assignment change is its own episode", () => {
  const first = assignmentAttentionThreadKey({
    kind: "assignment",
    facilityId: "facility-a",
    assignmentId: "assignment-1",
    assignmentEventId: "event-1",
  });
  const repeat = assignmentAttentionThreadKey({
    kind: "assignment",
    facilityId: "facility-a",
    assignmentId: "assignment-1",
    assignmentEventId: "event-1",
  });
  const nextChange = assignmentAttentionThreadKey({
    kind: "assignment",
    facilityId: "facility-a",
    assignmentId: "assignment-1",
    assignmentEventId: "event-2",
  });
  assert.equal(first, repeat);
  assert.notEqual(first, nextChange);
  assert.equal(first.includes("2026-10-29"), false);

  const missingEvent = parseNotificationPayload({
    eventType: "assignment.changed",
    facilityId: "facility-a",
    departmentId: "department-1",
    payload: {
      assignmentId: "assignment-1",
      serviceDate: "2026-10-29",
      assigneeEmployeeId: "employee-1",
      serviceState: "inactive",
    },
  });
  assert.equal(missingEvent.ok, false);
});

test("assignment changes and coverage state transitions are live publishers", () => {
  assert.deepEqual(LIVE_PUBLISHER_ENABLED, [
    "assignment.changed",
    "coverage.became_at_risk",
    "coverage.became_uncovered",
    "coverage.restored",
    "attention.reevaluate",
    "attention.expired",
    "milestone.overdue",
    "milestone.recorded",
    "milestone.deadline_moved",
    "work_order.assigned",
    "work_order.assignment_ended",
    "work_order.overdue",
    "work_order.overdue_resolved",
    "work_order.overdue_ended",
    "work_order.intervention_required",
    "work_order.intervention_cleared",
    "work_order.intervention_completed",
    "work_order.intervention_cancelled",
    "evidence.failed",
    "issue.created",
    "asset.out_of_service",
    "asset.returned_to_service",
    "asset.outage_ended",
  ]);
  assert.equal(isLivePublisherEnabled("assignment.changed"), true);
  assert.equal(isLivePublisherEnabled("coverage.became_uncovered"), true);
  assert.equal(isLivePublisherEnabled("coverage.restored"), true);
  assert.equal(isLivePublisherEnabled("work_order.assigned"), true);
  assert.equal(isLivePublisherEnabled("work_order.assignment_ended"), true);
  assert.equal(isLivePublisherEnabled("work_order.overdue"), true);
  assert.equal(isLivePublisherEnabled("work_order.intervention_required"), true);
  assert.equal(isLivePublisherEnabled("work_order.intervention_cleared"), true);
  assert.equal(isLivePublisherEnabled("work_order.intervention_completed"), true);
  assert.equal(isLivePublisherEnabled("work_order.intervention_cancelled"), true);
  assert.equal(isLivePublisherEnabled("evidence.failed"), true);
  assert.equal(isLivePublisherEnabled("issue.created"), true);
  assert.equal(isLivePublisherEnabled("asset.out_of_service"), true);
  assert.equal(isLivePublisherEnabled("asset.returned_to_service"), true);
  assert.equal(isLivePublisherEnabled("asset.outage_ended"), true);
  assert.equal(isLivePublisherEnabled("corrective_action.overdue"), false);

  const actions = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../app/(protected)/staffing/assignments/actions.ts"),
    "utf8",
  );
  assert.equal(actions.split("writeAssignmentChangeAttention(").length - 1, 5);
  assert.equal(actions.split("processNotificationOutboxAfterCommit(").length - 1, 5);
  const template = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../scheduling/operational-assignments/apply-assignment-template.ts",
    ),
    "utf8",
  );
  assert.equal(template.includes("enqueueAssignmentChanged"), false);
  const callOff = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../scheduling/people-coverage.ts"),
    "utf8",
  );
  assert.equal(callOff.includes("enqueueAssignmentChanged"), false);
});
