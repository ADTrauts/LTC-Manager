import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { composeLocationProgram } from "@/lib/department-administration/location-program";

import {
  deriveRuntimeLocationAnswers,
  HAPPENING_NONE_LABEL,
  HAPPENING_UNPROGRAMMED_LABEL,
  withRuntimeLocationAnswers,
} from "./answers";
import { composeRuntimeLocationStates } from "./compose";
import { DEFERRED_READINESS, type RuntimeLocationState } from "./types";

const TZ = "UTC";

function emptyState(partial: {
  attached?: boolean;
  cycle?: string | null;
  slots?: RuntimeLocationState["coverage"]["slots"];
  exceptions?: RuntimeLocationState["exceptions"];
  dueNow?: string[];
  overdue?: string[];
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
}): Omit<RuntimeLocationState, "answers"> {
  const attached = partial.attached ?? true;
  return {
    identity: {
      location: {
        kind: "SPACE",
        spaceId: "kitchen-1",
        unitId: "unit-1",
        departmentId: "dept-1",
        facilityId: "fac-1",
      },
      displayName: "Main Kitchen",
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "1",
        neighborhoodName: null,
        unitName: "Kitchen",
        spaceName: "Main Kitchen",
      },
      physical: { roomTypeKey: "production", roomTypeLabel: "Production Space" },
    },
    program: {
      locationProgram: composeLocationProgram({
        departmentId: "dept-1",
        departmentName: "Dietary",
        location: {
          spaceId: "kitchen-1",
          name: "Main Kitchen",
          neighborhoodName: null,
          floorName: "1",
          facilityTypeLabel: "Production Space",
          facilityRoomTypeId: "type-prod",
          responsible: true,
        },
        teams: attached ? [{ id: "culinary", name: "Culinary", spaceIds: ["kitchen-1"] }] : [],
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
    next: null,
    asOf: {
      now: new Date("2026-08-17T07:30:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: TZ,
    },
  };
}

test("unprogrammed room: happening is unprogrammed, pace idle, no invented cycle", () => {
  const answers = deriveRuntimeLocationAnswers(emptyState({ attached: false }));
  assert.equal(answers.happening.state, "unprogrammed");
  assert.equal(answers.happening.label, HAPPENING_UNPROGRAMMED_LABEL);
  assert.equal(answers.cycle.open, null);
  assert.equal(answers.pace, "idle");
  assert.deepEqual(answers.responsible.teams, []);
  assert.deepEqual(answers.wrong, []);
});

test("programmed room with no open cycle is none / idle", () => {
  const answers = deriveRuntimeLocationAnswers(emptyState({ attached: true }));
  assert.equal(answers.happening.state, "none");
  assert.equal(answers.happening.label, HAPPENING_NONE_LABEL);
  assert.equal(answers.cycle.open, null);
  assert.equal(answers.pace, "idle");
  assert.equal(answers.responsible.teams[0]?.name, "Culinary");
});

test("open cycle + covered need + no exceptions is ready", () => {
  const answers = deriveRuntimeLocationAnswers(
    emptyState({
      cycle: "breakfast",
      slots: [
        {
          expectationId: "team-need:culinary:breakfast",
          templateStableKey: "location-program:culinary",
          templateVersion: 1,
          roleKey: "TEAM:culinary",
          roleLabel: "Culinary",
          requiredCount: 5,
          filledCount: 5,
          state: "COVERED",
          cycleStableKey: "breakfast",
          assignmentIds: ["oa-1"],
          assignmentRefs: [
            {
              assignmentId: "oa-1",
              employeeId: "emp-1",
              employeeDisplayName: "Jordan Lee",
            },
          ],
        },
      ],
    }),
  );
  assert.equal(answers.happening.state, "active");
  assert.equal(answers.happening.label, "Breakfast · Active");
  assert.equal(answers.cycle.open?.cycleStableKey, "breakfast");
  assert.equal(answers.pace, "ready");
  assert.equal(answers.responsible.need[0]?.requiredCount, 5);
  assert.equal(answers.responsible.need[0]?.filledCount, 5);
  assert.equal(answers.responsible.need[0]?.teamId, "culinary");
  assert.equal(answers.responsible.assigned[0]?.employeeDisplayName, "Jordan Lee");
});

test("open cycle + due-now evidence is on_time, not ready", () => {
  const answers = deriveRuntimeLocationAnswers(
    emptyState({
      cycle: "breakfast",
      dueNow: ["open-check"],
      evidenceItems: [
        {
          requirementKey: "open-check",
          attachmentId: "att-1",
          catalogStableKey: "opening",
          displayName: "Opening Checklist",
          productState: "DUE",
          cycleStableKey: "breakfast",
          window: { start: "06:00", end: "10:00" },
          recordId: null,
          href: "/logs/open-check",
          needsSupervisorReview: false,
        },
      ],
    }),
  );
  assert.equal(answers.pace, "on_time");
  assert.equal(answers.evidenceDue.dueNow[0]?.label, "Opening Checklist");
  assert.equal(answers.evidenceDue.dueNow[0]?.href, "/logs/open-check");
});

test("short team need is at_risk and lists who is assigned", () => {
  const answers = deriveRuntimeLocationAnswers(
    emptyState({
      cycle: "breakfast",
      slots: [
        {
          expectationId: "team-need:culinary:breakfast",
          templateStableKey: "location-program:culinary",
          templateVersion: 1,
          roleKey: "TEAM:culinary",
          roleLabel: "Culinary",
          requiredCount: 5,
          filledCount: 3,
          state: "AT_RISK",
          cycleStableKey: "breakfast",
          assignmentIds: ["oa-1", "oa-2", "oa-3"],
          assignmentRefs: [
            { assignmentId: "oa-1", employeeId: "a", employeeDisplayName: "A" },
            { assignmentId: "oa-2", employeeId: "b", employeeDisplayName: "B" },
            { assignmentId: "oa-3", employeeId: "c", employeeDisplayName: "C" },
          ],
        },
      ],
      exceptions: [
        {
          source: "coverage",
          state: "AT_RISK",
          location: {
            kind: "SPACE",
            spaceId: "kitchen-1",
            unitId: "unit-1",
            departmentId: "dept-1",
            facilityId: "fac-1",
          },
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: null },
          label: "Culinary at risk",
          href: null,
        },
      ],
    }),
  );
  assert.equal(answers.pace, "at_risk");
  assert.equal(answers.wrong[0]?.label, "Culinary at risk");
  assert.equal(answers.responsible.assigned.length, 3);
  assert.equal(answers.responsible.need[0]?.filledCount, 3);
});

test("answers carry next and overdue evidence labels", () => {
  const state = emptyState({
    cycle: "breakfast",
    overdue: ["temp"],
    evidenceItems: [
      {
        requirementKey: "temp",
        attachmentId: "att-temp",
        catalogStableKey: "temp",
        displayName: "Food Temperature",
        productState: "OVERDUE",
        cycleStableKey: "breakfast",
        window: { start: "07:00", end: "08:00" },
        recordId: null,
        href: "/logs/temp",
        needsSupervisorReview: false,
      },
    ],
  });
  const withNext = {
    ...state,
    next: {
      kind: "evidence_window" as const,
      at: new Date("2026-08-17T08:00:00.000Z"),
      label: "Food Temperature",
      sourceId: "temp",
    },
  };
  const answers = deriveRuntimeLocationAnswers(withNext);
  assert.equal(answers.pace, "at_risk");
  assert.equal(answers.evidenceDue.overdue[0]?.label, "Food Temperature");
  assert.equal(answers.next?.label, "Food Temperature");
});

test("does not invent a health score or revive the readiness engine", () => {
  const answers = deriveRuntimeLocationAnswers(emptyState({ cycle: "breakfast" }));
  const json = JSON.stringify(answers);
  assert.doesNotMatch(json, /health|score|readiness/i);
  assert.equal(withRuntimeLocationAnswers(emptyState({})).readiness.availability, "deferred_legacy_engine");
});

test("compose attaches answers on every Runtime Location State", () => {
  const states = composeRuntimeLocationStates({
    facilityId: "fac-1",
    facilityName: "Harbor",
    now: new Date("2026-08-17T15:00:00.000Z"),
    operationalDateKey: "2026-08-17",
    timezone: TZ,
    nowLocalHhMm: "15:00",
    operationalAssignmentsEnabled: true,
    spaces: [
      {
        spaceId: "closet-1",
        name: "Closet",
        unitId: "unit-1",
        unitName: "1",
        departmentId: "dept-1",
        departmentLabel: "Dietary",
        floorName: "1",
        neighborhoodName: null,
        roomTypeKey: null,
        roomTypeLabel: null,
        facilityRoomTypeId: null,
      },
    ],
    profilesByDepartmentId: new Map(),
    operationalTypesBySpaceId: new Map(),
    runModelsByDepartmentId: new Map(),
    coverageTemplatesByDepartmentId: new Map(),
    coveragePlanByDepartmentId: new Map(),
    assignmentsByDepartmentId: new Map(),
    evidenceBySpaceId: new Map(),
    assetsBySpaceId: new Map(),
    issuesBySpaceId: new Map(),
    serveryEventsByUnitId: new Map(),
    programsBySpaceId: new Map(),
  });
  assert.equal(states[0]?.answers.happening.state, "unprogrammed");
  assert.equal(states[0]?.answers.pace, "idle");
});

test("answers module stays a pure projection", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/runtime-location-state/answers.ts"), "utf8");
  const compose = readFileSync(join(process.cwd(), "src/lib/runtime-location-state/compose.ts"), "utf8");
  assert.doesNotMatch(src, /prisma|loadRuntimeLocationStates|ExceptionFirstLocationCard/);
  assert.match(compose, /deriveRuntimeLocationAnswers/);
});
