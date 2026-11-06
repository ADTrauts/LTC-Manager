import assert from "node:assert/strict";
import test from "node:test";

import { evaluateWorkOrderDueState, workOrderDeadlineFromCivilDate } from "./work-order-due-state";

const now = new Date("2026-07-16T04:30:00.000Z");

test("an open Work Order is overdue at the deadline instant and not before", () => {
  const due = new Date("2026-07-16T04:30:00.000Z");
  assert.equal(evaluateWorkOrderDueState({ status: "OPEN", dueAt: due, now }), "OVERDUE");
  assert.equal(
    evaluateWorkOrderDueState({
      status: "ASSIGNED",
      dueAt: new Date("2026-07-16T04:31:00.000Z"),
      now,
    }),
    "NOT_DUE",
  );
  assert.equal(evaluateWorkOrderDueState({ status: "IN_PROGRESS", dueAt: null, now }), "NOT_APPLICABLE");
});

test("hold and vendor waiting do not pause the deadline", () => {
  const due = new Date("2026-07-16T04:00:00.000Z");
  for (const status of ["ON_HOLD", "WAITING_ON_VENDOR", "OPEN", "ASSIGNED", "IN_PROGRESS"]) {
    assert.equal(evaluateWorkOrderDueState({ status, dueAt: due, now }), "OVERDUE");
  }
});

test("completed and cancelled Work Orders are not overdue", () => {
  const due = new Date("2026-07-16T04:00:00.000Z");
  assert.equal(evaluateWorkOrderDueState({ status: "COMPLETED", dueAt: due, now }), "NOT_APPLICABLE");
  assert.equal(evaluateWorkOrderDueState({ status: "CANCELLED", dueAt: due, now }), "NOT_APPLICABLE");
});

test("the same UTC instant is overdue in New York and not yet overdue in Chicago", () => {
  const scheduled = "2026-07-15";
  const newYork = workOrderDeadlineFromCivilDate(scheduled, "America/New_York");
  const chicago = workOrderDeadlineFromCivilDate(scheduled, "America/Chicago");
  assert.equal(newYork.toISOString(), "2026-07-16T04:00:00.000Z");
  assert.equal(chicago.toISOString(), "2026-07-16T05:00:00.000Z");
  assert.equal(evaluateWorkOrderDueState({ status: "OPEN", dueAt: newYork, now }), "OVERDUE");
  assert.equal(evaluateWorkOrderDueState({ status: "OPEN", dueAt: chicago, now }), "NOT_DUE");
});
