import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  applySyncResultToQueueState,
  canCreateOfflineCommand,
  retryBackoffSeconds,
} from "./queue-policy";
import { bundleMatchesScope, isBundleExpired, validateBundleForOfflineCommand } from "./bundle-validation";
import { deriveConnectivityState } from "./connectivity-reducer";
import type { OfflineRuntimeBundle } from "./types";

const sampleBundle = (): OfflineRuntimeBundle => ({
  bundleVersion: "2026-08-05:abc",
  serverRevision: "abc",
  issuedAt: new Date().toISOString(),
  offlineAuthorizedUntil: new Date(Date.now() + 3600_000).toISOString(),
  lastSuccessfulSyncAt: null,
  facilityId: "fac1",
  facilityTimezone: "America/New_York",
  facilityName: "Terrace View",
  departmentId: "dep1",
  departmentName: "Dietary",
  unitId: "unit1",
  unitName: "Main Servery",
  deviceFacilityId: "fac1",
  deviceBoundUnitId: "unit1",
  actor: {
    displayName: "Test User",
    role: "STAFF",
    authMethod: "QUICK_PIN",
    authKind: "employee",
    actorRef: "employee:emp1",
    sessionVersion: 2,
  },
  operationalDate: "2026-08-05",
  mealContext: { applicableMealType: "LUNCH", label: "Lunch", expectedServiceTime: "11:30" },
  milestones: [],
  procedureLabels: [],
});

test("retry backoff is bounded", () => {
  assert.equal(retryBackoffSeconds(1), 5);
  assert.equal(retryBackoffSeconds(99), 300);
});

test("queue state mapping covers sync categories", () => {
  assert.equal(applySyncResultToQueueState("ACCEPTED"), "ACCEPTED");
  assert.equal(applySyncResultToQueueState("CONFLICT_REVIEW_REQUIRED"), "CONFLICT_REVIEW_REQUIRED");
});

test("bundle expiration rejects stale lease", () => {
  const bundle = sampleBundle();
  bundle.offlineAuthorizedUntil = new Date(Date.now() - 1000).toISOString();
  assert.equal(isBundleExpired(bundle), true);
});

test("bundle scope mismatch is detected", () => {
  const bundle = sampleBundle();
  const result = bundleMatchesScope({
    bundle,
    facilityId: "other",
    unitId: "unit1",
    actorRef: "employee:emp1",
    sessionVersion: 2,
    deviceFacilityId: "fac1",
    deviceBoundUnitId: "unit1",
  });
  assert.equal(result.ok, false);
});

test("offline command creation blocked when signed out", () => {
  const bundle = sampleBundle();
  const result = validateBundleForOfflineCommand({
    bundle,
    facilityId: "fac1",
    unitId: "unit1",
    actorRef: "employee:emp1",
    sessionVersion: 2,
    deviceFacilityId: "fac1",
    deviceBoundUnitId: "unit1",
    signedOut: true,
  });
  assert.equal(result.ok, false);
});

test("connectivity reducer prefers reauthentication", () => {
  const state = deriveConnectivityState({
    probeOnline: true,
    navigatorOnline: true,
    synchronizing: false,
    pendingCount: 1,
    conflictCount: 0,
    reauthenticationRequired: true,
    hasBundle: true,
    lastSyncError: null,
  });
  assert.equal(state, "REAUTHENTICATION_REQUIRED");
});

test("manifest is valid JSON webmanifest", () => {
  const path = join(process.cwd(), "public/manifest.webmanifest");
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.name, "LTC Manager");
  assert.ok(Array.isArray(parsed.icons));
});

test("service worker does not cache auth or API paths", () => {
  const path = join(process.cwd(), "public/sw.js");
  const sw = readFileSync(path, "utf8");
  assert.match(sw, /isAuthOrApiPath/);
  assert.match(sw, /isProtectedHtmlPath/);
  assert.match(sw, /Never cache protected HTML/);
  assert.doesNotMatch(sw, /cache\.put\(req.*login/i);
});

test("canCreateOfflineCommand respects device revocation", () => {
  const result = canCreateOfflineCommand({
    bundleExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    deviceRevokedLocally: true,
    signedOut: false,
  });
  assert.equal(result.ok, false);
});
