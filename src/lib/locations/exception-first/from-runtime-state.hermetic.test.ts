/**
 * Exception-first Location cards from Runtime Location State answers.
 * Pure presenter. No Prisma. No hierarchy product.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { composeLocationProgram } from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  HAPPENING_NONE_LABEL,
  HAPPENING_UNPROGRAMMED_LABEL,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";

import {
  presentExceptionFirstLocationBoard,
  presentExceptionFirstLocationCard,
} from "./from-runtime-state";

const TZ = "UTC";
const NOW = new Date("2026-08-17T07:30:00.000Z");

function locationId(spaceId: string) {
  return {
    kind: "SPACE" as const,
    spaceId,
    unitId: "unit-1",
    departmentId: "dept-1",
    facilityId: "fac-1",
  };
}

function emptyState(partial: {
  spaceId?: string;
  name?: string;
  neighborhood?: string | null;
  attached?: boolean;
  cycle?: string | null;
  slots?: RuntimeLocationState["coverage"]["slots"];
  exceptions?: RuntimeLocationState["exceptions"];
  dueNow?: string[];
  overdue?: string[];
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
  nextLabel?: string | null;
}): RuntimeLocationState {
  const spaceId = partial.spaceId ?? "kitchen-1";
  const name = partial.name ?? "Main Kitchen";
  const attached = partial.attached ?? true;
  const loc = locationId(spaceId);
  return withRuntimeLocationAnswers({
    identity: {
      location: loc,
      displayName: name,
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "1",
        neighborhoodName: partial.neighborhood ?? null,
        unitName: "Kitchen",
        spaceName: name,
      },
      physical: { roomTypeKey: "production", roomTypeLabel: "Production Space" },
    },
    program: {
      locationProgram: composeLocationProgram({
        departmentId: "dept-1",
        departmentName: "Dietary",
        location: {
          spaceId,
          name,
          neighborhoodName: partial.neighborhood ?? null,
          floorName: "1",
          facilityTypeLabel: "Production Space",
          facilityRoomTypeId: "type-prod",
          responsible: true,
        },
        teams: attached ? [{ id: "culinary", name: "Culinary", spaceIds: [spaceId] }] : [],
        teamCycles: attached
          ? [
              {
                teamId: "culinary",
                cycleStableKey: "breakfast",
                label: "Breakfast",
                startLocal: "06:00",
                endLocal: "10:00",
                requiredCount: 5,
                grain: "TOTAL",
              },
            ]
          : [],
        cyclePlacements: [],
        spaceLogs: [],
        assetLogs: [],
        typeDefaults: [],
        suppressions: [],
        assets: [],
      }),
      operationalType: {
        state: "unassigned",
        key: null,
        name: null,
        id: null,
        profileId: null,
        profileVersion: null,
        profileStatus: null,
      },
      cycleSetRef: null,
      coverageExpectationRefs: [],
      logAttachmentRefs: [],
    },
    operation: {
      state: partial.cycle ? "ACTIVE" : "NONE",
      current: partial.cycle
        ? {
            cycleStableKey: partial.cycle,
            cycleVersion: 1,
            label: "Breakfast",
            hierarchyLabel: "Breakfast",
            window: { start: "06:00", end: "10:00" },
            timing: {
              configured: "06:00",
              adjusted: null,
              expectedToday: "06:00",
              actual: null,
              recordedAt: null,
            },
          }
        : null,
      upcoming: null,
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: {
      availability: "evaluated",
      planLifecycle: "RUNTIME_VISIBLE",
      slots: partial.slots ?? [],
    },
    evidence: {
      requiredToday: (partial.dueNow?.length ?? 0) + (partial.overdue?.length ?? 0),
      dueNow: partial.dueNow ?? [],
      upcoming: [],
      completed: [],
      overdue: partial.overdue ?? [],
      needsReview: [],
      correctiveOpen: [],
      items: partial.evidenceItems ?? [],
    },
    assets: { assets: [], openIssues: [], issuesAffectingOperation: [] },
    milestones: { items: [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: partial.exceptions ?? [],
    next:
      partial.nextLabel === null
        ? null
        : partial.nextLabel
          ? {
              kind: "evidence_window",
              at: new Date("2026-08-17T08:30:00.000Z"),
              label: partial.nextLabel,
              sourceId: "next-1",
            }
          : null,
    asOf: {
      now: NOW,
      operationalDateKey: "2026-08-17",
      timezone: TZ,
    },
  });
}

function coverageException(spaceId: string, label: string): RuntimeLocationState["exceptions"][number] {
  return {
    source: "coverage",
    state: "UNCOVERED",
    location: locationId(spaceId),
    operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: null },
    label,
    href: null,
  };
}

test("at-risk kitchen card is exception-first: pace, need, two wrongs, evidence, workspace href", () => {
  const card = presentExceptionFirstLocationCard(
    emptyState({
      cycle: "breakfast",
      slots: [
        {
          expectationId: "e1",
          templateStableKey: "breakfast",
          templateVersion: 1,
          roleKey: "TEAM:culinary",
          roleLabel: "Culinary",
          requiredCount: 5,
          filledCount: 3,
          state: "UNCOVERED",
          cycleStableKey: "breakfast",
          assignmentIds: [],
          assignmentRefs: [],
        },
      ],
      exceptions: [
        coverageException("kitchen-1", "Culinary short 2"),
        {
          source: "evidence",
          state: "OVERDUE",
          location: locationId("kitchen-1"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: null },
          label: "Hot holding temp overdue",
          href: null,
        },
        {
          source: "asset_issue",
          state: "EQUIPMENT_UNAVAILABLE",
          location: locationId("kitchen-1"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: null },
          label: "Steam table down",
          href: null,
        },
      ],
      overdue: ["temp-log"],
      evidenceItems: [
        {
          requirementKey: "temp-log",
          attachmentId: "a1",
          catalogStableKey: "temp",
          displayName: "Hot holding temp",
          productState: "OVERDUE",
          cycleStableKey: "breakfast",
          window: { start: "06:00", end: "10:00" },
          recordId: null,
          href: null,
          needsSupervisorReview: false,
        },
      ],
      nextLabel: "Lunch start",
    }),
  );

  assert.equal(card.name, "Main Kitchen");
  assert.equal(card.place, "1 · Production Space");
  assert.equal(card.pace, "at_risk");
  assert.equal(card.emphasized, true);
  assert.equal(card.badge.label, "At risk");
  assert.equal(card.happeningLabel, "Breakfast · Active");
  assert.equal(card.cycleLabel, "Breakfast · 06:00–10:00");
  assert.equal(card.responsibleLabel, "Culinary · 3 of 5");
  assert.deepEqual(card.wrongLabels, ["Culinary short 2", "Hot holding temp overdue"]);
  assert.equal(card.moreWrongCount, 1);
  assert.equal(card.evidenceLabel, "Hot holding temp overdue");
  assert.equal(card.nextLabel, "Next: Lunch start · 8:30 AM");
  assert.equal(card.href, "/unit/unit-1?space=kitchen-1#coverage");
  assert.doesNotMatch(JSON.stringify(card), /Operational Type/);
});

test("unprogrammed retail is compact and not a hierarchy dump", () => {
  const card = presentExceptionFirstLocationCard(
    emptyState({
      spaceId: "retail-1",
      name: "Retail",
      neighborhood: "Front",
      attached: false,
    }),
  );

  assert.equal(card.happeningState, "unprogrammed");
  assert.equal(card.happeningLabel, HAPPENING_UNPROGRAMMED_LABEL);
  assert.equal(card.badge.label, "Not programmed");
  assert.equal(card.pace, "idle");
  assert.equal(card.emphasized, false);
  assert.equal(card.cycleLabel, null);
  assert.equal(card.responsibleLabel, null);
  assert.deepEqual(card.wrongLabels, []);
  assert.equal(card.evidenceLabel, null);
  assert.equal(card.place, "Front · 1 · Production Space");
  assert.equal(card.href, "/unit/unit-1?space=retail-1");
  const json = JSON.stringify(card);
  assert.doesNotMatch(json, /Operational Type not assigned/);
  assert.doesNotMatch(json, /floor → neighborhood/);
});

test("ready active room is quiet; idle programmed room stays after at-risk", () => {
  const ready = presentExceptionFirstLocationCard(
    emptyState({
      spaceId: "terminal-1",
      name: "Central Terminal",
      cycle: "breakfast",
      slots: [
        {
          expectationId: "e2",
          templateStableKey: "breakfast",
          templateVersion: 1,
          roleKey: "TEAM:culinary",
          roleLabel: "Culinary",
          requiredCount: 2,
          filledCount: 2,
          state: "COVERED",
          cycleStableKey: "breakfast",
          assignmentIds: [],
          assignmentRefs: [],
        },
      ],
    }),
  );
  assert.equal(ready.pace, "ready");
  assert.equal(ready.badge.label, "Ready");
  assert.equal(ready.badge.prominence, "quiet");
  assert.equal(ready.emphasized, false);
  assert.equal(ready.href, "/unit/unit-1?space=terminal-1");

  const idle = presentExceptionFirstLocationCard(emptyState({ spaceId: "store-1", name: "Dry Store" }));
  assert.equal(idle.pace, "idle");
  assert.equal(idle.happeningLabel, HAPPENING_NONE_LABEL);
  assert.equal(idle.responsibleLabel, "Culinary");
});

test("board sorts at_risk, then on_time, ready, idle, then unprogrammed", () => {
  const board = presentExceptionFirstLocationBoard({
    states: [
      emptyState({ spaceId: "retail-1", name: "Retail", attached: false }),
      emptyState({ spaceId: "store-1", name: "Dry Store" }),
      emptyState({
        spaceId: "terminal-1",
        name: "Central Terminal",
        cycle: "breakfast",
      }),
      emptyState({
        spaceId: "cafe-1",
        name: "Cafe",
        cycle: "breakfast",
        dueNow: ["open-check"],
        evidenceItems: [
          {
            requirementKey: "open-check",
            attachmentId: "a2",
            catalogStableKey: "open",
            displayName: "Opening check",
            productState: "DUE",
            cycleStableKey: "breakfast",
            window: { start: "06:00", end: "10:00" },
            recordId: null,
            href: null,
            needsSupervisorReview: false,
          },
        ],
      }),
      emptyState({
        spaceId: "kitchen-1",
        name: "Main Kitchen",
        cycle: "breakfast",
        exceptions: [coverageException("kitchen-1", "Culinary short 2")],
        slots: [
          {
            expectationId: "e1",
            templateStableKey: "breakfast",
            templateVersion: 1,
            roleKey: "TEAM:culinary",
            roleLabel: "Culinary",
            requiredCount: 5,
            filledCount: 3,
            state: "UNCOVERED",
            cycleStableKey: "breakfast",
            assignmentIds: [],
            assignmentRefs: [],
          },
        ],
      }),
    ],
  });

  assert.deepEqual(
    board.cards.map((card) => card.name),
    ["Main Kitchen", "Cafe", "Central Terminal", "Dry Store", "Retail"],
  );
  assert.deepEqual(
    board.cards.map((card) => card.pace),
    ["at_risk", "on_time", "ready", "idle", "idle"],
  );
  assert.equal(board.cards[4]!.happeningState, "unprogrammed");
  assert.equal(board.spaceCount, 5);
  assert.equal(board.attentionCount, 1);
});

test("presenter and units page do not query, persist, or copy the hierarchy product", () => {
  const presenter = readFileSync(
    join(process.cwd(), "src/lib/locations/exception-first/from-runtime-state.ts"),
    "utf8",
  );
  const page = readFileSync(join(process.cwd(), "src/app/(protected)/units/page.tsx"), "utf8");

  assert.doesNotMatch(presenter, /prisma|ScheduleEntry|loadPublishedRunModel|evaluateCoverage/);
  assert.doesNotMatch(presenter, /LocationsHierarchyBrowser|Operational Type not assigned/);
  assert.match(page, /presentExceptionFirstLocationBoard/);
  assert.match(page, /ExceptionFirstLocationsBoard/);
  assert.doesNotMatch(page, /LocationsHierarchyBrowser/);
  assert.doesNotMatch(page, /buildLocationsLandingPresentation/);
});
