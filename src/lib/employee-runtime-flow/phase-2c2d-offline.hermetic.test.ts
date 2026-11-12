/**
 * Phase 2C-2D — offline Job Flow item snapshot (additive, display vs action).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import {
  OFFLINE_COMMAND_TYPES,
  OFFLINE_JOB_FLOW_ITEM_SCHEMA_VERSION,
  type OfflineRuntimeBundle,
} from "@/lib/offline/types";
import { validateBundleForOfflineCommand } from "@/lib/offline/bundle-validation";

import { composeEmployeeRuntimeFlow } from "./compose";
import {
  offlineActionForJobFlowItem,
  readOfflineJobFlowItems,
  serializeEmployeeRuntimeJobFlowItemContext,
} from "./serialize-offline";
import type { JobFlowItem } from "./job-flow-item";

function assignment(
  partial: Partial<JobFlowAssignmentSnapshot> & { id: string },
): JobFlowAssignmentSnapshot {
  return {
    id: partial.id,
    roleKey: partial.roleKey ?? "SERVER",
    roleLabel: partial.roleLabel ?? "Server",
    unitId: partial.unitId ?? "unit-a",
    unitName: partial.unitName ?? "3A",
    startsAt: partial.startsAt ?? new Date("2026-08-17T10:00:00.000Z"),
    endsAt: partial.endsAt ?? new Date("2026-08-17T18:00:00.000Z"),
    status: partial.status ?? "ACTIVE",
    scopeKind: partial.scopeKind ?? "UNIT",
    locationCount: partial.locationCount,
    locationLabels: partial.locationLabels,
    sourceZoneName: partial.sourceZoneName ?? null,
  };
}

function sampleBundle(partial?: Partial<OfflineRuntimeBundle>): OfflineRuntimeBundle {
  return {
    bundleVersion: "2026-08-17:abc",
    serverRevision: "abc",
    issuedAt: new Date().toISOString(),
    offlineAuthorizedUntil: new Date(Date.now() + 3600_000).toISOString(),
    lastSuccessfulSyncAt: null,
    facilityId: "fac1",
    facilityTimezone: "America/New_York",
    facilityName: "Facility",
    departmentId: "dep1",
    departmentName: "Dietary",
    unitId: "unit1",
    unitName: "3A",
    deviceFacilityId: "fac1",
    deviceBoundUnitId: "unit1",
    actor: {
      displayName: "Test",
      role: "STAFF",
      authMethod: "QUICK_PIN",
      authKind: "employee",
      actorRef: "employee:emp1",
      sessionVersion: 2,
    },
    operationalDate: "2026-08-17",
    mealContext: { applicableMealType: null, label: null, expectedServiceTime: null },
    milestones: [],
    procedureLabels: [],
    ...partial,
  };
}

test("bundle compatibility: missing jobFlowItemContext falls back safely", () => {
  const legacy = sampleBundle();
  assert.equal(legacy.jobFlowItemContext, undefined);
  assert.deepEqual(readOfflineJobFlowItems(legacy), []);
  const scope = validateBundleForOfflineCommand({
    bundle: legacy,
    facilityId: "fac1",
    unitId: "unit1",
    actorRef: "employee:emp1",
    sessionVersion: 2,
    deviceFacilityId: "fac1",
    deviceBoundUnitId: "unit1",
  });
  assert.equal(scope.ok, true);
});

test("unsupported jobFlowItem schemaVersion yields empty items", () => {
  const bundle = sampleBundle({
    jobFlowItemContext: {
      schemaVersion: 99 as typeof OFFLINE_JOB_FLOW_ITEM_SCHEMA_VERSION,
      lastSyncedAt: "t",
      snapshotOperationalDate: "2026-08-17",
      items: [
        {
          ownerKind: "WORK_ORDER",
          ownerId: "wo-1",
          label: "x",
          ownerState: "ASSIGNED",
          attention: "due_now",
          place: { unitId: null, spaceId: null, assetId: null },
          time: { dueAt: null, windowStartLocal: null, windowEndLocal: null },
          href: null,
          compatibility: false,
          compatibilitySource: null,
          informational: false,
          offlineAction: null,
        },
      ],
    },
  });
  assert.deepEqual(readOfflineJobFlowItems(bundle), []);
});

test("canonical items serialize once with correct offlineAction flags", () => {
  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: true,
    canonicalLogsEnabled: true,
    currentAssignment: assignment({ id: "oa-1" }),
    upcomingAssignment: null,
    assignmentLocations: [],
    spaceRefs: [],
    states: [],
    templateEvidence: [],
    workOrders: [
      {
        id: "wo-1",
        repairCode: "R-1",
        title: "Fix sink",
        status: "ASSIGNED",
        dueAt: null,
        unitId: "unit-a",
        spaceId: null,
        assetId: null,
        pmOccurrenceId: "pm-1",
        workOrderKind: "PREVENTIVE",
      },
    ],
    preventiveMaintenance: [
      {
        id: "pm-1",
        label: "Filter",
        status: "OPEN",
        unitId: "unit-a",
        spaceId: null,
        assetId: null,
        activeWorkOrderId: null,
        dueAt: null,
      },
    ],
    assignmentExceptions: [
      {
        id: "call-off:1",
        kind: "CALL_OFF",
        label: "Called off",
        ownerState: "CALL_OFF",
        unitId: "unit-a",
        href: null,
      },
    ],
  });

  const ctx = serializeEmployeeRuntimeJobFlowItemContext(flow, {
    lastSyncedAt: "2026-08-17T12:00:00.000Z",
    snapshotOperationalDate: "2026-08-17",
  });
  assert.ok(ctx);
  assert.equal(ctx.schemaVersion, OFFLINE_JOB_FLOW_ITEM_SCHEMA_VERSION);
  assert.equal(ctx.snapshotOperationalDate, "2026-08-17");

  const wo = ctx.items.find((row) => row.ownerKind === "WORK_ORDER");
  assert.ok(wo);
  assert.equal(wo.offlineAction, null);
  assert.equal(wo.informational, false);

  assert.equal(ctx.items.filter((row) => row.ownerKind === "PREVENTIVE_MAINTENANCE").length, 0);

  const callOff = ctx.items.find((row) => row.ownerKind === "ASSIGNMENT_EXCEPTION");
  assert.equal(callOff?.informational, true);
  assert.equal(callOff?.offlineAction, null);

  for (const row of ctx.items) {
    if (row.offlineAction) {
      assert.ok((OFFLINE_COMMAND_TYPES as readonly string[]).includes(row.offlineAction));
    }
  }


});

test("href alone does not grant offline Work Order completion", () => {
  const item: JobFlowItem = {
    ownerKind: "WORK_ORDER",
    ownerId: "wo-x",
    place: { unitId: "u", spaceId: null, assetId: null },
    time: {
      windowStartsAt: null,
      windowEndsAt: null,
      dueAt: null,
      windowStartLocal: null,
      windowEndLocal: null,
    },
    ownerState: "ASSIGNED",
    attention: "due_now",
    label: "Leak",
    href: "/repairs/wo-x",
    compatibility: false,
    compatibilitySource: null,
  };
  assert.equal(offlineActionForJobFlowItem(item), null);
});

test("KEY_TIME Key Points are display-only; servery milestones remain actionable", () => {
  assert.equal(
    offlineActionForJobFlowItem({
      ownerKind: "OPERATING_RHYTHM_KEY_POINT",
      ownerId: "space-1:breakfast:KEY_TIME",
      place: { unitId: null, spaceId: "space-1", assetId: null },
      time: {
        windowStartsAt: null,
        windowEndsAt: null,
        dueAt: null,
        windowStartLocal: "07:30",
        windowEndLocal: null,
      },
      ownerState: "due",
      attention: "due_now",
      label: "Breakfast",
      href: null,
      compatibility: false,
      compatibilitySource: null,
    }),
    null,
  );
  assert.equal(
    offlineActionForJobFlowItem({
      ownerKind: "OPERATING_RHYTHM_KEY_POINT",
      ownerId: "space-1:legacy:SERVERY_READY",
      place: { unitId: null, spaceId: "space-1", assetId: null },
      time: {
        windowStartsAt: null,
        windowEndsAt: null,
        dueAt: null,
        windowStartLocal: null,
        windowEndLocal: null,
      },
      ownerState: "not_recorded",
      attention: "due_now",
      label: "Servery Ready",
      href: null,
      compatibility: false,
      compatibilitySource: null,
    }),
    "RECORD_SERVERY_READY",
  );
});

test("bundle builder and offline UI wire owner items without generic Work commands", () => {
  const root = process.cwd();
  const bundleSrc = readFileSync(join(root, "src/lib/offline/build-runtime-bundle.ts"), "utf8");
  assert.match(bundleSrc, /serializeEmployeeRuntimeJobFlowItemContext/);
  assert.match(bundleSrc, /jobFlowItemContext/);
  assert.doesNotMatch(bundleSrc, /COMPLETE_OPERATIONAL_TASK|workContext/);

  const processSrc = readFileSync(join(root, "src/lib/offline/process-sync-command.ts"), "utf8");
  assert.doesNotMatch(processSrc, /processWorkCompletionCommand/);
  assert.doesNotMatch(processSrc, /COMPLETE_OPERATIONAL_TASK/);

  const ui = readFileSync(join(root, "src/components/offline/offline-job-flow-context.tsx"), "utf8");
  assert.match(ui, /readOfflineJobFlowItems/);
  assert.match(ui, /offline-job-flow-items/);
  assert.match(ui, /view only/);
});
