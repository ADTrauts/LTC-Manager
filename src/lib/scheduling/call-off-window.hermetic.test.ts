import assert from "node:assert/strict";
import test from "node:test";

import { parseFacilityLocalScheduledStartOnDate } from "@/lib/operational-time";

import {
  calledOffShiftCoversInstant,
  calledOffShiftExcludesAssignment,
  type CalledOffShift,
} from "./call-off-window";

const zone = "America/New_York";
const day = "2026-10-29";

function shift(partial: Partial<CalledOffShift> = {}): CalledOffShift {
  return {
    employeeId: "a",
    departmentId: "dietary",
    serviceDateKey: day,
    plannedStart: "07:00",
    plannedEnd: "15:00",
    ...partial,
  };
}

test("a call-off removes the whole shift, including time before calledOffAt", () => {
  const morning = parseFacilityLocalScheduledStartOnDate("08:00", day, zone)!;
  const afternoon = parseFacilityLocalScheduledStartOnDate("14:00", day, zone)!;
  const recordedAtNoon = parseFacilityLocalScheduledStartOnDate("12:00", day, zone)!;
  assert.equal(
    calledOffShiftCoversInstant({
      plannedStart: "07:00",
      plannedEnd: "15:00",
      serviceDateKey: day,
      at: morning,
      timeZone: zone,
    }),
    true,
  );
  assert.equal(
    calledOffShiftCoversInstant({
      plannedStart: "07:00",
      plannedEnd: "15:00",
      serviceDateKey: day,
      at: afternoon,
      timeZone: zone,
    }),
    true,
  );
  assert.ok(recordedAtNoon.getTime() > morning.getTime());
  assert.equal(
    calledOffShiftExcludesAssignment({
      shift: shift(),
      assignment: {
        employeeId: "a",
        departmentId: "dietary",
        serviceDateKey: day,
        startsAt: morning,
        endsAt: parseFacilityLocalScheduledStartOnDate("10:00", day, zone),
      },
      timeZone: zone,
    }),
    true,
  );
});

test("an evening assignment survives a morning call-off", () => {
  assert.equal(
    calledOffShiftExcludesAssignment({
      shift: shift(),
      assignment: {
        employeeId: "a",
        departmentId: "dietary",
        serviceDateKey: day,
        startsAt: parseFacilityLocalScheduledStartOnDate("16:00", day, zone),
        endsAt: parseFacilityLocalScheduledStartOnDate("20:00", day, zone),
      },
      timeZone: zone,
    }),
    false,
  );
});

test("a call-off in another Department does not remove the Assignment", () => {
  assert.equal(
    calledOffShiftExcludesAssignment({
      shift: shift({ departmentId: "plant" }),
      assignment: {
        employeeId: "a",
        departmentId: "dietary",
        serviceDateKey: day,
        startsAt: parseFacilityLocalScheduledStartOnDate("08:00", day, zone),
        endsAt: parseFacilityLocalScheduledStartOnDate("10:00", day, zone),
      },
      timeZone: zone,
    }),
    false,
  );
});

test("a cross-midnight call-off covers the overnight interval", () => {
  const late = parseFacilityLocalScheduledStartOnDate("21:00", day, zone)!;
  const earlyNext = parseFacilityLocalScheduledStartOnDate("06:00", "2026-10-30", zone)!;
  const nextAfternoon = parseFacilityLocalScheduledStartOnDate("12:00", "2026-10-30", zone)!;
  assert.equal(
    calledOffShiftCoversInstant({
      plannedStart: "19:00",
      plannedEnd: "07:00",
      serviceDateKey: day,
      at: late,
      timeZone: zone,
    }),
    true,
  );
  assert.equal(
    calledOffShiftCoversInstant({
      plannedStart: "19:00",
      plannedEnd: "07:00",
      serviceDateKey: day,
      at: earlyNext,
      timeZone: zone,
    }),
    true,
  );
  assert.equal(
    calledOffShiftExcludesAssignment({
      shift: shift({ plannedStart: "19:00", plannedEnd: "07:00" }),
      assignment: {
        employeeId: "a",
        departmentId: "dietary",
        serviceDateKey: "2026-10-30",
        startsAt: earlyNext,
        endsAt: parseFacilityLocalScheduledStartOnDate("07:00", "2026-10-30", zone),
      },
      timeZone: zone,
    }),
    true,
  );
  assert.equal(
    calledOffShiftCoversInstant({
      plannedStart: "19:00",
      plannedEnd: "07:00",
      serviceDateKey: day,
      at: nextAfternoon,
      timeZone: zone,
    }),
    false,
  );
});
