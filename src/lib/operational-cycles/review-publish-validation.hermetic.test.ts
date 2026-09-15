import assert from "node:assert/strict";
import test from "node:test";

import {
  isImmediatePublishTestingOverrideEnabled,
} from "./index";
import { presentHierarchicalCycleReview } from "./present-hierarchical-review";
import {
  formatReviewPublishBlockerSummary,
  validateDraftsForReviewPublish,
} from "./review-publish-validation";
import type { CycleDraftChange, CycleLifecycleRow } from "./cycle-lifecycle";
import type { OperationalCycleDefinition } from "./types";

function cycle(
  partial: Partial<OperationalCycleDefinition> &
    Pick<OperationalCycleDefinition, "stableKey" | "label">,
): OperationalCycleDefinition {
  return {
    id: partial.id ?? `id-${partial.stableKey}`,
    stableKey: partial.stableKey,
    parentStableKey: partial.parentStableKey ?? null,
    nodeKind: partial.nodeKind ?? "PERIOD",
    version: partial.version ?? 1,
    label: partial.label,
    description: partial.description ?? null,
    cycleType: partial.cycleType ?? "CUSTOM",
    displaySequence: partial.displaySequence ?? 10,
    startLocal: partial.startLocal ?? (partial.nodeKind === "KEY_TIME" ? null : "07:00"),
    endLocal: partial.endLocal ?? (partial.nodeKind === "KEY_TIME" ? null : "10:00"),
    overnight: partial.overnight ?? false,
    applicableDaysOfWeek: partial.applicableDaysOfWeek ?? [1, 2, 3, 4, 5, 6, 0],
    effectiveFrom: partial.effectiveFrom ?? new Date("2026-08-01"),
    effectiveTo: partial.effectiveTo ?? null,
    mealType: partial.mealType ?? null,
    locationMode: partial.locationMode ?? "EXPLICIT_UNITS",
    locationInheritFromParent: partial.locationInheritFromParent ?? false,
    applicableUnitTypes: partial.applicableUnitTypes ?? [],
    roomTypeKey: partial.roomTypeKey ?? null,
    expectedMilestones: partial.expectedMilestones ?? [],
    status: partial.status ?? "DRAFT",
    unitIds: partial.unitIds ?? [],
    spaceIds: partial.spaceIds ?? [],
    milestoneTimes: partial.milestoneTimes ?? [],
    keyTimeGroups: partial.keyTimeGroups ?? [],
  };
}

test("parent with no Rooms emits one parent blocker; inheritors do not duplicate", () => {
  const drafts = [
    cycle({ stableKey: "breakfast", label: "Breakfast", spaceIds: [], displaySequence: 10 }),
    cycle({
      stableKey: "prep",
      label: "Prep",
      parentStableKey: "breakfast",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 20,
    }),
    cycle({
      stableKey: "cleanup",
      label: "Cleanup",
      parentStableKey: "breakfast",
      locationInheritFromParent: true,
      spaceIds: [],
      displaySequence: 40,
    }),
  ];
  const result = validateDraftsForReviewPublish({ drafts });
  assert.equal(result.valid, false);
  const locationBlockers = result.blockers.filter(
    (b) => b.code === "period_rooms_required" || b.code === "phase_rooms_required",
  );
  assert.equal(locationBlockers.length, 1);
  assert.equal(locationBlockers[0]!.stableKey, "breakfast");
  assert.equal(locationBlockers[0]!.fixTarget.cycleId, "id-breakfast");
  assert.equal(locationBlockers[0]!.fixTarget.focus, "rooms");
  assert.match(locationBlockers[0]!.consequence ?? "", /Prep/);
  assert.match(locationBlockers[0]!.consequence ?? "", /Cleanup/);
  assert.ok(!result.blockers.some((b) => b.stableKey === "prep"));
  assert.ok(!result.blockers.some((b) => b.stableKey === "cleanup"));
});

test("explicit child with no Rooms emits its own blocker", () => {
  const drafts = [
    cycle({
      stableKey: "breakfast",
      label: "Breakfast",
      spaceIds: ["room-1"],
      displaySequence: 10,
    }),
    cycle({
      stableKey: "prep",
      label: "Main Kitchen Prep",
      parentStableKey: "breakfast",
      locationInheritFromParent: false,
      spaceIds: [],
      displaySequence: 20,
    }),
  ];
  const result = validateDraftsForReviewPublish({ drafts });
  assert.equal(result.valid, false);
  const prep = result.blockers.find((b) => b.stableKey === "prep");
  assert.ok(prep);
  assert.equal(prep!.code, "phase_rooms_required");
  assert.equal(prep!.fixTarget.cycleId, "id-prep");
  assert.ok(!result.blockers.some((b) => b.stableKey === "breakfast"));
});

test("Key Time with no groups emits blocker mapped to Key Time editor", () => {
  const drafts = [
    cycle({
      stableKey: "lunch",
      label: "Lunch",
      spaceIds: ["room-1"],
      startLocal: "11:00",
      endLocal: "14:00",
      displaySequence: 10,
    }),
    cycle({
      stableKey: "lunch_due",
      label: "Lunch Due",
      parentStableKey: "lunch",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      keyTimeGroups: [],
      displaySequence: 30,
    }),
  ];
  const result = validateDraftsForReviewPublish({ drafts });
  assert.equal(result.valid, false);
  const due = result.blockers.find((b) => b.code === "key_time_groups_required");
  assert.ok(due);
  assert.equal(due!.fixTarget.cycleId, "id-lunch_due");
  assert.equal(due!.fixTarget.focus, "key_times");
  assert.match(due!.fixLabel, /key time/i);
});

test("empty Key Time group emits blocker", () => {
  const drafts = [
    cycle({
      stableKey: "breakfast",
      label: "Breakfast",
      spaceIds: ["room-1"],
    }),
    cycle({
      stableKey: "breakfast_due",
      label: "Breakfast Due",
      parentStableKey: "breakfast",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      keyTimeGroups: [{ dueLocal: "08:00", spaceIds: [] }],
    }),
  ];
  const result = validateDraftsForReviewPublish({ drafts });
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "key_time_group_rooms_required"));
});

test("duplicate Room across groups emits blocker with room name", () => {
  const drafts = [
    cycle({
      stableKey: "breakfast",
      label: "Breakfast",
      spaceIds: ["room-1"],
    }),
    cycle({
      stableKey: "breakfast_due",
      label: "Breakfast Due",
      parentStableKey: "breakfast",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      keyTimeGroups: [
        { dueLocal: "07:45", spaceIds: ["naval"] },
        { dueLocal: "08:00", spaceIds: ["naval"] },
      ],
    }),
  ];
  const result = validateDraftsForReviewPublish({
    drafts,
    locationNames: { naval: "Naval Park Servery" },
  });
  assert.equal(result.valid, false);
  const dup = result.blockers.find((b) => b.code === "key_time_room_duplicate");
  assert.ok(dup);
  assert.match(dup!.title, /Naval Park Servery/);
  assert.equal(dup!.fixTarget.stableKey, "breakfast_due");
});

test("warnings do not block publish; blockers do", () => {
  const withWarning = validateDraftsForReviewPublish({
    drafts: [
      cycle({
        stableKey: "breakfast",
        label: "Breakfast",
        spaceIds: ["room-1"],
        startLocal: "07:00",
        endLocal: "10:00",
      }),
      cycle({
        stableKey: "cleanup",
        label: "Cleanup",
        parentStableKey: "breakfast",
        locationInheritFromParent: true,
        startLocal: "09:00",
        endLocal: "11:00",
        spaceIds: [],
      }),
      cycle({
        stableKey: "breakfast_due",
        label: "Breakfast Due",
        parentStableKey: "breakfast",
        nodeKind: "KEY_TIME",
        startLocal: null,
        endLocal: null,
        keyTimeGroups: [{ dueLocal: "08:00", spaceIds: ["room-1"] }],
      }),
    ],
  });
  assert.equal(withWarning.valid, true);
  assert.ok(withWarning.warnings.some((w) => w.code === "phase_outside_parent_window"));

  const withBlocker = validateDraftsForReviewPublish({
    drafts: [cycle({ stableKey: "breakfast", label: "Breakfast", spaceIds: [] })],
  });
  assert.equal(withBlocker.valid, false);
  assert.equal(formatReviewPublishBlockerSummary(withBlocker), "1 item needs attention");
});

test("multiple blockers use plural summary", () => {
  const result = validateDraftsForReviewPublish({
    drafts: [
      cycle({ stableKey: "breakfast", label: "Breakfast", spaceIds: [] }),
      cycle({
        stableKey: "lunch",
        label: "Lunch",
        spaceIds: ["r1"],
        startLocal: "11:00",
        endLocal: "14:00",
        displaySequence: 20,
      }),
      cycle({
        stableKey: "lunch_due",
        label: "Lunch Due",
        parentStableKey: "lunch",
        nodeKind: "KEY_TIME",
        startLocal: null,
        endLocal: null,
        keyTimeGroups: [],
        displaySequence: 30,
      }),
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.blockers.length >= 2);
  assert.equal(
    formatReviewPublishBlockerSummary(result),
    `${result.blockers.length} items need attention`,
  );
});

test("hierarchical review preserves Breakfast → Prep → Due → Cleanup order", () => {
  const drafts = [
    cycle({
      stableKey: "breakfast",
      label: "Breakfast",
      spaceIds: ["r1"],
      displaySequence: 10,
    }),
    cycle({
      stableKey: "prep",
      label: "Prep",
      parentStableKey: "breakfast",
      locationInheritFromParent: true,
      displaySequence: 20,
    }),
    cycle({
      stableKey: "breakfast_due",
      label: "Breakfast Due",
      parentStableKey: "breakfast",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      keyTimeGroups: [{ dueLocal: "08:00", spaceIds: ["r1"] }],
      displaySequence: 30,
    }),
    cycle({
      stableKey: "cleanup",
      label: "Cleanup",
      parentStableKey: "breakfast",
      locationInheritFromParent: true,
      displaySequence: 40,
    }),
    cycle({
      stableKey: "lunch",
      label: "Lunch",
      spaceIds: ["r1"],
      startLocal: "11:00",
      endLocal: "14:00",
      displaySequence: 50,
    }),
  ] as CycleLifecycleRow[];

  const changes: CycleDraftChange[] = drafts.map((d) => ({
    kind: "added",
    stableKey: d.stableKey,
    label: d.label,
    summary: `Added “${d.label}”`,
  }));

  const presented = presentHierarchicalCycleReview({
    changes,
    drafts,
    currentCount: 0,
  });
  assert.equal(presented.mode, "first_setup");
  assert.equal(presented.branches[0]!.label, "Breakfast");
  assert.equal(presented.branches[1]!.label, "Lunch");
  const childLabels = presented.branches[0]!.children.map((c) => c.label);
  assert.deepEqual(childLabels, ["Prep", "Breakfast Due", "Cleanup"]);
});

test("immediate publish testing override gated by NODE_ENV", () => {
  assert.equal(isImmediatePublishTestingOverrideEnabled("development"), true);
  assert.equal(isImmediatePublishTestingOverrideEnabled("test"), true);
  assert.equal(isImmediatePublishTestingOverrideEnabled("production"), false);
});

test("inheriting draft never claims different Rooms when parent is published", () => {
  const publishedBreakfast = cycle({
    id: "pub-breakfast",
    stableKey: "breakfast",
    label: "Breakfast",
    spaceIds: ["room-1", "room-2"],
    status: "PUBLISHED",
  });
  const cleanupDraft = cycle({
    id: "draft-cleanup",
    stableKey: "cleanup",
    label: "Cleanup",
    parentStableKey: "breakfast",
    locationInheritFromParent: true,
    spaceIds: [],
    startLocal: "09:00",
    endLocal: "10:00",
  });
  const result = validateDraftsForReviewPublish({
    drafts: [cleanupDraft],
    locationContext: [publishedBreakfast],
  });
  assert.equal(result.valid, true);
  assert.equal(result.blockers.length, 0);
});

test("inheriting draft without parent context does not claim different Rooms", () => {
  const cleanupDraft = cycle({
    id: "draft-cleanup",
    stableKey: "cleanup",
    label: "Cleanup",
    parentStableKey: "breakfast",
    locationInheritFromParent: true,
    spaceIds: [],
  });
  const result = validateDraftsForReviewPublish({ drafts: [cleanupDraft] });
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "parent_locations_unavailable"));
  assert.ok(!result.blockers.some((b) => b.code === "phase_rooms_required"));
});

test("inheriting draft with empty published parent reports parent Rooms issue", () => {
  const publishedBreakfast = cycle({
    id: "pub-breakfast",
    stableKey: "breakfast",
    label: "Breakfast",
    spaceIds: [],
    status: "PUBLISHED",
  });
  const cleanupDraft = cycle({
    id: "draft-cleanup",
    stableKey: "cleanup",
    label: "Cleanup",
    parentStableKey: "breakfast",
    locationInheritFromParent: true,
    spaceIds: [],
  });
  const result = validateDraftsForReviewPublish({
    drafts: [cleanupDraft],
    locationContext: [publishedBreakfast],
  });
  assert.equal(result.valid, false);
  const blocker = result.blockers.find((b) => b.code === "parent_rooms_required");
  assert.ok(blocker);
  assert.match(blocker!.title, /Breakfast needs locations/);
  assert.match(blocker!.message, /Cleanup uses Breakfast/);
});

test("ready summary when valid", () => {
  const result = validateDraftsForReviewPublish({
    drafts: [
      cycle({
        stableKey: "breakfast",
        label: "Breakfast",
        spaceIds: ["r1"],
      }),
      cycle({
        stableKey: "due",
        label: "Breakfast Due",
        parentStableKey: "breakfast",
        nodeKind: "KEY_TIME",
        startLocal: null,
        endLocal: null,
        keyTimeGroups: [{ dueLocal: "08:00", spaceIds: ["r1"] }],
      }),
    ],
  });
  assert.equal(result.valid, true);
  assert.equal(formatReviewPublishBlockerSummary(result), "Ready to publish");
});
