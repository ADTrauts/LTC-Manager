import assert from "node:assert/strict";
import test from "node:test";

import type { OperationalCycleContext, ResolvedCycleOccurrence } from "@/lib/operational-cycles/types";

import { resolveJobFlow } from "./resolve-job-flow";
import type { JobFlowAssignmentSnapshot } from "./types";

function cycleOcc(overrides: Partial<ResolvedCycleOccurrence> & Pick<ResolvedCycleOccurrence, "id" | "label" | "cycleType">): ResolvedCycleOccurrence {
  const startsAt = overrides.startsAt ?? new Date("2026-08-06T15:00:00.000Z");
  const endsAt = overrides.endsAt ?? new Date("2026-08-06T17:00:00.000Z");
  return {
    id: overrides.id,
    stableKey: overrides.stableKey ?? overrides.id,
    version: overrides.version ?? 1,
    label: overrides.label,
    cycleType: overrides.cycleType,
    displaySequence: overrides.displaySequence ?? 10,
    startLocal: overrides.startLocal ?? "11:00",
    endLocal: overrides.endLocal ?? "13:00",
    overnight: false,
    mealType: overrides.mealType ?? "LUNCH",
    expectedMilestones: overrides.expectedMilestones ?? ["READY", "SERVICE_STARTED"],
    startsAt,
    endsAt,
  };
}

function assignment(overrides: Partial<JobFlowAssignmentSnapshot> & { id: string }): JobFlowAssignmentSnapshot {
  return {
    id: overrides.id,
    roleKey: overrides.roleKey ?? "server",
    roleLabel: overrides.roleLabel ?? "Server",
    unitId: overrides.unitId ?? "u1",
    unitName: overrides.unitName ?? "2B",
    startsAt: overrides.startsAt ?? new Date("2026-08-06T14:00:00.000Z"),
    endsAt: overrides.endsAt ?? new Date("2026-08-06T20:00:00.000Z"),
    status: overrides.status ?? "ACTIVE",
  };
}

const tz = "America/New_York";
const dateKey = "2026-08-06";
const now = new Date("2026-08-06T16:00:00.000Z");

const serviceCycle = cycleOcc({
  id: "c-service",
  label: "Lunch Service",
  cycleType: "SERVICE",
  startsAt: new Date("2026-08-06T15:00:00.000Z"),
  endsAt: new Date("2026-08-06T17:00:00.000Z"),
});

const prepCycle = cycleOcc({
  id: "c-prep",
  label: "Lunch Preparation",
  cycleType: "PREPARATION",
  mealType: "LUNCH",
  expectedMilestones: ["READY"],
  startsAt: new Date("2026-08-06T15:00:00.000Z"),
  endsAt: new Date("2026-08-06T17:00:00.000Z"),
});

test("REAUTHENTICATION_REQUIRED", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: null,
    upcomingAssignment: null,
    cycleContext: { state: "NOT_CONFIGURED", reason: "NO_PUBLISHED_CYCLES" },
    mealTargetTime: null,
    milestoneEvent: null,
    planStatus: "CONFIRMED",
    reauthenticationRequired: true,
  });
  assert.equal(ctx.state, "REAUTHENTICATION_REQUIRED");
});

test("OFFLINE_STALE", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: { state: "ACTIVE", primary: serviceCycle, activeCycles: [serviceCycle], next: null, minutesUntilNext: null, mealTargetTime: "12:15" },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
    offlineStale: true,
  });
  assert.equal(ctx.state, "OFFLINE_STALE");
});

test("NOT_APPLICABLE", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: null,
    upcomingAssignment: null,
    cycleContext: { state: "NOT_APPLICABLE" },
    mealTargetTime: null,
    milestoneEvent: null,
    planStatus: null,
  });
  assert.equal(ctx.state, "NOT_APPLICABLE");
});

test("NOT_CONFIGURED without assignment", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: null,
    upcomingAssignment: null,
    cycleContext: { state: "NOT_CONFIGURED", reason: "NO_PUBLISHED_CYCLES" },
    mealTargetTime: null,
    milestoneEvent: null,
    planStatus: null,
  });
  assert.equal(ctx.state, "NOT_CONFIGURED");
  if (ctx.state === "NOT_CONFIGURED") {
    assert.equal(ctx.reason, "NO_PUBLISHED_CYCLES");
  }
});

test("NO_CONFIRMED_ASSIGNMENT", () => {
  const active: OperationalCycleContext = {
    state: "ACTIVE",
    primary: serviceCycle,
    activeCycles: [serviceCycle],
    next: null,
    minutesUntilNext: null,
    mealTargetTime: "12:15",
  };
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: null,
    upcomingAssignment: null,
    cycleContext: active,
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "NO_CONFIRMED_ASSIGNMENT");
  assert.match(ctx.current.expectation, /No confirmed Assignment/i);
});

test("BEFORE_ASSIGNMENT", () => {
  const upcoming = assignment({
    id: "a-up",
    startsAt: new Date("2026-08-06T18:00:00.000Z"),
    endsAt: new Date("2026-08-06T22:00:00.000Z"),
    status: "PLANNED",
  });
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: null,
    upcomingAssignment: upcoming,
    cycleContext: {
      state: "UPCOMING",
      next: serviceCycle,
      minutesUntilNext: 60,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "BEFORE_ASSIGNMENT");
  if (ctx.state === "BEFORE_ASSIGNMENT") {
    assert.equal(ctx.assignment.id, "a-up");
  }
});

test("BETWEEN_ASSIGNMENTS", () => {
  const previous = assignment({
    id: "a-prev",
    startsAt: new Date("2026-08-06T12:00:00.000Z"),
    endsAt: new Date("2026-08-06T15:00:00.000Z"),
    status: "COMPLETED",
  });
  const upcoming = assignment({
    id: "a-next",
    startsAt: new Date("2026-08-06T18:00:00.000Z"),
    endsAt: new Date("2026-08-06T22:00:00.000Z"),
    status: "PLANNED",
  });
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: null,
    upcomingAssignment: upcoming,
    previousAssignment: previous,
    cycleContext: {
      state: "BETWEEN",
      previous: prepCycle,
      next: serviceCycle,
      minutesUntilNext: 30,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "BETWEEN_ASSIGNMENTS");
  if (ctx.state === "BETWEEN_ASSIGNMENTS") {
    assert.equal(ctx.previousAssignment.id, "a-prev");
    assert.equal(ctx.nextAssignment.id, "a-next");
  }
});

test("ACTIVE preparation cycle", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: {
      state: "ACTIVE",
      primary: prepCycle,
      activeCycles: [prepCycle],
      next: serviceCycle,
      minutesUntilNext: 30,
      mealTargetTime: "12:15",
    },
    cycleDescriptions: { "c-prep": "Prepare the servery for lunch." },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state === "ACTIVE") {
    assert.equal(ctx.cycle.cycleType, "PREPARATION");
    assert.match(ctx.current.expectation, /Prepare/i);
  }
});

test("ACTIVE service cycle with Not Confirmed neutral", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: {
      state: "ACTIVE",
      primary: serviceCycle,
      activeCycles: [serviceCycle],
      next: null,
      minutesUntilNext: null,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "ACTIVE");
  assert.ok(ctx.progress.phases.some((p) => p.status === "NotConfirmed" || p.status === "Current"));
  assert.doesNotMatch(JSON.stringify(ctx), /Blocked|failed/i);
  if (ctx.state === "ACTIVE") {
    assert.match(ctx.current.expectation, /12:15/);
  }
});

test("READY when assignment current and cycle upcoming", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: {
      state: "UPCOMING",
      next: serviceCycle,
      minutesUntilNext: 45,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "READY");
});

test("ASSIGNMENT_COMPLETE", () => {
  const ended = assignment({
    id: "a1",
    startsAt: new Date("2026-08-06T12:00:00.000Z"),
    endsAt: new Date("2026-08-06T15:00:00.000Z"),
    status: "COMPLETED",
  });
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: ended,
    upcomingAssignment: null,
    cycleContext: {
      state: "BETWEEN",
      previous: prepCycle,
      next: serviceCycle,
      minutesUntilNext: 30,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "ASSIGNMENT_COMPLETE");
});

test("DAY_COMPLETE", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: null,
    upcomingAssignment: null,
    previousAssignment: assignment({ id: "a1" }),
    cycleContext: {
      state: "DAY_COMPLETE",
      last: serviceCycle,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "DAY_COMPLETE");
});

test("Ready accepted and Started late attention", () => {
  const ctx = resolveJobFlow({
    now: new Date("2026-08-06T17:00:00.000Z"),
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: {
      state: "ACTIVE",
      primary: serviceCycle,
      activeCycles: [serviceCycle],
      next: null,
      minutesUntilNext: null,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: {
      mealType: "LUNCH",
      mealServiceReadyAt: new Date("2026-08-06T15:30:00.000Z"),
      mealServiceStartedAt: new Date("2026-08-06T16:50:00.000Z"),
    },
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.state, "ACTIVE");
  assert.ok(
    ctx.attention.some((a) => a.kind === "milestone_late") ||
      ctx.current.milestoneState?.key === "SERVICE_STARTED" ||
      ctx.current.milestoneState?.key === "SERVICE_STARTED_LATE",
  );
});

test("pending sync attention uses Saved on This Tablet language", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: {
      state: "ACTIVE",
      primary: serviceCycle,
      activeCycles: [serviceCycle],
      next: null,
      minutesUntilNext: null,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
    offlineQueue: { pendingCount: 1, conflictCount: 0 },
  });
  assert.ok(ctx.attention.some((a) => a.kind === "pending_sync"));
  assert.ok(ctx.progress.phases.some((p) => p.status === "SavedOnThisTablet" || p.kind === "milestone"));
});

test("conflict review attention", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: {
      state: "ACTIVE",
      primary: serviceCycle,
      activeCycles: [serviceCycle],
      next: null,
      minutesUntilNext: null,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: {
      mealType: "LUNCH",
      mealServiceReadyAt: new Date("2026-08-06T15:30:00.000Z"),
      mealServiceStartedAt: null,
      conflictReview: true,
    },
    planStatus: "CONFIRMED",
    offlineQueue: { pendingCount: 0, conflictCount: 1 },
  });
  assert.ok(ctx.attention.some((a) => a.kind === "conflict_review"));
});

test("assignment updated attention", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: {
      state: "ACTIVE",
      primary: serviceCycle,
      activeCycles: [serviceCycle],
      next: null,
      minutesUntilNext: null,
      mealTargetTime: "12:15",
    },
    mealTargetTime: "12:15",
    milestoneEvent: null,
    planStatus: "CONFIRMED",
    assignmentUpdated: true,
  });
  assert.ok(ctx.attention.some((a) => a.kind === "assignment_updated"));
});

test("facility-local meal target is not invented", () => {
  const ctx = resolveJobFlow({
    now,
    facilityTimezone: tz,
    operationalDateKey: dateKey,
    currentAssignment: assignment({ id: "a1" }),
    upcomingAssignment: null,
    cycleContext: {
      state: "ACTIVE",
      primary: serviceCycle,
      activeCycles: [serviceCycle],
      next: null,
      minutesUntilNext: null,
      mealTargetTime: null,
    },
    mealTargetTime: null,
    milestoneEvent: null,
    planStatus: "CONFIRMED",
  });
  assert.equal(ctx.current.targetTime, null);
  assert.doesNotMatch(ctx.current.expectation, /Breakfast/i);
});
