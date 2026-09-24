/**
 * Phase 6Q / Group B+C — leftover dashboard / readiness / OC / TW loaders are gone.
 * Live pages and shell must not call them. Canonical replacements remain.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatCallDownReason } from "./call-down";
import { buildPresenceCallOffItems } from "./load-presence-call-offs";
import { presentHandoffsFromBoard } from "./present-handoffs-from-board";
import type { OperatingLocationBoard, OperatingLocationStatus } from "./operating-locations/types";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const CONTEXT = {
  mealType: "BREAKFAST" as const,
  mealLabel: "Current operation",
  serviceLabel: "Current operation",
  phase: "Preparation" as const,
  scheduledTimeLabel: null,
  minutesUntilService: null,
};

function location(input: {
  id: string;
  displayName?: string;
  status: "needs_attention" | "in_progress" | "on_track";
  issueSummary?: string | null;
  issues?: OperatingLocationStatus["issues"];
}): OperatingLocationStatus {
  return {
    location: {
      id: input.id,
      kind: "STANDALONE_ROOM",
      displayName: input.displayName ?? input.id,
      unitId: input.id,
      departmentKey: "DIETARY",
      departmentLabel: "Dietary",
      floorLabel: null,
      facilityOrder: 0,
      rooms: [],
    },
    displayName: input.displayName ?? input.id,
    contextLabel: null,
    href: `/unit/${input.id}`,
    staffing: {
      kind: "unknown",
      label: "Coverage unavailable",
      assignedCount: null,
      expectedCount: null,
    },
    currentOperation: { label: null, detail: null, phaseCount: 0 },
    keyTime: null,
    issues: input.issues ?? [],
    derivedStatus: input.status,
    issueSummary: input.issueSummary ?? null,
    facilityOrder: 0,
    riskPriority: 0,
    floorLabel: null,
  };
}

function board(locations: OperatingLocationStatus[]): OperatingLocationBoard {
  return {
    locations,
    summary: {
      total: locations.length,
      needsAttention: locations.filter((row) => row.derivedStatus === "needs_attention").length,
      inProgress: locations.filter((row) => row.derivedStatus === "in_progress").length,
      onTrack: locations.filter((row) => row.derivedStatus === "on_track").length,
    },
    lensMode: "DEPARTMENT",
  };
}

test("App Shell is navigation only — no readiness batch or chips", () => {
  const shell = source("src/components/app-shell.tsx");
  const sidebar = source("src/components/left-sidebar.tsx");
  const rail = source("src/components/shell-sidebar.tsx");
  const compact = source("src/components/responsive-shell-nav.tsx");
  assert.doesNotMatch(shell, /loadUnitReadinessBatch/);
  assert.doesNotMatch(shell, /ReadinessChip|readinessByUnitId/);
  assert.doesNotMatch(sidebar, /ReadinessChip|readinessByUnitId/);
  assert.doesNotMatch(rail, /readinessByUnitId/);
  assert.doesNotMatch(compact, /readinessByUnitId/);
});

test("live Today's Work pages do not call leftover dashboard lists", () => {
  const hub = source("src/app/(protected)/today/page.tsx");
  const coverage = source("src/app/(protected)/today/coverage/page.tsx");
  const handoffs = source("src/app/(protected)/today/handoffs/page.tsx");
  assert.doesNotMatch(hub, /loadCallDownList/);
  assert.match(hub, /loadPresenceCallOffs/);
  assert.doesNotMatch(coverage, /loadCoverageList|TodaysWorkCoverageList|CoverageSummaryCards|loadCallDownList/);
  assert.match(coverage, /loadPresenceCallOffs/);
  assert.match(coverage, /SupervisorDailyCoveragePanel/);
  assert.doesNotMatch(handoffs, /loadHandoffs\b/);
  assert.match(handoffs, /presentHandoffsFromBoard|assembleProjectedTodaysWorkHandoffs/);
});

test("AI snapshots do not use leftover dashboard / readiness loaders", () => {
  const operational = source("src/lib/ai/operational-snapshot/build-operational-snapshot.ts");
  const recovery = source("src/lib/ai/recovery-assistant/build-recovery-snapshot.ts");
  assert.doesNotMatch(operational, /loadWalkList|loadCoverageList|loadCallDownList|loadHandoffs/);
  assert.match(operational, /loadPresenceCallOffs/);
  assert.doesNotMatch(recovery, /loadUnitReadinessBatch|computeReadinessBatch/);
});

test("leftover engines are absent; canonical replacements remain", () => {
  for (const file of [
    "src/lib/todays-work/load-walk-list.ts",
    "src/lib/todays-work/load-coverage-list.ts",
    "src/lib/todays-work/load-call-down-list.ts",
    "src/lib/todays-work/load-handoffs.ts",
    "src/lib/readiness/compute-readiness-batch.ts",
    "src/lib/readiness/load-unit-readiness-batch.ts",
    "src/lib/operations-center/load-dashboard-queries.ts",
    "src/lib/operations-center/build-dashboard-aggregates.ts",
    "src/lib/operations-center/load-operations-center-dashboard.ts",
    "src/lib/operations-center/compute-site-pulse.ts",
    "src/lib/operations-center/projection/load.ts",
    "src/lib/readiness/compute-unit-readiness.ts",
    "src/lib/operations/resolve-heuristic-active-operation.ts",
    "src/lib/operations/resolve-active-operation.ts",
    "src/lib/operations/resolve-operations-center-active-operation.ts",
    "src/lib/operations/resolve-unit-workspace-active-operation.ts",
    "src/lib/unit-workspace/resolve-unit-operation-context.ts",
    "src/lib/business-workspace/load-workspace-inputs.ts",
    "src/lib/business-workspace/build-manager-focus.ts",
  ]) {
    assert.equal(existsSync(join(process.cwd(), file)), false, file);
  }
  assert.match(source("src/lib/todays-work/operating-locations/load.ts"), /export async function loadOperatingLocationBoard/);
  assert.match(source("src/lib/todays-work/load-presence-call-offs.ts"), /export async function loadPresenceCallOffs/);
  assert.match(source("src/lib/todays-work/present-handoffs-from-board.ts"), /export function presentHandoffsFromBoard/);
  assert.match(source("src/lib/business-workspace/dashboard/load.ts"), /export async function loadDashboardRuntime/);
});

test("redirect routes remain and leftover OC flag is gone", () => {
  const dashboard = source("src/app/(protected)/dashboard/page.tsx");
  const operations = source("src/app/(protected)/operations/page.tsx");
  const flags = source("src/lib/feature-flags.ts");
  assert.match(dashboard, /redirect/);
  assert.match(operations, /redirect/);
  assert.equal(flags.includes("PROJECTION_OPERATIONS_CENTER_ENABLED"), false);
  assert.match(flags, /parseEnvFlag\(process.env.PROJECTION_LOCATIONS_ENABLED, true\)/);
  assert.match(flags, /parseEnvFlag\(process.env.PROJECTION_SIDEBAR_ENABLED, true\)/);
  assert.match(flags, /parseEnvFlag\(process.env.PROJECTION_TODAYS_WORK_ENABLED, false\)/);
  assert.match(flags, /parseEnvFlag\(process.env.PROJECTION_BUSINESS_WORKSPACE_ENABLED, false\)/);
  assert.match(flags, /parseEnvFlag\(process.env.TODAYS_WORK_ENABLED, true\)/);
  assert.match(flags, /parseEnvFlag\(process.env.OPERATION_ENGINE_ENABLED, false\)/);
});

test("runtime publication scan targets RLS prefetch, not leftover TW load.ts", () => {
  const scan = source("src/lib/operational-cycles/operational-type-publication.hermetic.test.ts");
  assert.match(scan, /src\/lib\/runtime-location-state\/prefetch\.ts/);
  assert.doesNotMatch(scan, /todays-work\/operating-locations\/load\.ts/);
  assert.match(source("src/lib/runtime-location-state/prefetch.ts"), /perspective:\s*"runtime"/);
});

test("presence call-offs keep parsed reasons and do not score coverage", () => {
  const items = buildPresenceCallOffItems({
    dateIso: "2026-09-22",
    overrides: [
      {
        id: "ov-1",
        employeeId: "e1",
        employeeFirstName: "Jane",
        employeeLastName: "Smith",
        oldUnitId: "unit-a",
        oldUnitName: "3A",
        newUnitId: "unit-b",
        newUnitName: "Kitchen",
        mealType: "BREAKFAST",
        reason: formatCallDownReason("call-off", "sick"),
        changedAt: new Date("2026-09-22T12:00:00.000Z"),
      },
      {
        id: "ov-2",
        employeeId: "e2",
        employeeFirstName: "Skip",
        employeeLastName: "Me",
        oldUnitId: null,
        oldUnitName: null,
        newUnitId: "unit-b",
        newUnitName: "Kitchen",
        mealType: null,
        reason: "Moved for training",
        changedAt: new Date("2026-09-22T11:00:00.000Z"),
      },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.employeeName, "Jane Smith");
  assert.equal(items[0]?.status, "open");
  assert.equal(items[0]?.statusLabel, "Call-off");
  assert.equal(items[0]?.staffingHref, "/staffing?date=2026-09-22");
  assert.match(items[0]?.coverageHref ?? "", /\/staffing\/assignments\?date=2026-09-22/);
});

test("handoffs present only RLS attention and presence call-offs", () => {
  const presented = presentHandoffsFromBoard({
    operationContext: CONTEXT,
    board: board([
      location({
        id: "unit-blocked",
        displayName: "3A Servery",
        status: "needs_attention",
        issueSummary: "Open repair",
        issues: [{ kind: "repair", label: "Dishwasher", spaceId: null, spaceName: null }],
      }),
      location({ id: "unit-ok", displayName: "4B", status: "on_track" }),
    ]),
    callOffs: {
      dateIso: "2026-09-22",
      summary: { total: 1, open: 1, covered: 0 },
      items: [
        {
          id: "cd-1",
          employeeName: "Jane Smith",
          templateKey: "call-off",
          templateLabel: "Call-off",
          reason: "Call-off: sick",
          reasonDetails: "sick",
          oldUnitId: "unit-blocked",
          oldUnitName: "3A Servery",
          newUnitId: "unit-ok",
          newUnitName: "4B",
          mealType: "BREAKFAST",
          status: "open",
          statusLabel: "Call-off",
          changedAt: new Date("2026-09-22T12:00:00.000Z"),
          staffingHref: "/staffing?date=2026-09-22",
          coverageHref: "/staffing/assignments?date=2026-09-22",
        },
      ],
    },
  });
  assert.equal(presented.sections.length, 2);
  assert.equal(presented.summary.total, 2);
  assert.equal(presented.isClear, false);
  assert.ok(presented.sections.some((section) => section.key === "locations"));
  assert.ok(presented.sections.some((section) => section.key === "call-offs"));
  assert.equal(
    presented.sections.flatMap((section) => section.items).some((item) => item.category === "coverage_gap"),
    false,
  );
});
