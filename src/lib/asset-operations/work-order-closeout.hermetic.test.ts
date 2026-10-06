import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import {
  formatWorkOrderCloseoutBlockedMessage,
  parseNonNegativeDecimal,
  parsePositiveQuantity,
  projectRecordedExpense,
  validateWorkOrderCloseout,
} from "./work-order-closeout";

test("closeout gate: missing labor is not the same as zero minutes", () => {
  const missingLabor = validateWorkOrderCloseout({
    workPerformed: "Replaced belt",
    laborEntryCount: 0,
    requirements: [],
    hasAsset: false,
    assetConditionReview: null,
  });
  assert.equal(missingLabor.canComplete, false);
  assert.deepEqual(missingLabor.missing, ["LABOR"]);

  const zeroLabor = validateWorkOrderCloseout({
    workPerformed: "Vendor completed the work",
    laborEntryCount: 1,
    requirements: [],
    hasAsset: false,
    assetConditionReview: null,
  });
  assert.equal(zeroLabor.canComplete, true);
});

test("closeout gate: work performed, required records, and asset review", () => {
  const emptyWork = validateWorkOrderCloseout({
    workPerformed: "ab",
    laborEntryCount: 1,
    requirements: [],
    hasAsset: false,
    assetConditionReview: null,
  });
  assert.equal(emptyWork.canComplete, false);
  assert.ok(emptyWork.missing.includes("WORK_PERFORMED"));

  const pendingRecord = validateWorkOrderCloseout({
    workPerformed: "Inspected",
    laborEntryCount: 1,
    requirements: [{ status: "PENDING", templateName: "Post-repair inspection" }],
    hasAsset: false,
    assetConditionReview: null,
  });
  assert.equal(pendingRecord.canComplete, false);
  assert.ok(pendingRecord.missing.includes("REQUIRED_RECORD"));
  assert.deepEqual(pendingRecord.missingRecordLabels, ["Post-repair inspection"]);

  const satisfiedOrWaived = validateWorkOrderCloseout({
    workPerformed: "Inspected",
    laborEntryCount: 1,
    requirements: [
      { status: "SATISFIED", templateName: "Post-repair inspection" },
      { status: "WAIVED", templateName: "Photo log" },
    ],
    hasAsset: true,
    assetConditionReview: "NO_CHANGE",
  });
  assert.equal(satisfiedOrWaived.canComplete, true);

  const locationOnly = validateWorkOrderCloseout({
    workPerformed: "Sealed leak",
    laborEntryCount: 1,
    requirements: [],
    hasAsset: false,
    assetConditionReview: null,
  });
  assert.equal(locationOnly.canComplete, true);

  const assetNeedsReview = validateWorkOrderCloseout({
    workPerformed: "Replaced element",
    laborEntryCount: 1,
    requirements: [],
    hasAsset: true,
    assetConditionReview: null,
  });
  assert.equal(assetNeedsReview.canComplete, false);
  assert.ok(assetNeedsReview.missing.includes("ASSET_CONDITION_REVIEW"));
});

test("closeout blocked message lists actionable facts", () => {
  const message = formatWorkOrderCloseoutBlockedMessage({
    canComplete: false,
    missing: ["WORK_PERFORMED", "LABOR", "REQUIRED_RECORD", "ASSET_CONDITION_REVIEW"],
    missingRecordLabels: ["Post-repair inspection"],
  });
  assert.match(message, /Cannot complete Work Order/);
  assert.match(message, /Work performed/);
  assert.match(message, /Labor time/);
  assert.match(message, /Post-repair inspection/);
  assert.match(message, /Asset condition review/);
});

test("Decimal expense projection is null-safe and excludes labor dollars", () => {
  const none = projectRecordedExpense({ parts: [], externalCost: null });
  assert.equal(none.recordedPartsCost, null);
  assert.equal(none.recordedExternalCost, null);
  assert.equal(none.recordedMaterialVendorExpense, null);

  const mixed = projectRecordedExpense({
    parts: [
      { lineCost: new Prisma.Decimal("42.50") },
      { lineCost: null },
      { lineCost: new Prisma.Decimal("10.00") },
    ],
    externalCost: new Prisma.Decimal("250.00"),
  });
  assert.equal(mixed.recordedPartsCost?.toFixed(2), "52.50");
  assert.equal(mixed.recordedExternalCost?.toFixed(2), "250.00");
  assert.equal(mixed.recordedMaterialVendorExpense?.toFixed(2), "302.50");
});

test("quantity and cost parsing reject invalid values", () => {
  assert.equal(parsePositiveQuantity("1.250").toFixed(3), "1.250");
  assert.throws(() => parsePositiveQuantity("0"), /greater than zero/);
  assert.throws(() => parsePositiveQuantity("-1"), /valid non-negative/);
  assert.equal(parseNonNegativeDecimal("0", 2).toFixed(2), "0.00");
  assert.throws(() => parseNonNegativeDecimal("-0.01", 2), /valid non-negative/);
});
