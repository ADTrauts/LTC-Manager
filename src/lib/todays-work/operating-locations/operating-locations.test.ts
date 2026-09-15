import assert from "node:assert/strict";
import test from "node:test";

import type { LocationsDepartmentSnapshot, LocationsTreeNode } from "@/lib/locations";
import type { RunLocationOperationPresentation } from "@/lib/operational-cycles";
import type { RunLocationKeyTimeView } from "@/lib/operational-cycles/present-run-operation";

import {
  aggregateCurrentOperation,
  applyViewerTeamScopeToLocations,
  buildOperatingLocationBoard,
  deriveOperatingStatus,
  operatingBoardToWalkList,
  operatingLocationsToWalkItems,
  presentStaffingFact,
  selectPrimaryKeyTime,
  sortOperatingLocationsForBoard,
  sortOperatingLocationsForWalk,
  summarizeOperatingLocationBoard,
  TODAYS_WORK_HUB_SUBTITLE,
} from "@/lib/todays-work/operating-locations";
import { collectSupervisorOperatingLocations } from "@/lib/todays-work/operating-locations/collect";
import type {
  OperatingLocationIssueFacts,
  SupervisorOperatingLocation,
} from "@/lib/todays-work/operating-locations/types";
import type { ViewerTeamScope } from "@/lib/todays-work/viewer-team-scope";

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

function dietarySnapshot(roots: LocationsTreeNode[]): LocationsDepartmentSnapshot {
  return {
    departmentId: "dept-dietary",
    departmentKey: "DIETARY",
    label: "Dietary",
    roots,
    actionableLocationIds: [],
    unitIds: [],
    plantPolicy: null,
  };
}

function dietaryTree(): LocationsTreeNode[] {
  const neighborhood = (id: string, label: string, roomName: string): LocationsTreeNode =>
    locationNode({
      kind: "NEIGHBORHOOD",
      label,
      physicalId: id,
      unitId: id,
      children: [
        locationNode({
          kind: "ROOM",
          label: roomName,
          physicalId: `${id}-servery`,
          unitId: id,
          presentation: "ACTIONABLE",
          href: `/unit/${id}?space=${id}-servery`,
        }),
      ],
    });

  return [
    locationNode({
      kind: "FLOOR",
      label: "Ground",
      physicalId: "floor-g",
      unitId: "floor-g",
      children: [
        locationNode({
          kind: "ROOM",
          label: "Main Kitchen",
          physicalId: "main-kitchen",
          unitId: "kitchen-unit",
          presentation: "ACTIONABLE",
          href: "/unit/kitchen-unit?space=main-kitchen",
        }),
        locationNode({
          kind: "ROOM",
          label: "Retail",
          physicalId: "retail",
          unitId: "retail-unit",
          presentation: "ACTIONABLE",
          href: "/unit/retail-unit?space=retail",
        }),
      ],
    }),
    locationNode({
      kind: "FLOOR",
      label: "Floor 1",
      physicalId: "floor-1",
      unitId: "floor-1",
      children: [
        neighborhood("unit-1a", "1A – Naval Park", "Naval Park Servery"),
        neighborhood("unit-1b", "1B – Lighthouse", "Lighthouse Servery"),
        neighborhood("unit-1c", "1C – Erie Basin Marina", "Erie Basin Marina Servery"),
        neighborhood("unit-1d", "1D – Canal", "Canal Servery"),
      ],
    }),
  ];
}

function keyTime(partial: Partial<RunLocationKeyTimeView> & Pick<RunLocationKeyTimeView, "label">): RunLocationKeyTimeView {
  return {
    expectationId: partial.expectationId ?? partial.label,
    dueLabel: partial.dueLabel ?? "8:00 AM",
    configuredLabel: partial.configuredLabel ?? "8:00 AM",
    expectedTodayLabel: partial.expectedTodayLabel ?? "8:00 AM",
    actualLabel: partial.actualLabel ?? null,
    statusKey: partial.statusKey ?? "upcoming",
    statusLabel: partial.statusLabel ?? "Upcoming",
    canAdjust: false,
    canComplete: false,
    ...partial,
  };
}

function roomView(input: {
  spaceId: string;
  title?: string;
  roomTypeLabel?: string | null;
  hierarchyLabel?: string | null;
  keyTimes?: RunLocationKeyTimeView[];
}): { spaceId: string; presentation: RunLocationOperationPresentation } {
  return {
    spaceId: input.spaceId,
    presentation: {
      provenance: "NEW_PERIOD_KEY_TIME",
      location: {
        title: input.title ?? input.spaceId,
        roomTypeLabel: input.roomTypeLabel ?? "Servery",
        contextLabel: null,
        spaceId: input.spaceId,
        unitId: null,
      },
      currentOperation: {
        state: input.hierarchyLabel ? "ACTIVE" : "NONE",
        hierarchyLabel: input.hierarchyLabel ?? null,
        windowLabel: input.hierarchyLabel ? "5:30 AM–10:00 AM" : null,
        parentLabel: input.hierarchyLabel?.split(" → ")[0] ?? null,
        phaseLabel: input.hierarchyLabel?.includes("→")
          ? input.hierarchyLabel.split(" → ")[1] ?? null
          : null,
      },
      keyTimes: input.keyTimes ?? [],
      attention: { kind: "none", title: "", description: "" },
    },
  };
}

const EMPTY_FACTS: OperatingLocationIssueFacts = {
  failedLogs: 0,
  missedLogs: 0,
  pendingLogs: 0,
  openRepairCount: 0,
  urgentRepairCount: 0,
};

test("collect: Dietary neighborhoods + standalone rooms; Floors never become rows", () => {
  const locations = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const names = locations.map((row) => row.displayName);
  assert.deepEqual(names, [
    "Main Kitchen",
    "Retail",
    "1A – Naval Park",
    "1B – Lighthouse",
    "1C – Erie Basin Marina",
    "1D – Canal",
  ]);
  assert.equal(names.includes("Floor 1"), false);
  assert.equal(names.includes("Ground"), false);
  assert.equal(locations.find((row) => row.displayName === "1A – Naval Park")?.kind, "NEIGHBORHOOD");
  assert.equal(locations.find((row) => row.displayName === "Main Kitchen")?.kind, "STANDALONE_ROOM");
  assert.equal(
    locations.find((row) => row.displayName === "1A – Naval Park")?.rooms[0]?.name,
    "Naval Park Servery",
  );
});

test("collect: multiple rooms under one Neighborhood stay one supervisor row", () => {
  const roots = [
    locationNode({
      kind: "NEIGHBORHOOD",
      label: "1A – Naval Park",
      physicalId: "unit-1a",
      unitId: "unit-1a",
      children: [
        locationNode({
          kind: "ROOM",
          label: "Naval Park Servery",
          physicalId: "servery",
          unitId: "unit-1a",
          presentation: "ACTIONABLE",
          href: "/unit/unit-1a?space=servery",
        }),
        locationNode({
          kind: "ROOM",
          label: "Resident Dining Room",
          physicalId: "dining",
          unitId: "unit-1a",
          presentation: "ACTIONABLE",
          href: "/unit/unit-1a?space=dining",
        }),
        locationNode({
          kind: "ROOM",
          label: "Nourishment Room",
          physicalId: "nourishment",
          unitId: "unit-1a",
          presentation: "ACTIONABLE",
          href: "/unit/unit-1a?space=nourishment",
        }),
      ],
    }),
  ];
  const locations = collectSupervisorOperatingLocations([dietarySnapshot(roots)]);
  assert.equal(locations.length, 1);
  assert.equal(locations[0]?.displayName, "1A – Naval Park");
  assert.equal(locations[0]?.rooms.length, 3);
});

test("all six Dietary operating locations stay visible when healthy", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const board = buildOperatingLocationBoard({
    locations: collected,
    viewsBySpaceId: new Map(),
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "board",
  });
  assert.equal(board.locations.length, 6);
  assert.equal(board.summary.total, 6);
  assert.equal(board.summary.onTrack, 6);
  assert.equal(board.summary.needsAttention, 0);
  assert.equal(board.summary.inProgress, 0);
  assert.equal(
    board.summary.needsAttention + board.summary.inProgress + board.summary.onTrack,
    board.locations.length,
  );
});

test("one overdue Key Time: Needs Attention 1, On Track 5, overdue row first", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const viewsBySpaceId = new Map<string, RunLocationOperationPresentation>([
    [
      "unit-1b-servery",
      roomView({
        spaceId: "unit-1b-servery",
        title: "Lighthouse Servery",
        hierarchyLabel: "Lunch → Prep",
        keyTimes: [
          keyTime({
            label: "Lunch Due",
            dueLabel: "12:00 PM",
            statusKey: "overdue",
            statusLabel: "Overdue 6 min",
          }),
        ],
      }).presentation,
    ],
  ]);
  const board = buildOperatingLocationBoard({
    locations: collected,
    viewsBySpaceId,
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "board",
  });
  assert.equal(board.summary.needsAttention, 1);
  assert.equal(board.summary.onTrack, 5);
  assert.equal(board.locations[0]?.displayName, "1B – Lighthouse");
  assert.equal(board.locations[0]?.derivedStatus, "needs_attention");
  assert.equal(board.locations.length, 6);
});

test("Room actual aggregates to Neighborhood: Dinner Due complete, not overdue", () => {
  const location: SupervisorOperatingLocation = {
    id: "neighborhood:unit-1a",
    kind: "NEIGHBORHOOD",
    displayName: "1A – Naval Park",
    unitId: "unit-1a",
    departmentKey: "DIETARY",
    departmentLabel: "Dietary",
    floorLabel: "Floor 1",
    facilityOrder: 0,
    rooms: [
      {
        spaceId: "naval-park-servery",
        unitId: "unit-1a",
        name: "Naval Park Servery",
        href: "/unit/unit-1a?space=naval-park-servery",
        roomTypeLabel: "Servery",
      },
    ],
  };
  const views = [
    roomView({
      spaceId: "naval-park-servery",
      title: "Naval Park Servery",
      hierarchyLabel: "Dinner",
      keyTimes: [
        keyTime({
          label: "Dinner Due",
          dueLabel: "5:10 PM",
          actualLabel: "5:21 PM",
          statusKey: "completed_late",
          statusLabel: "Completed 11 min late · 5:21 PM",
        }),
      ],
    }),
  ];
  const selected = selectPrimaryKeyTime(views);
  assert.equal(selected?.label, "Dinner Due");
  assert.match(selected?.summary ?? "", /Complete 5:21 PM/);
  assert.equal(selected?.overdueCount, 0);
  assert.equal(
    deriveOperatingStatus({
      keyTime: selected,
      staffing: presentStaffingFact({ assignedCount: 2, expectedCount: 2 }),
      facts: EMPTY_FACTS,
    }),
    "on_track",
  );
  const board = buildOperatingLocationBoard({
    locations: [location],
    viewsBySpaceId: new Map([["naval-park-servery", views[0]!.presentation]]),
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "board",
  });
  assert.equal(board.locations[0]?.displayName, "1A – Naval Park");
  assert.notEqual(board.locations[0]?.displayName, "Naval Park Servery");
  assert.equal(board.locations[0]?.href, "/unit/unit-1a?space=naval-park-servery");
});

test("multi-room Key Time: 2 / 3 complete · 1 overdue → Needs Attention", () => {
  const location: SupervisorOperatingLocation = {
    id: "neighborhood:unit-1a",
    kind: "NEIGHBORHOOD",
    displayName: "1A – Naval Park",
    unitId: "unit-1a",
    departmentKey: "DIETARY",
    departmentLabel: "Dietary",
    floorLabel: "Floor 1",
    facilityOrder: 0,
    rooms: [
      {
        spaceId: "a",
        unitId: "unit-1a",
        name: "Room A",
        href: "/unit/unit-1a?space=a",
        roomTypeLabel: null,
      },
      {
        spaceId: "b",
        unitId: "unit-1a",
        name: "Room B",
        href: "/unit/unit-1a?space=b",
        roomTypeLabel: null,
      },
      {
        spaceId: "c",
        unitId: "unit-1a",
        name: "Room C",
        href: "/unit/unit-1a?space=c",
        roomTypeLabel: null,
      },
    ],
  };
  const viewsBySpaceId = new Map<string, RunLocationOperationPresentation>([
    [
      "a",
      roomView({
        spaceId: "a",
        keyTimes: [keyTime({ label: "Lunch Due", actualLabel: "12:01 PM", statusKey: "completed_on_time" })],
      }).presentation,
    ],
    [
      "b",
      roomView({
        spaceId: "b",
        keyTimes: [keyTime({ label: "Lunch Due", actualLabel: "12:02 PM", statusKey: "completed_on_time" })],
      }).presentation,
    ],
    [
      "c",
      roomView({
        spaceId: "c",
        keyTimes: [
          keyTime({
            label: "Lunch Due",
            statusKey: "overdue",
            statusLabel: "Overdue 6 min",
          }),
        ],
      }).presentation,
    ],
  ]);
  const board = buildOperatingLocationBoard({
    locations: [location],
    viewsBySpaceId,
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "board",
  });
  assert.equal(board.locations.length, 1);
  assert.match(board.locations[0]?.keyTime?.summary ?? "", /2 \/ 3 complete/);
  assert.match(board.locations[0]?.keyTime?.summary ?? "", /1 overdue/);
  assert.equal(board.locations[0]?.derivedStatus, "needs_attention");
  assert.equal(board.locations[0]?.href, "/unit/unit-1a");
});

test("standalone Main Kitchen appears without a Neighborhood wrapper", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const kitchen = collected.find((row) => row.displayName === "Main Kitchen");
  assert.ok(kitchen);
  assert.equal(kitchen?.kind, "STANDALONE_ROOM");
  assert.equal(kitchen?.rooms[0]?.spaceId, "main-kitchen");
});

test("staffing: real assignment with expected coverage", () => {
  assert.equal(
    presentStaffingFact({ assignedCount: 2, expectedCount: 2 }).label,
    "Covered · 2 assigned",
  );
  assert.equal(presentStaffingFact({ assignedCount: 1, expectedCount: 2 }).label, "Short 1");
  assert.equal(presentStaffingFact({ assignedCount: 0, expectedCount: 2 }).label, "Uncovered");
  assert.equal(presentStaffingFact({ assignedCount: 2, expectedCount: null }).label, "2 assigned");
});

test("staffing: unknown is Staffing not assigned, never no staff", () => {
  const unknown = presentStaffingFact({ assignedCount: null, expectedCount: null });
  assert.equal(unknown.label, "Staffing not assigned");
  assert.doesNotMatch(unknown.label, /no staff/i);
  const zeroWithoutTarget = presentStaffingFact({ assignedCount: 0, expectedCount: null });
  assert.equal(zeroWithoutTarget.label, "Staffing not assigned");
  assert.doesNotMatch(zeroWithoutTarget.label, /no staff/i);
});

test("open urgent repair with healthy Key Times is Needs Attention", () => {
  const status = deriveOperatingStatus({
    keyTime: {
      label: "Breakfast Due",
      summary: "Breakfast Due · Complete 7:58 AM",
      statusKey: "completed_on_time",
      overdueCount: 0,
      completedCount: 1,
      total: 1,
    },
    staffing: presentStaffingFact({ assignedCount: 2, expectedCount: null }),
    facts: { ...EMPTY_FACTS, openRepairCount: 1, urgentRepairCount: 1 },
  });
  assert.equal(status, "needs_attention");
});

test("Walk List uses the same operating locations; only order differs", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const viewsBySpaceId = new Map<string, RunLocationOperationPresentation>([
    [
      "unit-1b-servery",
      roomView({
        spaceId: "unit-1b-servery",
        keyTimes: [
          keyTime({
            label: "Lunch Due",
            statusKey: "overdue",
            statusLabel: "Overdue 6 min",
          }),
        ],
      }).presentation,
    ],
  ]);
  const board = buildOperatingLocationBoard({
    locations: collected,
    viewsBySpaceId,
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "board",
  });
  const walk = sortOperatingLocationsForWalk(board.locations);
  assert.equal(walk.length, board.locations.length);
  assert.deepEqual(
    [...walk.map((row) => row.location.id)].sort(),
    [...board.locations.map((row) => row.location.id)].sort(),
  );
  assert.equal(walk[0]?.displayName, "1B – Lighthouse");
  const walkItems = operatingLocationsToWalkItems(walk);
  assert.equal(walkItems.length, 6);
  assert.equal(walkItems.some((item) => item.unitName === "Floor 1"), false);
});

test("counts reconcile: 10 rows, 2 Needs Attention, 1 In Progress, 7 On Track", () => {
  const locations: SupervisorOperatingLocation[] = Array.from({ length: 10 }, (_, index) => ({
    id: `n:${index}`,
    kind: "NEIGHBORHOOD",
    displayName: `Unit ${index}`,
    unitId: `unit-${index}`,
    departmentKey: "DIETARY",
    departmentLabel: "Dietary",
    floorLabel: "Floor 1",
    facilityOrder: index,
    rooms: [
      {
        spaceId: `space-${index}`,
        unitId: `unit-${index}`,
        name: `Room ${index}`,
        href: `/unit/unit-${index}?space=space-${index}`,
        roomTypeLabel: null,
      },
    ],
  }));
  const viewsBySpaceId = new Map<string, RunLocationOperationPresentation>([
    [
      "space-0",
      roomView({
        spaceId: "space-0",
        keyTimes: [keyTime({ label: "Due", statusKey: "overdue", statusLabel: "Overdue 1 min" })],
      }).presentation,
    ],
    [
      "space-1",
      roomView({
        spaceId: "space-1",
        keyTimes: [keyTime({ label: "Due", statusKey: "overdue", statusLabel: "Overdue 2 min" })],
      }).presentation,
    ],
  ]);
  const factsByUnitId = new Map([
    ["unit-2", { ...EMPTY_FACTS, pendingLogs: 1 }],
  ]);
  const board = buildOperatingLocationBoard({
    locations,
    viewsBySpaceId,
    staffingByUnitId: new Map(),
    factsByUnitId,
    sort: "board",
  });
  assert.equal(board.summary.total, 10);
  assert.equal(board.summary.needsAttention, 2);
  assert.equal(board.summary.inProgress, 1);
  assert.equal(board.summary.onTrack, 7);
  assert.equal(
    board.summary.needsAttention + board.summary.inProgress + board.summary.onTrack,
    10,
  );
});

test("generic Today's Work copy has no meal-period language", () => {
  assert.doesNotMatch(TODAYS_WORK_HUB_SUBTITLE, /meal period|servery|breakfast|meal service/i);
});

test("current operation: shared phase vs multiple active phases", () => {
  const shared = aggregateCurrentOperation([
    roomView({ spaceId: "a", hierarchyLabel: "Breakfast → Prep" }),
    roomView({ spaceId: "b", hierarchyLabel: "Breakfast → Prep" }),
  ]);
  assert.equal(shared.label, "Breakfast → Prep");
  const mixed = aggregateCurrentOperation([
    roomView({ spaceId: "a", hierarchyLabel: "Breakfast → Prep" }),
    roomView({ spaceId: "b", hierarchyLabel: "Breakfast → Service" }),
  ]);
  assert.equal(mixed.label, "2 active phases");
  const someNone = aggregateCurrentOperation([
    roomView({ spaceId: "a", hierarchyLabel: "Dinner → Prep" }),
    roomView({ spaceId: "b" }),
  ]);
  assert.equal(someNone.label, "Dinner → Prep");
});

test("board sort keeps On Track locations in facility order after Needs Attention", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const viewsBySpaceId = new Map<string, RunLocationOperationPresentation>([
    [
      "unit-1d-servery",
      roomView({
        spaceId: "unit-1d-servery",
        keyTimes: [keyTime({ label: "Lunch Due", statusKey: "overdue", statusLabel: "Overdue 1 min" })],
      }).presentation,
    ],
  ]);
  const board = buildOperatingLocationBoard({
    locations: collected,
    viewsBySpaceId,
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "board",
  });
  const names = board.locations.map((row) => row.displayName);
  assert.equal(names[0], "1D – Canal");
  assert.deepEqual(names.slice(1), [
    "Main Kitchen",
    "Retail",
    "1A – Naval Park",
    "1B – Lighthouse",
    "1C – Erie Basin Marina",
  ]);
});

test("Walk List is not empty when every location is On Track", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const board = buildOperatingLocationBoard({
    locations: collected,
    viewsBySpaceId: new Map(),
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "walk",
  });
  assert.equal(board.locations.length, 6);
  assert.ok(board.locations.every((row) => row.derivedStatus === "on_track"));
});

test("selectPrimaryKeyTime prefers overdue over a later completed Dinner checkpoint", () => {
  const selected = selectPrimaryKeyTime([
    roomView({
      spaceId: "a",
      keyTimes: [
        keyTime({
          label: "Breakfast Due",
          dueLabel: "8:00 AM",
          statusKey: "overdue",
          statusLabel: "Overdue 6 min",
        }),
        keyTime({
          label: "Dinner Due",
          dueLabel: "5:00 PM",
          actualLabel: "5:21 PM",
          statusKey: "completed_late",
        }),
      ],
    }),
  ]);
  assert.equal(selected?.label, "Breakfast Due");
});

test("short staffing with a coverage target is Needs Attention", () => {
  assert.equal(
    deriveOperatingStatus({
      keyTime: null,
      staffing: presentStaffingFact({ assignedCount: 1, expectedCount: 2 }),
      facts: EMPTY_FACTS,
    }),
    "needs_attention",
  );
  assert.equal(
    deriveOperatingStatus({
      keyTime: null,
      staffing: presentStaffingFact({ assignedCount: null, expectedCount: null }),
      facts: EMPTY_FACTS,
    }),
    "on_track",
  );
});

test("summarizeOperatingLocationBoard does not count Floors", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const summary = summarizeOperatingLocationBoard(
    sortOperatingLocationsForBoard(
      buildOperatingLocationBoard({
        locations: collected,
        viewsBySpaceId: new Map(),
        staffingByUnitId: new Map(),
        factsByUnitId: new Map(),
        sort: "board",
      }).locations,
    ),
  );
  assert.equal(summary.total, 6);
});

test("EVS Neighborhood aggregates many Rooms and never uses Floor as an operating row", () => {
  const rooms = ["32A", "32B", "32C"].map((name) =>
    locationNode({
      kind: "ROOM",
      label: `Room ${name}`,
      physicalId: `space-${name}`,
      unitId: "unit-1a",
      presentation: "ACTIONABLE",
      href: `/unit/unit-1a?space=space-${name}`,
    }),
  );
  const snapshot: LocationsDepartmentSnapshot = {
    departmentId: "dept-evs",
    departmentKey: "EVS",
    label: "EVS",
    roots: [
      locationNode({
        kind: "FLOOR",
        label: "Floor 3",
        physicalId: "floor-3",
        unitId: "floor-3",
        children: [
          locationNode({
            kind: "NEIGHBORHOOD",
            label: "1A – Naval Park",
            physicalId: "unit-1a",
            unitId: "unit-1a",
            children: rooms,
          }),
        ],
      }),
    ],
    actionableLocationIds: [],
    unitIds: [],
    plantPolicy: null,
  };
  const locations = collectSupervisorOperatingLocations([snapshot]);
  assert.equal(locations.length, 1);
  assert.equal(locations[0]?.displayName, "1A – Naval Park");
  assert.equal(locations[0]?.rooms.length, 3);
  assert.equal(
    locations.some((row) => row.displayName === "Floor 3"),
    false,
  );
});

function teamScope(partial: Partial<ViewerTeamScope> & Pick<ViewerTeamScope, "mode" | "reason">): ViewerTeamScope {
  return {
    departmentId: "dept-dietary",
    departmentLabel: "Dietary",
    employeeId: "emp-1",
    activeTeams: [{ id: "t-rs", name: "Resident Services" }],
    roomIds: [],
    ...partial,
  };
}

const DIETARY_KEY = new Map([["DIETARY" as const, "dept-dietary"]]);

test("Team scope: Resident Services neighborhoods only; standalone Kitchen/Retail excluded", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const scoped = applyViewerTeamScopeToLocations(
    collected,
    new Map([
      [
        "dept-dietary",
        teamScope({
          mode: "TEAM_SCOPED",
          reason: "ACTIVE_TEAM_MEMBERSHIP",
          roomIds: [
            "unit-1a-servery",
            "unit-1b-servery",
            "unit-1c-servery",
            "unit-1d-servery",
          ],
        }),
      ],
    ]),
    DIETARY_KEY,
  );
  assert.deepEqual(
    scoped.map((row) => row.displayName),
    ["1A – Naval Park", "1B – Lighthouse", "1C – Erie Basin Marina", "1D – Canal"],
  );
});

test("multi-Team union includes Retail without duplicating rows", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const scoped = applyViewerTeamScopeToLocations(
    collected,
    new Map([
      [
        "dept-dietary",
        teamScope({
          mode: "TEAM_SCOPED",
          reason: "ACTIVE_TEAM_MEMBERSHIP",
          activeTeams: [
            { id: "t-rs", name: "Resident Services" },
            { id: "t-retail", name: "Retail" },
          ],
          roomIds: [
            "unit-1a-servery",
            "unit-1b-servery",
            "unit-1c-servery",
            "unit-1d-servery",
            "retail",
          ],
        }),
      ],
    ]),
    DIETARY_KEY,
  );
  const names = scoped.map((row) => row.displayName);
  assert.deepEqual(names, [
    "Retail",
    "1A – Naval Park",
    "1B – Lighthouse",
    "1C – Erie Basin Marina",
    "1D – Canal",
  ]);
  assert.equal(names.filter((name) => name === "Retail").length, 1);
});

test("Department-wide scope keeps the full Department board", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const scoped = applyViewerTeamScopeToLocations(
    collected,
    new Map([
      [
        "dept-dietary",
        teamScope({
          mode: "DEPARTMENT_WIDE",
          reason: "NO_ACTIVE_TEAM_MEMBERSHIP",
          activeTeams: [],
        }),
      ],
    ]),
    DIETARY_KEY,
  );
  assert.equal(scoped.length, collected.length);
});

test("Neighborhood row keeps only the scoped Room; sibling Key Times do not affect status", () => {
  const roots = [
    locationNode({
      kind: "NEIGHBORHOOD",
      label: "1A – Naval Park",
      physicalId: "unit-1a",
      unitId: "unit-1a",
      children: [
        locationNode({
          kind: "ROOM",
          label: "Naval Park Servery",
          physicalId: "servery",
          unitId: "unit-1a",
          presentation: "ACTIONABLE",
          href: "/unit/unit-1a?space=servery",
        }),
        locationNode({
          kind: "ROOM",
          label: "Dietitian Consult Room",
          physicalId: "diet-office",
          unitId: "unit-1a",
          presentation: "ACTIONABLE",
          href: "/unit/unit-1a?space=diet-office",
        }),
        locationNode({
          kind: "ROOM",
          label: "Utility Closet",
          physicalId: "utility",
          unitId: "unit-1a",
          presentation: "ACTIONABLE",
          href: "/unit/unit-1a?space=utility",
        }),
      ],
    }),
  ];
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(roots)]);
  const scoped = applyViewerTeamScopeToLocations(
    collected,
    new Map([
      [
        "dept-dietary",
        teamScope({
          mode: "TEAM_SCOPED",
          reason: "ACTIVE_TEAM_MEMBERSHIP",
          roomIds: ["servery"],
        }),
      ],
    ]),
    DIETARY_KEY,
  );
  assert.equal(scoped.length, 1);
  assert.deepEqual(
    scoped[0]?.rooms.map((room) => room.spaceId),
    ["servery"],
  );
  const viewsBySpaceId = new Map<string, RunLocationOperationPresentation>([
    [
      "servery",
      roomView({
        spaceId: "servery",
        keyTimes: [keyTime({ label: "Dinner Due", statusKey: "upcoming" })],
      }).presentation,
    ],
    [
      "diet-office",
      roomView({
        spaceId: "diet-office",
        keyTimes: [
          keyTime({ label: "Consult Due", statusKey: "overdue", statusLabel: "Overdue 4 min" }),
        ],
      }).presentation,
    ],
  ]);
  const board = buildOperatingLocationBoard({
    locations: scoped,
    viewsBySpaceId,
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "board",
  });
  assert.equal(board.summary.total, 1);
  assert.equal(board.locations[0]?.derivedStatus, "on_track");
  assert.equal(board.locations[0]?.keyTime?.label, "Dinner Due");
});

test("EmployeeUnitAccess-projected rooms intersect Team rooms", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]).filter(
    (row) => row.displayName === "1A – Naval Park",
  );
  const scoped = applyViewerTeamScopeToLocations(
    collected,
    new Map([
      [
        "dept-dietary",
        teamScope({
          mode: "TEAM_SCOPED",
          reason: "ACTIVE_TEAM_MEMBERSHIP",
          roomIds: ["unit-1a-servery", "unit-1b-servery"],
        }),
      ],
    ]),
    DIETARY_KEY,
  );
  assert.deepEqual(
    scoped.map((row) => row.displayName),
    ["1A – Naval Park"],
  );
});

test("Team-scoped counts and Walk List reuse the same operating rows", () => {
  const collected = collectSupervisorOperatingLocations([dietarySnapshot(dietaryTree())]);
  const scoped = applyViewerTeamScopeToLocations(
    collected,
    new Map([
      [
        "dept-dietary",
        teamScope({
          mode: "TEAM_SCOPED",
          reason: "ACTIVE_TEAM_MEMBERSHIP",
          roomIds: [
            "unit-1a-servery",
            "unit-1b-servery",
            "unit-1c-servery",
            "unit-1d-servery",
          ],
        }),
      ],
    ]),
    DIETARY_KEY,
  );
  const viewsBySpaceId = new Map<string, RunLocationOperationPresentation>([
    [
      "unit-1a-servery",
      roomView({
        spaceId: "unit-1a-servery",
        keyTimes: [keyTime({ label: "Dinner Due", statusKey: "overdue", statusLabel: "Overdue 1 min" })],
      }).presentation,
    ],
    [
      "unit-1b-servery",
      roomView({
        spaceId: "unit-1b-servery",
        keyTimes: [keyTime({ label: "Dinner Due", statusKey: "overdue", statusLabel: "Overdue 2 min" })],
      }).presentation,
    ],
    [
      "unit-1c-servery",
      roomView({
        spaceId: "unit-1c-servery",
        keyTimes: [keyTime({ label: "Dinner Due", statusKey: "due", statusLabel: "Due now" })],
      }).presentation,
    ],
  ]);
  const board = buildOperatingLocationBoard({
    locations: scoped,
    viewsBySpaceId,
    staffingByUnitId: new Map(),
    factsByUnitId: new Map(),
    sort: "board",
  });
  assert.equal(board.summary.total, 4);
  assert.equal(board.summary.needsAttention, 2);
  assert.equal(board.summary.inProgress, 1);
  assert.equal(board.summary.onTrack, 1);
  assert.equal(
    board.summary.needsAttention + board.summary.inProgress + board.summary.onTrack,
    4,
  );
  const walk = operatingBoardToWalkList(
    { ...board, locations: sortOperatingLocationsForWalk(board.locations) },
    {
      mealType: "DINNER",
      mealLabel: "Current operation",
      serviceLabel: "Current operation",
      phase: "Execution",
      scheduledTimeLabel: null,
      minutesUntilService: null,
    },
  );
  assert.equal(walk.items.length, 4);
  assert.equal(walk.summary.total, 4);
});
