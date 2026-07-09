import assert from "node:assert/strict";
import test from "node:test";

import { LogSubmissionStatus, MealType } from "@prisma/client";

import {
  isLogAssignmentInDueScope,
  resolveLogDueMealScope,
  scopeLogDueQueries,
} from "@/lib/operations/scope-log-due-queries";
import type { ResolvedActiveOperation } from "@/lib/operations/types";

const assignments = [
  {
    id: "a-breakfast",
    mealType: MealType.BREAKFAST,
    timesPerDay: 1,
    template: { name: "Breakfast temp" },
  },
  {
    id: "a-lunch",
    mealType: MealType.LUNCH,
    timesPerDay: 2,
    template: { name: "Lunch temp" },
  },
  {
    id: "a-daily",
    mealType: null,
    timesPerDay: 1,
    template: { name: "Sanitizer" },
  },
];

const submissions = [
  {
    id: "s-breakfast",
    assignmentId: "a-breakfast",
    status: LogSubmissionStatus.COMPLETED,
    mealType: MealType.BREAKFAST,
    template: { name: "Breakfast temp" },
  },
  {
    id: "s-lunch-failed",
    assignmentId: "a-lunch",
    status: LogSubmissionStatus.FAILED,
    mealType: MealType.LUNCH,
    template: { name: "Lunch temp" },
  },
  {
    id: "s-daily",
    assignmentId: "a-daily",
    status: LogSubmissionStatus.COMPLETED,
    mealType: null,
    template: { name: "Sanitizer" },
  },
];

function lunchInstanceOperation(): Pick<ResolvedActiveOperation, "source" | "operationContext"> {
  return {
    source: "operation_instance",
    operationContext: {
      mealType: MealType.LUNCH,
      mealLabel: "Lunch",
      serviceLabel: "Lunch service",
      phase: "Execution",
      scheduledTimeLabel: "12:00 PM",
      minutesUntilService: 15,
    },
  };
}

function evsInstanceOperation(): Pick<ResolvedActiveOperation, "source" | "operationContext"> {
  return {
    source: "operation_instance",
    operationContext: {
      mealType: MealType.BREAKFAST,
      mealLabel: "Morning EVS round",
      serviceLabel: "Morning EVS round",
      phase: "Preparation",
      scheduledTimeLabel: null,
      minutesUntilService: null,
    },
  };
}

test("resolveLogDueMealScope returns undefined when operation engine flag is off", () => {
  assert.equal(resolveLogDueMealScope(lunchInstanceOperation(), false), undefined);
});

test("scopeLogDueQueries leaves rows unchanged when operation engine flag is off", () => {
  const scoped = scopeLogDueQueries({
    assignments,
    submissions,
    activeOperation: lunchInstanceOperation(),
    engineEnabled: false,
  });

  assert.equal(scoped.assignments.length, assignments.length);
  assert.equal(scoped.submissions.length, submissions.length);
});

test("scopeLogDueQueries narrows to active meal-bound operation instance", () => {
  const scoped = scopeLogDueQueries({
    assignments,
    submissions,
    activeOperation: lunchInstanceOperation(),
    engineEnabled: true,
  });

  assert.deepEqual(
    scoped.assignments.map((assignment) => assignment.id),
    ["a-lunch", "a-daily"],
  );
  assert.deepEqual(
    scoped.submissions.map((submission) => submission.id),
    ["s-lunch-failed", "s-daily"],
  );
});

test("scopeLogDueQueries falls back when no operation instance is active", () => {
  const scoped = scopeLogDueQueries({
    assignments,
    submissions,
    activeOperation: {
      source: "heuristic",
      operationContext: lunchInstanceOperation().operationContext,
    },
    engineEnabled: true,
  });

  assert.equal(scoped.assignments.length, assignments.length);
  assert.equal(scoped.submissions.length, submissions.length);
});

test("scopeLogDueQueries does not narrow for non-meal operation instances", () => {
  const scoped = scopeLogDueQueries({
    assignments,
    submissions,
    activeOperation: evsInstanceOperation(),
    engineEnabled: true,
  });

  assert.equal(scoped.assignments.length, assignments.length);
  assert.equal(scoped.submissions.length, submissions.length);
});

test("isLogAssignmentInDueScope keeps meal-agnostic assignments when scoped", () => {
  assert.equal(isLogAssignmentInDueScope({ mealType: null }, MealType.LUNCH), true);
  assert.equal(isLogAssignmentInDueScope({ mealType: MealType.BREAKFAST }, MealType.LUNCH), false);
});
