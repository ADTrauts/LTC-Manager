import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { presentOperatingRhythmRoots } from "./operating-rhythm";
import {
  formatRecordsGuidance,
  formatLocationGuidance,
  formatOperatingRhythmGuidance,
  formatPeopleGuidance,
  formatWorkGuidance,
  presentOverviewGuidance,
  resolveOverviewProductIdentity,
} from "./overview-guidance";
import type { CycleLifecycleRow } from "@/lib/operational-cycles/cycle-lifecycle";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function row(partial: Partial<CycleLifecycleRow> & { stableKey: string; status: "DRAFT" | "PUBLISHED" }): CycleLifecycleRow {
  return {
    id: partial.id ?? partial.stableKey,
    stableKey: partial.stableKey,
    parentStableKey: partial.parentStableKey ?? null,
    nodeKind: partial.nodeKind ?? "PERIOD",
    version: 1,
    label: partial.label ?? partial.stableKey,
    description: null,
    cycleType: "CUSTOM",
    displaySequence: 10,
    startLocal: partial.startLocal ?? "07:00",
    endLocal: partial.endLocal ?? "09:00",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: partial.effectiveFrom ?? new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: partial.effectiveTo ?? null,
    mealType: null,
    locationMode: "ALL_DEPARTMENT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    roomTypeKey: null,
    expectedMilestones: [],
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
    status: partial.status,
    publishedAt: null,
    retiredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Overview guidance derivation", () => {
  it("identifies Vssyl Department Products without exposing keys as the title", () => {
    assert.deepEqual(resolveOverviewProductIdentity("DIETARY"), {
      name: "Healthcare Food & Nutrition",
      isVssylProduct: true,
    });
    assert.deepEqual(resolveOverviewProductIdentity("HEALTHCARE_FOOD_NUTRITION"), {
      name: "Healthcare Food & Nutrition",
      isVssylProduct: true,
    });
    assert.equal(resolveOverviewProductIdentity("LAUNDRY").isVssylProduct, false);
  });

  it("describes empty, live, draft, and scheduled rhythm without scoring", () => {
    assert.equal(
      formatOperatingRhythmGuidance({
        departmentKey: "DIETARY",
        currentRootLabels: [],
        draftRootCount: 0,
        scheduledCount: 0,
        scheduledEffectiveFrom: null,
      }).status,
      "Not configured",
    );
    assert.match(
      formatOperatingRhythmGuidance({
        departmentKey: "DIETARY",
        currentRootLabels: ["Breakfast", "Lunch", "Dinner"],
        draftRootCount: 0,
        scheduledCount: 0,
        scheduledEffectiveFrom: null,
      }).status,
      /Breakfast, Lunch, and Dinner live/,
    );
    assert.match(
      formatOperatingRhythmGuidance({
        departmentKey: "DIETARY",
        currentRootLabels: ["Breakfast"],
        draftRootCount: 3,
        scheduledCount: 0,
        scheduledEffectiveFrom: null,
      }).status,
      /3 drafts not live/,
    );
    assert.match(
      formatOperatingRhythmGuidance({
        departmentKey: "EVS",
        currentRootLabels: [],
        draftRootCount: 0,
        scheduledCount: 1,
        scheduledEffectiveFrom: "2026-09-28",
      }).status,
      /Changes scheduled for 2026-09-28/,
    );
    assert.match(
      formatOperatingRhythmGuidance({
        departmentKey: "PLANT",
        currentRootLabels: [],
        draftRootCount: 0,
        scheduledCount: 0,
        scheduledEffectiveFrom: null,
      }).status,
      /Not required/,
    );
  });

  it("derives locations, people, work, and record facts", () => {
    assert.equal(formatLocationGuidance(0).status, "No locations assigned");
    assert.equal(formatLocationGuidance(0).href, "/admin/facility/builder");
    assert.equal(formatLocationGuidance(12).status, "12 assigned");
    assert.equal(formatPeopleGuidance(0).status, "No people assigned");
    assert.equal(formatPeopleGuidance(18).status, "18 assigned");
    assert.equal(formatWorkGuidance({ departmentKey: "DIETARY", publishedWorkPlanCount: 0, draftWorkPlanCount: 0 }).status, "No recurring work configured");
    assert.equal(formatWorkGuidance({ departmentKey: "PLANT", publishedWorkPlanCount: 0, draftWorkPlanCount: 0 }).applicable, false);
    assert.equal(formatWorkGuidance({ departmentKey: "DIETARY", publishedWorkPlanCount: 3, draftWorkPlanCount: 2 }).status, "3 live work plans · 2 drafts not live");
    assert.equal(formatRecordsGuidance(0).status, "No records required yet");
    assert.equal(formatRecordsGuidance(8).status, "8 record requirements");
  });

  it("presents a mature Dietary department as complete facts", () => {
    const rows = presentOverviewGuidance({
      departmentId: "dept1",
      departmentKey: "DIETARY",
      departmentName: "Dietary",
      locationCount: 18,
      currentRootLabels: ["Breakfast", "Lunch", "Dinner"],
      draftRootCount: 0,
      scheduledCount: 0,
      scheduledEffectiveFrom: null,
      memberCount: 92,
      publishedWorkPlanCount: 3,
      draftWorkPlanCount: 0,
      placedLogCount: 8,
    });
    assert.deepEqual(
      rows.map((row) => [row.id, row.status]),
      [
        ["locations", "18 assigned"],
        ["rhythm", "Breakfast, Lunch, and Dinner live"],
        ["people", "92 assigned"],
        ["work", "3 live work plans"],
        ["records", "8 record requirements"],
      ],
    );
    assert.doesNotMatch(JSON.stringify(rows), /67%|setup complete|configurationStatus/i);
  });

  it("points Work at Locations when published operational types have no matching rooms", () => {
    const rows = presentOverviewGuidance({
      departmentId: "dept1",
      departmentKey: "DIETARY",
      departmentName: "Dietary",
      locationCount: 18,
      currentRootLabels: ["Breakfast"],
      draftRootCount: 0,
      scheduledCount: 0,
      scheduledEffectiveFrom: null,
      memberCount: 12,
      publishedWorkPlanCount: 1,
      draftWorkPlanCount: 0,
      placedLogCount: 0,
      publishedWorkOperationalTypeKeys: ["servery"],
      classifiedOperationalTypeKeys: ["main_kitchen", "retail"],
    });
    const work = rows.find((row) => row.id === "work")!;
    assert.match(work.description, /no bound room/);
    assert.match(work.href, /locations/);
    assert.equal(work.actionLabel, "Configure locations →");
  });

  it("does not persist readiness language in Overview or All Departments", () => {
    const overview = source("src/app/(protected)/admin/departments/[departmentId]/overview-panel.tsx");
    const all = source("src/app/(protected)/admin/departments/page.tsx");
    const summary = source("src/lib/department-administration/builder-context-summary.ts");
    assert.match(overview, /overview-product-identity/);
    assert.match(overview, /Product: \{settings\.productName\}/);
    assert.doesNotMatch(overview, /configurationStatus|setupComplete|readinessStatus/);
    assert.doesNotMatch(summary, /configurationStatus|setupComplete/);
    assert.match(all, />Enabled</);
    assert.doesNotMatch(all, /Operationally active/);
  });
});

describe("Operating rhythm presentation", () => {
  it("separates live windows from draft changes", () => {
    const roots = presentOperatingRhythmRoots(
      [
        row({
          id: "live-b",
          stableKey: "breakfast",
          label: "Breakfast",
          status: "PUBLISHED",
          startLocal: "07:00",
          endLocal: "09:00",
          effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        }),
        row({
          id: "draft-b",
          stableKey: "breakfast",
          label: "Breakfast",
          status: "DRAFT",
          startLocal: "07:00",
          endLocal: "09:30",
          effectiveFrom: new Date("2026-09-28T00:00:00.000Z"),
        }),
      ],
      "2026-09-27",
    );
    assert.equal(roots.length, 1);
    assert.ok(roots[0]?.liveWindow);
    assert.ok(roots[0]?.draftWindow);
    assert.equal(roots[0]?.draftCycleId, "draft-b");
  });
});
