/**
 * Phase 2C-2H-3 — final active generic Work consumer reconciliation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { WorkRequirement } from "@/lib/department-work/types";
import { MARKETPLACE_FAMILIES } from "@/lib/harbor-console/console-catalog-browse";
import {
  buildDeterministicLocationSequence,
  workRequirementsForLocationSequencing,
} from "@/lib/scheduling/operational-assignments/location-sequencing";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";

function work(
  partial: Partial<WorkRequirement> & {
    occurrenceKey: string;
    spaceId: string;
    sourceKind: WorkRequirement["sourceKind"];
    priority?: WorkRequirement["priority"];
    state?: WorkRequirement["state"];
  },
): WorkRequirement {
  return {
    occurrenceKey: partial.occurrenceKey,
    workPlanId: partial.sourceKind === "ONE_OFF" ? "" : "wp",
    workPlanStableKey: partial.sourceKind === "ONE_OFF" ? "one_off" : "plan",
    workPlanVersion: partial.sourceKind === "ONE_OFF" ? 0 : 1,
    workPlanName: partial.sourceKind === "ONE_OFF" ? "One-off" : "Plan",
    workItemId: "item",
    workItemKey: "item",
    label: partial.label ?? partial.occurrenceKey,
    instructions: null,
    priority: partial.priority ?? "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    dueAt: null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "unit-a",
    unitName: "East",
    spaceId: partial.spaceId,
    assetId: null,
    roleKeys: [],
    knowledgeArticleId: null,
    procedureTitle: null,
    linkedTemplateStableKey: null,
    linkedTemplateId: null,
    state: partial.state ?? "CURRENT",
    occurrenceId: null,
    occurrenceStatus: null,
    assignedEmployeeId: null,
    completedByLabel: null,
    completedAt: null,
    evidenceRecordId: null,
    sourceKind: partial.sourceKind,
    sourceHref: null,
  };
}

function locations(): ResolvedAssignmentLocation[] {
  return [
    {
      unitSpaceId: "s1",
      unitId: "u1",
      label: "Room 101",
      sortOrder: 10,
      roomNumber: "101",
      spaceName: "Room 101",
      unitName: "East",
    },
    {
      unitSpaceId: "s2",
      unitId: "u1",
      label: "Room 102",
      sortOrder: 20,
      roomNumber: "102",
      spaceName: "Room 102",
      unitName: "East",
    },
  ];
}

test("WORK_PLAN does not influence location sequencing; ONE_OFF may", () => {
  const locs = locations();
  const planUrgent = work({
    occurrenceKey: "plan-urgent",
    spaceId: "s2",
    sourceKind: "WORK_PLAN",
    priority: "URGENT",
  });
  const planOnly = buildDeterministicLocationSequence({
    locations: locs,
    workRequirements: [planUrgent],
  });
  assert.equal(planOnly.now?.unitSpaceId, "s1");
  assert.equal(planOnly.next, null);
  assert.equal(workRequirementsForLocationSequencing([planUrgent]).length, 0);

  const oneOff = work({
    occurrenceKey: "oo-urgent",
    spaceId: "s2",
    sourceKind: "ONE_OFF",
    priority: "URGENT",
  });
  const withOneOff = buildDeterministicLocationSequence({
    locations: locs,
    workRequirements: [planUrgent, oneOff],
  });
  assert.equal(withOneOff.now?.unitSpaceId, "s2");
});

test("empty sequencing inputs stay deterministic Assignment order", () => {
  const seq = buildDeterministicLocationSequence({
    locations: locations(),
    workRequirements: [],
  });
  assert.equal(seq.now?.unitSpaceId, "s1");
  assert.equal(seq.next, null);
  assert.equal(seq.queue.length, 0);
  assert.match(seq.sequencingNote, /not an optimized walking route/i);
});

test("Harbor Marketplace no longer advertises Work family or WORK_PRESET discovery", () => {
  assert.equal(MARKETPLACE_FAMILIES.some((row) => row.key === "work"), false);
  const root = process.cwd();
  const catalog = readFileSync(join(root, "src/lib/harbor-console/console-catalog.ts"), "utf8");
  assert.match(catalog, /listConsoleCatalogItems/);
  assert.match(catalog, /listConsoleWorkPresetCatalogItems/);
  const listFn = catalog.slice(
    catalog.indexOf("export async function listConsoleCatalogItems"),
    catalog.indexOf("export async function listConsoleWorkPresetCatalogItems"),
  );
  assert.equal(listFn.includes("loadWorkPresetItems"), false);

  const browse = readFileSync(join(root, "src/lib/harbor-console/console-catalog-browse.ts"), "utf8");
  assert.match(browse, /sourceType !== "WORK_PRESET"/);
});

test("partner Work nav is hidden; historical route retained", () => {
  const root = process.cwd();
  const shell = readFileSync(join(root, "src/components/partner/partner-facility-shell.tsx"), "utf8");
  assert.match(shell, /work:\s*false/);
  const page = readFileSync(join(root, "src/app/partner/work/page.tsx"), "utf8");
  assert.match(page, /partner-work-page-retired/);
  assert.match(page, /Existing plans \(read-only\)/);
  const actions = readFileSync(join(root, "src/app/partner/work/actions.ts"), "utf8");
  assert.match(actions, /GENERIC_WORK_AUTHORING_RETIRED/);
});

test("Builder overview and Plant starter no longer solicit Work Plan install", () => {
  const root = process.cwd();
  const guidance = readFileSync(
    join(root, "src/lib/department-administration/overview-guidance.ts"),
    "utf8",
  );
  assert.doesNotMatch(guidance, /Configure work/);
  assert.match(guidance, /View historical work/);
  const plant = readFileSync(
    join(root, "src/components/plant-operations/plant-starter-panel.tsx"),
    "utf8",
  );
  assert.match(plant, /item\.kind !== "work"/);
  assert.doesNotMatch(plant, /starter-work-/);
});

test("prior cutovers and authoring fences remain closed", () => {
  const root = process.cwd();
  const compose = readFileSync(join(root, "src/lib/employee-runtime-flow/compose.ts"), "utf8");
  assert.match(compose, /withoutPlanDerivedCompatibilityWork/);
  const serialize = readFileSync(
    join(root, "src/lib/employee-runtime-flow/serialize-offline.ts"),
    "utf8",
  );
  assert.match(serialize, /sourceKind === "ONE_OFF"/);
  const caps = readFileSync(join(root, "src/lib/dashboard/capabilities.ts"), "utf8");
  assert.doesNotMatch(caps, /has\.add\("work\.expected"\)/);
  assert.ok(
    exists("src/lib/department-administration/phase-2a-location-function-authoring.hermetic.test.ts"),
  );
  assert.ok(exists("src/lib/department-work/phase-2b-generic-work-authoring.hermetic.test.ts"));
});

function exists(relative: string) {
  try {
    readFileSync(join(process.cwd(), relative), "utf8");
    return true;
  } catch {
    return false;
  }
}
