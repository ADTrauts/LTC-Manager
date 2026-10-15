/**
 * Canonical completed Log record presentation from OperationalEvidenceRecord + snapshot.
 */

import type { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { loadEvidenceRecordDetail } from "@/lib/operational-evidence";
import { toServiceDateKey } from "@/lib/operational-time";

import { evidenceCanCreateIssue } from "./evidence-rules";
import { scoreInspectionSnapshot, type InspectionScore } from "./inspection-score";
import { formatEvidenceFieldDisplay } from "./evidence-field-display";
import { parseLogSubmissionSnapshot, type LogSubmissionSnapshotV2 } from "./snapshot";
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
  inspection: InspectionScore | null;
  departmentId: string;
  logAttachmentId: string | null;
  assetId: string | null;
  unitId: string | null;
  canCreateIssue: boolean;
  followsRecordId: string | null;
  canRecheck: boolean;
  followsRecordSummary: {
    id: string;
    label: string;
    displayValue: string;
    atLabel: string;
  } | null;
  followUps: Array<{
    id: string;
    displayValue: string;
    atLabel: string;
    statusLabel: string;
  }>;
  amendments: Array<{ id: string; reason: string; atLabel: string; byLabel: string | null }>;
  attachments: Array<{
    id: string;
    fieldKey: string | null;
    kind: string;
    originalFilename: string | null;
    contentType: string;
    uploadedByLabel: string | null;
    createdAtLabel: string;
  }>;
  fields: Array<{
    fieldKey: string;
    label: string;
    displayValue: string;
    rangeLabel: string | null;
    outOfStandard: boolean;
  }>;
};

function parseSnapshot(raw: unknown): LogSubmissionSnapshotV2 | null {
  return parseLogSubmissionSnapshot(raw);
}

function fieldDisplayValue(value: {
  fieldType: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueSelections: string[];
  unitLabel?: string | null;
}): string {
  return formatEvidenceFieldDisplay(value);
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
  session: FacilitySession;
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
      followsRecordId: true,
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

  return composeRunLogRecordView({
    client: input.client,
    facilityId: input.facilityId,
    stub,
    values: detail.record.values,
    corrections: detail.record.corrections,
  });
}

export async function loadDepartmentScopedRunLogRecordView(input: {
  client: PrismaClient;
  facilityId: string;
  departmentId: string;
  recordId: string;
}): Promise<RunLogRecordView | null> {
  if (!input.departmentId) {
    throw new Error("Partner Log reads require a Department.");
  }
  if (!isCanonicalLogsEnabled()) return null;

  const row = await input.client.operationalEvidenceRecord.findFirst({
    where: {
      id: input.recordId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
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
      followsRecordId: true,
      templateSnapshotJson: true,
      department: { select: { name: true } },
      values: { orderBy: { fieldKey: "asc" } },
      corrections: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!row) return null;
  return composeRunLogRecordView({
    client: input.client,
    facilityId: input.facilityId,
    stub: row,
    values: row.values,
    corrections: row.corrections,
  });
}

async function composeRunLogRecordView(input: {
  client: PrismaClient;
  facilityId: string;
  stub: {
    id: string;
    departmentId: string;
    logAttachmentId: string | null;
    templateName: string;
    templateVersion: number | null;
    status: string;
    outOfStandard: boolean;
    correctiveActionText: string | null;
    occurredAt: Date;
    recordedByLabel: string | null;
    operationalDate: Date;
    cycleLabel: string | null;
    windowStartLocal: string | null;
    windowEndLocal: string | null;
    unitId: string | null;
    spaceId: string | null;
    assetId: string | null;
    followsRecordId: string | null;
    templateSnapshotJson: unknown;
    department: { name: string };
  };
  values: Array<{
    fieldKey: string;
    label: string;
    fieldType: string;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
    valueSelections: string[];
    outOfStandard: boolean;
  }>;
  corrections: Array<{
    id: string;
    reason: string;
    createdAt: Date;
    correctedByLabel: string | null;
  }>;
}): Promise<RunLogRecordView> {
  const stub = input.stub;
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

  const attachmentRows = await input.client.operationalEvidenceAttachment.findMany({
    where: { facilityId: input.facilityId, recordId: stub.id },
    orderBy: { displaySequence: "asc" },
    select: {
      id: true,
      fieldKey: true,
      kind: true,
      originalFilename: true,
      contentType: true,
      uploadedByLabel: true,
      createdAt: true,
    },
  });

  const followUpRows = await input.client.operationalEvidenceRecord.findMany({
    where: { facilityId: input.facilityId, followsRecordId: stub.id },
    select: {
      id: true,
      status: true,
      outOfStandard: true,
      occurredAt: true,
      values: {
        orderBy: { fieldKey: "asc" },
        take: 1,
        select: {
          fieldType: true,
          valueText: true,
          valueNumber: true,
          valueBoolean: true,
          valueSelections: true,
        },
      },
    },
    orderBy: { recordedAt: "asc" },
  });
  const followUps = followUpRows.map((row) => {
    const value = row.values[0];
    const status = productStatusFromEvidenceStatus(row.status, row.outOfStandard);
    return {
      id: row.id,
      displayValue: value ? fieldDisplayValue(value) : "Recorded",
      atLabel: row.occurredAt.toLocaleString(),
      statusLabel: row.outOfStandard ? status.label : "In standard",
    };
  });

  const activeAttachment = stub.logAttachmentId
    ? await input.client.logAttachment.findFirst({
        where: {
          id: stub.logAttachmentId,
          facilityId: input.facilityId,
          status: "ACTIVE",
        },
        select: { id: true },
      })
    : null;

  let followsRecordSummary: RunLogRecordView["followsRecordSummary"] = null;
  if (stub.followsRecordId) {
    const origin = await input.client.operationalEvidenceRecord.findFirst({
      where: { id: stub.followsRecordId, facilityId: input.facilityId },
      select: {
        id: true,
        templateName: true,
        occurredAt: true,
        templateSnapshotJson: true,
        values: {
          orderBy: { fieldKey: "asc" },
          take: 1,
          select: {
            fieldType: true,
            valueText: true,
            valueNumber: true,
            valueBoolean: true,
            valueSelections: true,
          },
        },
      },
    });
    if (origin) {
      const originSnapshot = parseSnapshot(origin.templateSnapshotJson);
      const value = origin.values[0];
      followsRecordSummary = {
        id: origin.id,
        label: originSnapshot?.catalog.name ?? origin.templateName,
        displayValue: value ? fieldDisplayValue(value) : "Recorded",
        atLabel: origin.occurredAt.toLocaleString(),
      };
    }
  }

  const fields = [...input.values]
    .sort((a, b) => {
      const aSeq = fieldByKey.get(a.fieldKey)?.displaySequence ?? Number.MAX_SAFE_INTEGER;
      const bSeq = fieldByKey.get(b.fieldKey)?.displaySequence ?? Number.MAX_SAFE_INTEGER;
      return aSeq - bSeq;
    })
    .map((v) => {
      const snapField = fieldByKey.get(v.fieldKey);
      return {
        fieldKey: v.fieldKey,
        label: "groupKey" in v && v.groupKey ? `Row ${("rowSequence" in v ? v.rowSequence : "")} · ${v.label}` : v.label,
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
    inspection: scoreInspectionSnapshot({
      snapshot,
      values: input.values
        .filter((value) => !("groupKey" in value) || !value.groupKey)
        .map((value) => ({
        fieldKey: value.fieldKey,
        valueText: value.valueText,
        valueNumber: value.valueNumber,
        valueBoolean: value.valueBoolean,
        valueSelections: value.valueSelections,
      })),
    }),
    departmentId: stub.departmentId,
    logAttachmentId: stub.logAttachmentId,
    assetId: stub.assetId,
    unitId: stub.unitId,
    canCreateIssue: evidenceCanCreateIssue(stub),
    followsRecordId: stub.followsRecordId,
    canRecheck: Boolean(activeAttachment && stub.outOfStandard),
    followsRecordSummary,
    followUps,
    amendments: input.corrections.map((c) => ({
      id: c.id,
      reason: c.reason,
      atLabel: c.createdAt.toLocaleString(),
      byLabel: c.correctedByLabel,
    })),
    attachments: attachmentRows.map((row) => ({
      id: row.id,
      fieldKey: row.fieldKey,
      kind: row.kind,
      originalFilename: row.originalFilename,
      contentType: row.contentType,
      uploadedByLabel: row.uploadedByLabel,
      createdAtLabel: row.createdAt.toLocaleString(),
    })),
    fields,
  };
}
