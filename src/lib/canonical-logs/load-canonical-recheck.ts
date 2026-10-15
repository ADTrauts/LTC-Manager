/**
 * Unscheduled follow-up entry against an existing canonical evidence record.
 * Reuses the originating LogAttachment. Standards come from that record's snapshot.
 */

import type { OperationalEvidenceFieldType, PrismaClient } from "@prisma/client";

import { parseCatalogEvidenceRules, type CatalogEvidenceRule } from "./evidence-rules";
import { formatEvidenceFieldDisplay } from "./evidence-field-display";
import { parseLogSubmissionSnapshot } from "./snapshot";
import { resolveAttachmentTargetLabel } from "./target-labels";

export type CanonicalRecheckForm = {
  recordId: string;
  facilityId: string;
  departmentId: string;
  attachmentId: string;
  displayName: string;
  catalogDefinitionName: string;
  catalogVersion: number;
  targetLabel: string;
  originalValueLabel: string;
  originalAtLabel: string;
  expectedRangeLabel: string | null;
  catalogInstructions: string | null;
  localInstructions: string | null;
  fields: Array<{
    fieldKey: string;
    label: string;
    fieldType: OperationalEvidenceFieldType;
    isRequired: boolean;
    displaySequence: number;
    helpText: string | null;
    unitLabel: string | null;
    minNumber: number | null;
    maxNumber: number | null;
    allowedSelections: string[];
    correctiveActionTrigger: boolean;
    correctiveActionRequired: boolean;
  }>;
  rules: CatalogEvidenceRule[];
};

export async function loadCanonicalRecheckForm(input: {
  client: PrismaClient;
  facilityId: string;
  recordId: string;
}): Promise<CanonicalRecheckForm | null> {
  const origin = await input.client.operationalEvidenceRecord.findFirst({
    where: { id: input.recordId, facilityId: input.facilityId },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      logAttachmentId: true,
      outOfStandard: true,
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
  if (!origin?.logAttachmentId || !origin.outOfStandard) return null;

  const attachment = await input.client.logAttachment.findFirst({
    where: {
      id: origin.logAttachmentId,
      facilityId: input.facilityId,
      status: "ACTIVE",
    },
    select: { id: true, departmentId: true },
  });
  if (!attachment || attachment.departmentId !== origin.departmentId) return null;

  const snapshot = parseLogSubmissionSnapshot(origin.templateSnapshotJson);
  if (!snapshot) return null;

  const target =
    (await resolveAttachmentTargetLabel(input.client, {
      facilityId: input.facilityId,
      targetKind: snapshot.attachment.targetKind,
      assetId:
        snapshot.attachment.target.kind === "ASSET" ? snapshot.attachment.target.assetId : null,
      spaceId:
        snapshot.attachment.target.kind === "SPACE" ? snapshot.attachment.target.spaceId : null,
      unitId: snapshot.attachment.target.kind === "UNIT" ? snapshot.attachment.target.unitId : null,
      targetDepartmentId:
        snapshot.attachment.target.kind === "DEPARTMENT"
          ? snapshot.attachment.target.departmentId
          : null,
    }))?.title ?? "Target";

  const primary = snapshot.catalog.fields[0];
  const expectedRangeLabel =
    primary && (primary.minNumber != null || primary.maxNumber != null)
      ? primary.minNumber != null && primary.maxNumber != null
        ? `${primary.minNumber}${primary.unitLabel ?? ""}–${primary.maxNumber}${primary.unitLabel ?? ""}`
        : primary.minNumber != null
          ? `≥ ${primary.minNumber}${primary.unitLabel ?? ""}`
          : `≤ ${primary.maxNumber}${primary.unitLabel ?? ""}`
      : null;
  const originalValue = origin.values[0];

  return {
    recordId: origin.id,
    facilityId: origin.facilityId,
    departmentId: origin.departmentId,
    attachmentId: attachment.id,
    displayName: snapshot.attachment.localDisplayLabel?.trim() || snapshot.catalog.name,
    catalogDefinitionName: snapshot.catalog.name,
    catalogVersion: snapshot.catalog.version,
    targetLabel: target,
    originalValueLabel: originalValue ? formatEvidenceFieldDisplay(originalValue) : "Recorded",
    originalAtLabel: origin.occurredAt.toLocaleString(),
    expectedRangeLabel,
    catalogInstructions: snapshot.catalog.instructions,
    localInstructions: snapshot.attachment.localInstructions,
    fields: snapshot.catalog.fields.map((field) => ({ ...field })),
    rules: parseCatalogEvidenceRules(snapshot.catalog.rules),
  };
}
