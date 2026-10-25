import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { legacyRecordWriteDecision } from "./record-engine";
import {
  evaluateCanonicalCutoverReadiness,
  evaluatePilotAcceptanceReadiness,
  pilotServiceDayCounts,
  resolveRecordEngine,
} from "./record-engine-rollout";

const dietary = { facilityId: "terrace", departmentId: "dietary" };
const plant = { facilityId: "terrace", departmentId: "plant" };

const history = [
  { ...dietary, mode: "LEGACY" as const, effectiveFromServiceDate: "2026-10-01" },
  { ...dietary, mode: "CANONICAL" as const, effectiveFromServiceDate: "2026-10-16" },
  { ...dietary, mode: "LEGACY" as const, effectiveFromServiceDate: "2026-10-21" },
  { ...dietary, mode: "CANONICAL" as const, effectiveFromServiceDate: "2026-10-28" },
];

test("capability off keeps legacy even when a canonical row is stored", () => {
  assert.equal(
    resolveRecordEngine({
      capabilityEnabled: false,
      ...dietary,
      serviceDate: "2026-10-16",
      rollouts: history,
    }),
    "LEGACY",
  );
});

test("dietary and plant can use different engines on the same service date", () => {
  assert.equal(
    resolveRecordEngine({ capabilityEnabled: true, ...dietary, serviceDate: "2026-10-16", rollouts: history }),
    "CANONICAL",
  );
  assert.equal(
    resolveRecordEngine({
      capabilityEnabled: true,
      ...plant,
      departmentKey: "PLANT",
      serviceDate: "2026-10-16",
      rollouts: [...history, { ...plant, mode: "LEGACY", effectiveFromServiceDate: "2026-10-01" }],
    }),
    "LEGACY",
  );
  assert.equal(
    legacyRecordWriteDecision({
      productRecordEngine: resolveRecordEngine({
        capabilityEnabled: true,
        ...plant,
        departmentKey: "PLANT",
        serviceDate: "2026-10-16",
        rollouts: [...history, { ...plant, mode: "LEGACY", effectiveFromServiceDate: "2026-10-01" }],
      }) === "CANONICAL",
      writer: "OPERATIONAL_TEMPLATE",
    }).allowed,
    true,
  );
  assert.equal(
    legacyRecordWriteDecision({
      productRecordEngine: true,
      writer: "LOG_SUBMISSION",
    }).allowed,
    false,
  );
});

test("a Department with no rollout row starts on the forward engine, including Plant", () => {
  assert.equal(
    resolveRecordEngine({
      capabilityEnabled: true,
      ...dietary,
      departmentKey: "DIETARY",
      serviceDate: "2026-10-23",
      rollouts: [],
    }),
    "CANONICAL",
  );
  assert.equal(
    resolveRecordEngine({
      capabilityEnabled: true,
      ...plant,
      departmentKey: "PLANT",
      serviceDate: "2026-10-23",
      rollouts: [],
    }),
    "CANONICAL",
  );
  assert.equal(
    resolveRecordEngine({
      capabilityEnabled: true,
      ...dietary,
      departmentKey: "DIETARY",
      serviceDate: "2026-10-23",
      rollouts: [{ ...dietary, mode: "LEGACY", effectiveFromServiceDate: "2026-10-01" }],
    }),
    "LEGACY",
  );
  assert.equal(
    resolveRecordEngine({
      capabilityEnabled: true,
      ...dietary,
      departmentKey: "DIETARY",
      serviceDate: "2026-10-23",
      rollouts: [{ ...dietary, mode: "CANONICAL", effectiveFromServiceDate: "2026-11-01" }],
    }),
    "LEGACY",
  );
});

test("rollback and reactivation do not reinterpret earlier service dates", () => {
  const engine = (serviceDate: string) =>
    resolveRecordEngine({ capabilityEnabled: true, ...dietary, serviceDate, rollouts: history });
  assert.equal(engine("2026-10-15"), "LEGACY");
  assert.equal(engine("2026-10-16"), "CANONICAL");
  assert.equal(engine("2026-10-20"), "CANONICAL");
  assert.equal(engine("2026-10-21"), "LEGACY");
  assert.equal(engine("2026-10-27"), "LEGACY");
  assert.equal(engine("2026-10-28"), "CANONICAL");
});

test("preflight blocks a closed date and warns when no Logs are placed", () => {
  const blocked = evaluateCanonicalCutoverReadiness({
    capabilityEnabled: true,
    departmentExists: true,
    effectiveFromServiceDate: "2026-10-14",
    todayKey: "2026-10-15",
    activeAttachmentCount: 2,
    attachmentSetupErrorCount: 0,
  });
  assert.equal(blocked.status, "BLOCKED");
  const ready = evaluateCanonicalCutoverReadiness({
    capabilityEnabled: true,
    departmentExists: true,
    effectiveFromServiceDate: "2026-10-16",
    todayKey: "2026-10-15",
    activeAttachmentCount: 0,
    attachmentSetupErrorCount: 0,
  });
  assert.equal(ready.status, "READY");
  assert.ok(ready.warnings.some((warning) => warning.includes("No Logs are placed")));
  const pilot = evaluatePilotAcceptanceReadiness({
    engine: ready,
    rolloutConfigured: true,
    placed: {},
    staffAccess: true,
  });
  assert.equal(pilot.pilotStatus, "NOT_PILOT_READY");
  const placed = evaluatePilotAcceptanceReadiness({
    engine: ready,
    rolloutConfigured: true,
    placed: { cooler: true, checklist: true, inspection: true, repeating: true },
    staffAccess: true,
  });
  assert.equal(placed.pilotStatus, "PILOT_READY");
});

test("a pilot day report counts completion without legacy writes", () => {
  const metrics = pilotServiceDayCounts({
    expected: 4,
    completed: 3,
    exceptions: 1,
    overdue: 0,
    missed: 1,
    waived: 0,
    rechecks: 1,
    legacyWrites: 0,
  });
  assert.equal(metrics.legacyWrites, 0);
  assert.equal(metrics.completionRate, 75);
  assert.equal(metrics.rechecks, 1);
});

test("pilot authority stays scoped and the runbook exists", () => {
  const flags = readFileSync("src/lib/feature-flags.ts", "utf8");
  assert.match(flags, /parseEnvFlag\(process\.env\.CANONICAL_LOGS_ENABLED, false\)/);
  const submit = readFileSync("src/lib/canonical-logs/submit-canonical-log.ts", "utf8");
  assert.match(submit, /not using canonical Records/);
  assert.doesNotMatch(submit, /prisma\.logSubmission\.create/);
  const runbook = readFileSync("docs/product/CANONICAL_RECORD_PILOT_RUNBOOK.md", "utf8");
  assert.match(runbook, /Previous Logs/);
  assert.match(runbook, /does not write both/);
});
