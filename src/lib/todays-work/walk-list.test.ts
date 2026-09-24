import assert from "node:assert/strict";
import test from "node:test";

import { UnitType } from "@prisma/client";

import type { OperationsCenterUnitCard } from "@/lib/operations-center";
import {
  applyRoomKeyTimeAttention,
  buildActionableRoomWalkList,
  buildWalkListItems,
  collectActionableWalkRooms,
  resolveWalkListReason,
  summarizeWalkList,
  walkListItemKey,
  walkListWorkspaceCta,
  type WalkListItemStatus,
} from "@/lib/todays-work/walk-list";
import type { LocationsTreeNode } from "@/lib/locations";

function card(partial: Partial<OperationsCenterUnitCard> & Pick<OperationsCenterUnitCard, "id" | "name">): OperationsCenterUnitCard {
  return {
    unitType: UnitType.SERVERY,
    hasDietary: true,
    expected: 0,
    completed: 0,
    failed: 0,
    missed: 0,
    pending: 0,
    mealTimes: [],
    staffingCount: 1,
    openRepairCount: 0,
    ...partial,
  };
}

function readinessMapFromCards(
  cards: OperationsCenterUnitCard[],
): Map<string, WalkListItemStatus> {
  return new Map(
    cards.map((unit) => {
      const state: WalkListItemStatus["state"] =
        unit.failed > 0 || unit.missed > 0
          ? "blocked"
          : unit.pending > 0 || (unit.expected > 0 && unit.completed < unit.expected)
            ? "in_progress"
            : "ready";
      return [unit.id, { state, reason: state === "ready" ? undefined : "Needs a closer look" }] as const;
    }),
  );
}

test("buildWalkListItems orders blocked before in-progress before ready", () => {
  const cards = [
    card({ id: "ready", name: "Zebra Ready", expected: 1, completed: 1 }),
    card({ id: "blocked", name: "Alpha Blocked", failed: 2, expected: 2, completed: 0 }),
    card({ id: "progress", name: "Beta Progress", pending: 1, expected: 2, completed: 1 }),
  ];
  const items = buildWalkListItems(cards, readinessMapFromCards(cards));

  assert.deepEqual(
    items.map((item) => item.unitId),
    ["blocked", "progress", "ready"],
  );
  assert.equal(items[0]?.status, "blocked");
  assert.equal(items[1]?.status, "in_progress");
  assert.equal(items[2]?.status, "ready");
});

test("buildWalkListItems ranks higher attention first within the same status", () => {
  const cards = [
    card({ id: "mild", name: "Mild", failed: 1, expected: 2 }),
    card({ id: "severe", name: "Severe", failed: 3, missed: 1, expected: 4 }),
  ];
  const items = buildWalkListItems(cards, readinessMapFromCards(cards));

  assert.equal(items[0]?.unitId, "severe");
  assert.equal(items[1]?.unitId, "mild");
});

test("resolveWalkListReason prefers failed logs then staffing then repairs", () => {
  assert.match(resolveWalkListReason(card({ id: "a", name: "A", failed: 2 }), "blocked"), /failed log/);
  assert.match(
    resolveWalkListReason(card({ id: "b", name: "B", staffingCount: 0, unitType: UnitType.SERVERY }), "blocked"),
    /no staff coverage/i,
  );
  assert.match(
    resolveWalkListReason(card({ id: "c", name: "C", openRepairCount: 2, expected: 0 }), "in_progress"),
    /open repair/,
  );
});

test("summarizeWalkList counts buckets", () => {
  const cards = [
    card({ id: "1", name: "One", failed: 1 }),
    card({ id: "2", name: "Two", pending: 1, expected: 1 }),
    card({ id: "3", name: "Three", expected: 1, completed: 1 }),
  ];
  const summary = summarizeWalkList(buildWalkListItems(cards, readinessMapFromCards(cards)));
  assert.equal(summary.total, 3);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.inProgress, 1);
  assert.equal(summary.ready, 1);
});

test("applyRoomKeyTimeAttention replaces ready Neighborhoods with Room rows and ?space= hrefs", () => {
  const cards = [
    card({ id: "unit-1a", name: "1A – Naval Park", unitType: UnitType.OTHER, expected: 1, completed: 1 }),
    card({ id: "unit-1b", name: "1B – Lighthouse", unitType: UnitType.OTHER, expected: 1, completed: 1 }),
  ];
  const items = buildWalkListItems(cards, readinessMapFromCards(cards));
  const next = applyRoomKeyTimeAttention(items, [
    {
      unitId: "unit-1a",
      spaceId: "naval-park-servery",
      spaceName: "Naval Park Servery",
      facilityRoomTypeName: "Servery",
      unitName: "1A – Naval Park",
      unitType: UnitType.OTHER,
    },
  ]);
  const naval = next.find((item) => item.spaceId === "naval-park-servery");
  assert.ok(naval);
  assert.equal(naval?.unitName, "Naval Park Servery");
  assert.equal(naval?.typeLabel, "Servery");
  assert.equal(naval?.parentContext, "1A – Naval Park");
  assert.equal(naval?.href, "/unit/unit-1a?space=naval-park-servery");
  assert.equal(naval?.reason, "Key Time overdue");
  assert.equal(walkListWorkspaceCta(naval!), "Open room workspace");
  assert.equal(walkListItemKey(naval!), "unit-1a:naval-park-servery");
  assert.equal(
    next.some((item) => item.unitId === "unit-1a" && !item.spaceId && item.reason === "Key Time overdue"),
    false,
  );
  const lighthouse = next.find((item) => item.unitId === "unit-1b");
  assert.equal(lighthouse?.unitName, "1B – Lighthouse");
  assert.equal(lighthouse?.href, "/unit/unit-1b");
});

function locationNode(
  partial: Partial<LocationsTreeNode> & Pick<LocationsTreeNode, "kind" | "label" | "physicalId">,
): LocationsTreeNode {
  return {
    id: partial.id ?? partial.physicalId,
    secondaryLabel: partial.secondaryLabel ?? null,
    presentation: partial.presentation ?? "STRUCTURAL",
    hierarchyLevel: partial.hierarchyLevel ?? "LEVEL_1",
    parentId: partial.parentId ?? null,
    unitId: partial.unitId ?? null,
    href: partial.href ?? null,
    experienceKeys: partial.experienceKeys ?? [],
    areas: partial.areas ?? [],
    children: partial.children ?? [],
    ...partial,
  };
}

test("collectActionableWalkRooms excludes structural Floors and keeps actionable Rooms", () => {
  const roots: LocationsTreeNode[] = [
    locationNode({
      kind: "FLOOR",
      label: "Floor 1",
      physicalId: "floor-1",
      unitId: "floor-1",
      children: [
        locationNode({
          kind: "NEIGHBORHOOD",
          label: "1A – Naval Park",
          physicalId: "unit-1a",
          unitId: "unit-1a",
          children: [
            locationNode({
              kind: "ROOM",
              label: "Naval Park Servery",
              physicalId: "naval-park-servery",
              unitId: "unit-1a",
              presentation: "ACTIONABLE",
              href: "/unit/unit-1a?space=naval-park-servery",
            }),
          ],
        }),
      ],
    }),
    locationNode({
      kind: "FLOOR",
      label: "Floor 2",
      physicalId: "floor-2",
      unitId: "floor-2",
    }),
  ];
  const rooms = collectActionableWalkRooms(roots);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0]?.name, "Naval Park Servery");
  assert.equal(rooms[0]?.parentContext, "1A – Naval Park · Floor 1");
  assert.equal(rooms[0]?.href, "/unit/unit-1a?space=naval-park-servery");
});

test("buildActionableRoomWalkList ranks Room grain with Servery type and Key Time overdue", () => {
  const rooms = collectActionableWalkRooms([
    locationNode({
      kind: "NEIGHBORHOOD",
      label: "1A – Naval Park",
      physicalId: "unit-1a",
      unitId: "unit-1a",
      children: [
        locationNode({
          kind: "ROOM",
          label: "Naval Park Servery",
          physicalId: "naval-park-servery",
          unitId: "unit-1a",
          presentation: "ACTIONABLE",
          href: "/unit/unit-1a?space=naval-park-servery",
        }),
      ],
    }),
  ]);
  const unitItems = buildWalkListItems(
    [card({ id: "unit-1a", name: "1A – Naval Park", unitType: UnitType.OTHER, expected: 1, completed: 1 })],
    readinessMapFromCards([
      card({ id: "unit-1a", name: "1A – Naval Park", unitType: UnitType.OTHER, expected: 1, completed: 1 }),
    ]),
  );
  const items = buildActionableRoomWalkList({
    rooms,
    unitItems,
    keyTimes: [
      {
        spaceId: "naval-park-servery",
        overdueLabel: "Dinner Due overdue",
        roomTypeLabel: "Servery",
      },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.unitName, "Naval Park Servery");
  assert.equal(items[0]?.typeLabel, "Servery");
  assert.equal(items[0]?.parentContext, "1A – Naval Park");
  assert.equal(items[0]?.reason, "Dinner Due overdue");
  assert.equal(items[0]?.href, "/unit/unit-1a?space=naval-park-servery");
  assert.equal(items.some((item) => item.unitName === "Floor 1"), false);
});

test("buildActionableRoomWalkList keeps Room in Needs Attention for open repair after Key Time complete", () => {
  const rooms = collectActionableWalkRooms([
    locationNode({
      kind: "ROOM",
      label: "Naval Park Servery",
      physicalId: "naval-park-servery",
      unitId: "unit-1a",
      presentation: "ACTIONABLE",
      href: "/unit/unit-1a?space=naval-park-servery",
    }),
  ]);
  const unitItems = buildWalkListItems(
    [card({ id: "unit-1a", name: "1A – Naval Park", openRepairCount: 1, expected: 0 })],
    new Map([["unit-1a", { state: "in_progress", reason: "Open repair" }]]),
  );
  const items = buildActionableRoomWalkList({
    rooms,
    unitItems,
    keyTimes: [
      {
        spaceId: "naval-park-servery",
        overdueLabel: null,
        roomTypeLabel: "Servery",
      },
    ],
  });
  assert.equal(items[0]?.status, "in_progress");
  assert.notEqual(items[0]?.reason, "No immediate exceptions");
});
