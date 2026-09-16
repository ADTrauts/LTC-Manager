/**
 * Repairs V1 reconciliation — hermetic product rules (no DB).
 * Completion ≠ Asset Operational ≠ AssetIssue resolve;
 * preferred vs actual provider; source labels; legacy path helpers.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  compareRepairsForQueue,
  isRepairCompletedStatus,
  isRepairOpenStatus,
  parseRepairQueueFilter,
  projectAssetResponsibility,
  repairMatchesQueueFilter,
  repairSourceCompactLine,
  repairSourceKind,
  resolvePreferredRepairProviderForAsset,
  responsibleOrganizationDisplayLabel,
} from "@/lib/asset-operations";
import {
  issueDetailPath,
  legacyIssueFaçadePath,
  repairDetailAliasPath,
} from "@/lib/work/issues/issue-copy";

test("canonical detail is /repairs; legacy façade remains /issues", () => {
  const id = "repair_abc";
  assert.equal(issueDetailPath(id), `/repairs/${id}`);
  assert.equal(repairDetailAliasPath(id), `/repairs/${id}`);
  assert.equal(legacyIssueFaçadePath(id), `/issues/${id}`);
});

test("linked vs direct vs preventive source labels", () => {
  assert.equal(
    repairSourceCompactLine({
      kind: repairSourceKind({
        workOrderKind: "CORRECTIVE",
        hasLinkedAssetIssue: true,
      }),
      issueSummary: "Not holding temperature",
    }),
    "Issue: Not holding temperature",
  );
  assert.equal(
    repairSourceCompactLine({
      kind: repairSourceKind({
        workOrderKind: "CORRECTIVE",
        hasLinkedAssetIssue: false,
      }),
    }),
    "Direct repair",
  );
  assert.equal(
    repairSourceCompactLine({
      kind: repairSourceKind({
        workOrderKind: "PREVENTIVE",
        hasLinkedAssetIssue: false,
      }),
    }),
    "Preventive",
  );
});

test("preferred provider defaults; explicit override wins; later preference ignored for existing", () => {
  assert.equal(
    resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: null,
      assetPreferredVendorId: "pref-1",
    }),
    "pref-1",
  );
  assert.equal(
    resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: "actual-2",
      assetPreferredVendorId: "pref-1",
    }),
    "actual-2",
  );
  // Simulates "asset preference changed later" — existing Repair vendor must win.
  assert.equal(
    resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: "actual-2",
      assetPreferredVendorId: "pref-new",
    }),
    "actual-2",
  );
  assert.equal(
    resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: null,
      assetPreferredVendorId: null,
    }),
    null,
  );
});

test("responsible organization projects from Asset — missing shows Not assigned", () => {
  const missing = projectAssetResponsibility({});
  assert.equal(
    responsibleOrganizationDisplayLabel(missing.responsibleOrganization),
    "Not assigned",
  );
  const present = projectAssetResponsibility({
    responsibleOrganization: { id: "org-1", name: "Metz Culinary Management" },
  });
  assert.equal(
    responsibleOrganizationDisplayLabel(present.responsibleOrganization),
    "Metz Culinary Management",
  );
});

test("default queue filter is open work; completed retained under Completed/All", () => {
  assert.equal(parseRepairQueueFilter(null), "OPEN");
  assert.equal(repairMatchesQueueFilter("IN_PROGRESS", "OPEN"), true);
  assert.equal(repairMatchesQueueFilter("COMPLETED", "OPEN"), false);
  assert.equal(repairMatchesQueueFilter("COMPLETED", "COMPLETED"), true);
  assert.equal(repairMatchesQueueFilter("COMPLETED", "ALL"), true);
});

test("queue sort — open oldest first before completed", () => {
  const rows = [
    { status: "COMPLETED" as const, requestedAt: new Date("2026-02-01") },
    { status: "OPEN" as const, requestedAt: new Date("2026-01-10") },
    { status: "OPEN" as const, requestedAt: new Date("2026-01-01") },
  ].sort(compareRepairsForQueue);
  assert.equal(rows[0]!.requestedAt.toISOString().startsWith("2026-01-01"), true);
  assert.equal(isRepairOpenStatus(rows[0]!.status), true);
  assert.equal(isRepairCompletedStatus(rows[2]!.status), true);
});

test("product separation: completed repair statuses do not imply issue/asset resolution", () => {
  // Documented invariant — helpers only classify Repair status.
  assert.equal(isRepairCompletedStatus("COMPLETED"), true);
  assert.equal(isRepairCompletedStatus("CLOSED"), true);
  assert.equal(isRepairCompletedStatus("IN_PROGRESS"), false);
  // No helper couples Repair completion to AssetIssue or Asset condition.
});
