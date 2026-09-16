import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assignOverlapLanes,
  buildTemporalTicks,
  minutesFromLocalHhMm,
  offsetOnTrack,
  percentOnTrack,
} from "@/lib/design-system/temporal-strip-math";
import { cycleRootToTemporalStrip } from "@/lib/operational-cycles/cycle-temporal-strip";

describe("temporal-strip-math", () => {
  it("parses local clock minutes", () => {
    assert.equal(minutesFromLocalHhMm("5:30"), 5 * 60 + 30);
    assert.equal(minutesFromLocalHhMm("17:00"), 17 * 60);
    assert.equal(minutesFromLocalHhMm("bad"), null);
  });

  it("positions offsets proportionally on a same-day track", () => {
    const trackStart = 5 * 60 + 30; // 5:30
    const trackEnd = 10 * 60; // 10:00
    const due = offsetOnTrack({
      trackStartMinutes: trackStart,
      trackEndMinutes: trackEnd,
      overnight: false,
      absoluteMinutes: 8 * 60, // 8:00
    });
    assert.equal(due.duration, 4 * 60 + 30);
    assert.equal(due.offset, 2 * 60 + 30);
    assert.equal(due.outOfRange, false);
    assert.ok(Math.abs(percentOnTrack(due.offset, due.duration) - (150 / 270) * 100) < 0.01);
  });

  it("Dinner Prep ending at Due shares horizontal position", () => {
    const trackStart = 15 * 60 + 30; // 3:30
    const trackEnd = 20 * 60; // 8:00
    const prepEnd = offsetOnTrack({
      trackStartMinutes: trackStart,
      trackEndMinutes: trackEnd,
      overnight: false,
      absoluteMinutes: 17 * 60, // 5:00
    });
    const due = offsetOnTrack({
      trackStartMinutes: trackStart,
      trackEndMinutes: trackEnd,
      overnight: false,
      absoluteMinutes: 17 * 60,
    });
    assert.equal(prepEnd.offset, due.offset);
  });

  it("marks out-of-range times without rejecting them", () => {
    const placed = offsetOnTrack({
      trackStartMinutes: 5 * 60 + 30,
      trackEndMinutes: 10 * 60,
      overnight: false,
      absoluteMinutes: 4 * 60, // before start
    });
    assert.equal(placed.outOfRange, true);
  });

  it("assigns overlap lanes deterministically", () => {
    const lanes = assignOverlapLanes([
      { id: "a", startOffset: 0, endOffset: 100 },
      { id: "b", startOffset: 50, endOffset: 150 },
      { id: "c", startOffset: 100, endOffset: 120 },
    ]);
    assert.equal(lanes.get("a"), 0);
    assert.equal(lanes.get("b"), 1);
    assert.equal(lanes.get("c"), 0);
  });

  it("builds restrained ticks", () => {
    const ticks = buildTemporalTicks({
      trackStartMinutes: 5 * 60 + 30,
      durationMinutes: 4 * 60 + 30,
      formatLabel: (m) => String(m),
    });
    assert.ok(ticks.length >= 2);
    assert.equal(ticks[0]!.offset, 0);
    assert.equal(ticks[ticks.length - 1]!.offset, 4 * 60 + 30);
  });
});

describe("cycleRootToTemporalStrip", () => {
  it("maps Breakfast Prep / Due / Cleanup proportionally", () => {
    const model = cycleRootToTemporalStrip({
      root: {
        id: "breakfast",
        stableKey: "breakfast",
        label: "Breakfast",
        parentStableKey: null,
        nodeKind: "PERIOD",
        startLocal: "05:30",
        endLocal: "10:00",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        spaceIds: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"],
      },
      descendants: [
        {
          id: "prep",
          stableKey: "prep",
          label: "Prep",
          parentStableKey: "breakfast",
          nodeKind: "PERIOD",
          startLocal: "05:30",
          endLocal: "07:10",
          locationInheritFromParent: true,
        },
        {
          id: "due",
          stableKey: "due",
          label: "Breakfast Due",
          parentStableKey: "breakfast",
          nodeKind: "KEY_TIME",
          startLocal: null,
          endLocal: null,
          keyTimeGroups: [
            { dueLocal: "07:45", spaceIds: ["a", "b", "c", "d"] },
            { dueLocal: "08:00", spaceIds: ["e", "f", "g", "h", "i"] },
          ],
        },
        {
          id: "cleanup",
          stableKey: "cleanup",
          label: "Cleanup",
          parentStableKey: "breakfast",
          nodeKind: "PERIOD",
          startLocal: "09:00",
          endLocal: "10:00",
          locationInheritFromParent: true,
        },
      ],
    });

    assert.ok(model);
    assert.equal(model!.durationMinutes, 270);
    const prep = model!.spans.find((s) => s.id === "prep");
    const cleanup = model!.spans.find((s) => s.id === "cleanup");
    const due = model!.points.find((p) => p.id === "due");
    assert.ok(prep);
    assert.ok(cleanup);
    assert.ok(due);
    assert.equal(prep!.startOffset, 0);
    assert.equal(prep!.endOffset, 100); // 7:10 - 5:30 = 100
    assert.equal(due!.offset, 135); // first group 7:45
    assert.ok(due!.sublabels && due!.sublabels.length === 2);
    assert.equal(cleanup!.startOffset, 210); // 9:00
    assert.equal(cleanup!.endOffset, 270);
  });

  it("remains generic for EVS-style labels", () => {
    const model = cycleRootToTemporalStrip({
      root: {
        id: "morning",
        stableKey: "morning",
        label: "Morning Operations",
        parentStableKey: null,
        nodeKind: "PERIOD",
        startLocal: "06:00",
        endLocal: "11:00",
      },
      descendants: [
        {
          id: "complete",
          stableKey: "complete",
          label: "Resident Rooms Complete",
          parentStableKey: "morning",
          nodeKind: "KEY_TIME",
          startLocal: null,
          endLocal: null,
          keyTimeGroups: [{ dueLocal: "09:30", spaceIds: ["r1"] }],
        },
      ],
    });
    assert.ok(model);
    assert.match(model!.ariaLabel, /Morning Operations/);
    assert.equal(model!.points[0]!.label, "Resident Rooms Complete");
    assert.equal(/breakfast|meal/i.test(JSON.stringify(model)), false);
  });

  it("flags phases outside the parent period", () => {
    const model = cycleRootToTemporalStrip({
      root: {
        id: "p",
        stableKey: "p",
        label: "Period",
        parentStableKey: null,
        nodeKind: "PERIOD",
        startLocal: "08:00",
        endLocal: "10:00",
      },
      descendants: [
        {
          id: "late",
          stableKey: "late",
          label: "Late Phase",
          parentStableKey: "p",
          nodeKind: "PERIOD",
          startLocal: "10:30",
          endLocal: "11:00",
        },
      ],
    });
    assert.ok(model);
    const late = model!.spans.find((s) => s.id === "late");
    assert.equal(late?.outOfRange, true);
    assert.equal(late?.state, "attention");
  });
});
