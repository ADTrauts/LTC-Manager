import assert from "node:assert/strict";
import test from "node:test";

import { mapReviewEvidenceRecords } from "./review-fact-maps";

test("day and range facts retain inspection grade from the submission snapshot, including N/A", () => {
  const fields = ["pass", "fail", "na"].map((fieldKey) => ({
    fieldKey, label: fieldKey, fieldType: "COMPLIANCE", displaySequence: 1,
    scoreWeight: 10, critical: fieldKey === "fail",
  }));
  const record = {
    id: "audit", requirementKey: "audit-slot", logRequirementKey: "audit-slot",
    status: "COMPLETED_WITH_CORRECTIVE_ACTION" as const, operationalDate: new Date("2026-10-15"),
    templateVersion: 1, outOfStandard: true, logAttachmentId: "placement",
    attachmentStableKey: "audit-placement", catalogDefinition: { stableKey: "audit" },
    spaceId: "kitchen", unitId: null, occurredAt: new Date("2026-10-15T12:00Z"),
    recordedAt: new Date("2026-10-15T12:00Z"),
    templateSnapshotJson: {
      snapshotSchemaVersion: 2, kind: "CANONICAL_LOG",
      catalog: { purposeType: "INSPECTION", passingScore: 85, criticalFailureForcesFailure: true, fields },
    },
    values: [
      { fieldKey: "pass", valueText: "COMPLIANT" },
      { fieldKey: "fail", valueText: "NON_COMPLIANT" },
      { fieldKey: "na", valueText: "NOT_APPLICABLE" },
    ],
  };
  assert.deepEqual(mapReviewEvidenceRecords([record])[0].inspection, {
    percentage: 50, outcome: "FAIL", criticalFailureCount: 1, exceptionCount: 1,
  });
  assert.equal(mapReviewEvidenceRecords([{ ...record, templateSnapshotJson: undefined }])[0].inspection, null);
});
