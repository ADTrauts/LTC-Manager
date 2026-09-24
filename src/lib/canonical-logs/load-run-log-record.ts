/**
 * Canonical completed Log record presentation from OperationalEvidenceRecord + snapshot.
 */

import type { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { loadEvidenceRecordDetail } from "@/lib/operational-evidence";
import { toServiceDateKey } from "@/lib/operational-time";

import type { LogSubmissionSnapshotV2 } from "./snapshot";
import { productStatusFromEvidenceStatus } from "./run-presentation";
import { formatLocalTime12h } from "./timing-display";
import { resolveAttachmentTargetLabel } from "./target-labels";

export type RunLogRecordView = {
  id: string;
  displayName: string;
  catalogDefinitionName: string;
  catalogVersion: number | null;
  targetLabel: string;
  departmentName: string;
  timingContextLabel: string;
  statusLabel: string;
  isException: boolean;
  needsSupervisorReview: boolean;
  completedAtLabel: string;
  completedByLabel: string | null;
  operationalDateKey: string;
  catalogInstructions: string | null;
  localInstructions: string | null;
  correctiveActionText: string | null;
  amendments: Array<{ id: string; reason: string; atLabel: string; byLabel: string | null }>;
  fields: Array<{
    label: string;
    displayValue: string;
    rangeLabel: string | null;
    outOfStandard: boolean;
  }>;
};

function parseSnapshot(raw: unknown): LogSubmissionSnapshotV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === "CANONICAL_LOG" && obj.snapshotSchemaVersion === 2) {
    return raw as LogSubmissionSnapshotV2;
  }
  return null;
}

function fieldDisplayValue(value: {
  fieldType: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueSelections: string[];
  unitLabel?: string | null;
}): string {
  if (value.fieldType === "TEMPERATURE" || value.fieldType === "NUMBER") {
    if (value.valueNumber == null) return "—";
    const unit = value.unitLabel?.trim() ? ` ${value.unitLabel.trim()}` : "";
    return `${value.valueNumber}${unit}`;
  }
  if (value.fieldType === "PASS_NEEDS_ATTENTION") {
    if (value.valueText === "PASS") return "Pass";
    if (value.valueText === "NEEDS_ATTENTION") return "Needs attention";
    return value.valueText ?? "—";
  }
  if (value.fieldType === "YES_NO") {
    if (value.valueText === "YES") return "Yes";
    if (value.valueText === "NO") return "No";
    return value.valueText ?? "—";
  }
  if (value.valueSelections.length > 0) return value.valueSelections.join(", ");
  if (value.valueBoolean != null) return value.valueBoolean ? "Yes" : "No";
  return value.valueText?.trim() || "—";
}

function rangeFromSnapshotField(field: {
  minNumber: number | null;
  maxNumber: number | null;
  unitLabel: string | null;
}): string | null {
  if (field.minNumber == null && field.maxNumber == null) return null;
  const unit = field.unitLabel?.trim() ?? "";
  if (field.minNumber != null && field.maxNumber != null) {
    return `${field.minNumber}${unit}–${field.maxNumber}${unit}`;
  }
  if (field.minNumber != null) return `≥ ${field.minNumber}${unit}`;
  return `≤ ${field.maxNumber}${unit}`;
}

export async function loadRunLogRecordView(input: {
  client: PrismaClient;
  session: AppJwtPayload;
  facilityId: string;
  recordId: string;
}): Promise<RunLogRecordView | null> {
  if (!isCanonicalLogsEnabled()) return null;

  const stub = await input.client.operationalEvidenceRecord.findFirst({
    where: { id: input.recordId, facilityId: input.facilityId },
    select: {
      id: true,
      departmentId: true,
      logAttachmentId: true,
      templateName: true,
      templateVersion: true,
      status: true,
      outOfStandard: true,
      correctiveActionText: true,
      occurredAt: true,
      recordedAt: true,
      recordedByLabel: true,
      operationalDate: true,
      cycleLabel: true,
      windowStartLocal: true,
      windowEndLocal: true,
      unitId: true,
      spaceId: true,
      assetId: true,
      templateSnapshotJson: true,
      department: { select: { name: true } },
    },
  });
  if (!stub) return null;

  // Authority via existing detail loader (throws/denies if cannot view).
  let detail;
  try {
    detail = await loadEvidenceRecordDetail({
      session: input.session,
      facilityId: input.facilityId,
      departmentId: stub.departmentId,
      recordId: stub.id,
    });
  } catch {
    return null;
  }

  const snapshot = parseSnapshot(stub.templateSnapshotJson);
  const catalogName = snapshot?.catalog.name ?? stub.templateName;
  const displayName =
    snapshot?.attachment.localDisplayLabel?.trim() || catalogName;

  let targetLabel = "Target";
  if (snapshot?.attachment.target) {
    const resolved = await resolveAttachmentTargetLabel(input.client, {
      facilityId: input.facilityId,
      targetKind: snapshot.attachment.targetKind,
      assetId:
        snapshot.attachment.target.kind === "ASSET"
          ? snapshot.attachment.target.assetId
          : stub.assetId,
      spaceId:
        snapshot.attachment.target.kind === "SPACE"
          ? snapshot.attachment.target.spaceId
          : stub.spaceId,
      unitId:
        snapshot.attachment.target.kind === "UNIT"
          ? snapshot.attachment.target.unitId
          : stub.unitId,
      targetDepartmentId:
        snapshot.attachment.target.kind === "DEPARTMENT"
          ? snapshot.attachment.target.departmentId
          : null,
    });
    // Prefer snapshot-era labels when live resolve fails (moved/retired targets).
    targetLabel = resolved?.title ?? targetLabel;
  } else if (stub.assetId || stub.spaceId || stub.unitId) {
    const resolved = await resolveAttachmentTargetLabel(input.client, {
      facilityId: input.facilityId,
      targetKind: stub.assetId ? "ASSET" : stub.spaceId ? "SPACE" : "UNIT",
      assetId: stub.assetId,
      spaceId: stub.spaceId,
      unitId: stub.unitId,
    });
    targetLabel = resolved?.title ?? targetLabel;
  }

  const timingContextLabel = stub.cycleLabel
    ? stub.cycleLabel
    : stub.windowStartLocal && stub.windowEndLocal
      ? `${formatLocalTime12h(stub.windowStartLocal)}–${formatLocalTime12h(stub.windowEndLocal)}`
      : snapshot?.timingContext.cycleLabel ?? "";

  const status = productStatusFromEvidenceStatus(stub.status, stub.outOfStandard);
  const snapFields = snapshot?.catalog.fields ?? [];
  const fieldByKey = new Map(snapFields.map((f) => [f.fieldKey, f]));

  const fields = detail.record.values.map((v) => {
    const snapField = fieldByKey.get(v.fieldKey);
    return {
      label: v.label,
      displayValue: fieldDisplayValue({
        ...v,
        unitLabel: snapField?.unitLabel ?? null,
      }),
      rangeLabel: snapField ? rangeFromSnapshotField(snapField) : null,
      outOfStandard: v.outOfStandard,
    };
  });

  return {
    id: stub.id,
    displayName,
    catalogDefinitionName: catalogName,
    catalogVersion: snapshot?.catalog.version ?? stub.templateVersion,
    targetLabel,
    departmentName: stub.department.name,
    timingContextLabel,
    statusLabel: status.label,
    isException: status.exception,
    needsSupervisorReview: stub.status === "NEEDS_REVIEW",
    completedAtLabel: stub.occurredAt.toLocaleString(),
    completedByLabel: stub.recordedByLabel,
    operationalDateKey: toServiceDateKey(stub.operationalDate),
    catalogInstructions: snapshot?.catalog.instructions ?? null,
    localInstructions: snapshot?.attachment.localInstructions ?? null,
    correctiveActionText: stub.correctiveActionText,
    amendments: detail.record.corrections.map((c) => ({
      id: c.id,
      reason: c.reason,
      atLabel: c.createdAt.toLocaleString(),
      byLabel: c.correctedByLabel,
    })),
    fields,
  };
}
