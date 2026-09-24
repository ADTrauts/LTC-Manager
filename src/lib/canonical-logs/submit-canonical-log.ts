import type { Prisma, PrismaClient, OperationalTemplatePurposeType } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import {
  requireEvidenceSubmit,
  resolveEvidenceAuthority,
} from "@/lib/operational-evidence/evidence-authority";
import { validateEvidenceSubmission } from "@/lib/operational-evidence/validate-evidence-submission";
import type { EvidenceFieldValueInput, TemplateFieldSnapshot } from "@/lib/operational-evidence/types";
import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time";

import { loadLogAttachmentForFacility } from "./attachment-service";
import { mapTimingModeToScheduleKind } from "./schedule-kind";
import {
  buildCanonicalLogSubmissionSnapshot,
  legacyCompatibleTemplateFields,
  snapshotToPrismaJson,
} from "./snapshot";
import { normalizeAttachmentTarget } from "./attachment-validate";

type Db = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function resolveRecordStatus(input: {
  outOfStandard: boolean;
  correctiveActionText: string | null | undefined;
  allowNeedsReview: boolean;
}): "COMPLETED" | "COMPLETED_WITH_CORRECTIVE_ACTION" | "NEEDS_REVIEW" {
  if (!input.outOfStandard) return "COMPLETED";
  if (input.correctiveActionText?.trim()) return "COMPLETED_WITH_CORRECTIVE_ACTION";
  if (input.allowNeedsReview) return "NEEDS_REVIEW";
  return "COMPLETED_WITH_CORRECTIVE_ACTION";
}

function mapFields(
  fields: Array<{
    fieldKey: string;
    label: string;
    fieldType: TemplateFieldSnapshot["fieldType"];
    isRequired: boolean;
    displaySequence: number;
    helpText: string | null;
    unitLabel: string | null;
    minNumber: number | null;
    maxNumber: number | null;
    allowedSelections: string[];
    correctiveActionTrigger: boolean;
    correctiveActionRequired: boolean;
  }>,
): TemplateFieldSnapshot[] {
  return fields.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    fieldType: f.fieldType,
    isRequired: f.isRequired,
    displaySequence: f.displaySequence,
    helpText: f.helpText,
    unitLabel: f.unitLabel,
    minNumber: f.minNumber,
    maxNumber: f.maxNumber,
    allowedSelections: f.allowedSelections,
    correctiveActionTrigger: f.correctiveActionTrigger,
    correctiveActionRequired: f.correctiveActionRequired,
  }));
}

function buildValueRows(
  fields: TemplateFieldSnapshot[],
  values: EvidenceFieldValueInput[],
  fieldOutOfStandard: Record<string, boolean>,
) {
  const byKey = new Map(values.map((v) => [v.fieldKey, v]));
  return fields.map((field) => {
    const value = byKey.get(field.fieldKey);
    const selections =
      value?.valueSelections && value.valueSelections.length > 0
        ? value.valueSelections
        : field.fieldType === "SINGLE_SELECT" && value?.valueText?.trim()
          ? [value.valueText.trim()]
          : [];

    let valueDateTime: Date | null = null;
    if (value?.valueDateTime != null) {
      valueDateTime =
        value.valueDateTime instanceof Date
          ? value.valueDateTime
          : new Date(value.valueDateTime);
    }

    return {
      id: cuidLike(),
      fieldKey: field.fieldKey,
      label: field.label,
      fieldType: field.fieldType,
      valueText: value?.valueText?.trim() || null,
      valueNumber: value?.valueNumber ?? null,
      valueBoolean: value?.valueBoolean ?? null,
      valueDateTime,
      valueSelections: selections,
      outOfStandard: fieldOutOfStandard[field.fieldKey] === true,
    };
  });
}

export type SubmitCanonicalLogInput = {
  facilityId: string;
  departmentId: string;
  logAttachmentId: string;
  /** Required for scheduled satisfaction; optional for ad hoc. */
  requirementKey?: string | null;
  operationalDateKey: string;
  cycleStableKey?: string | null;
  cycleLabel?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  windowOrdinal?: number | null;
  occurredAt: Date | string;
  recordedOnline?: boolean;
  clientCommandId?: string | null;
  deviceBoundUnitId?: string | null;
  recordedByEmployeeId?: string | null;
  recordedByLabel?: string | null;
  correctiveActionText?: string | null;
  values: EvidenceFieldValueInput[];
  allowNeedsReview?: boolean;
  /** When true, allows submit without a scheduled requirement key (ad hoc). */
  adHoc?: boolean;
};

/**
 * Submit an Attachment-backed canonical Log into OperationalEvidenceRecord.
 * Snapshot is built server-side. Client must not supply templateSnapshotJson.
 */
export async function submitCanonicalLogSubmission(
  session: AppJwtPayload,
  input: SubmitCanonicalLogInput & {
    actorUserId?: string | null;
    client?: Db;
    now?: Date;
  },
) {
  if (!isCanonicalLogsEnabled()) {
    throw new Error("Canonical Logs are not enabled (CANONICAL_LOGS_ENABLED).");
  }

  const client = input.client ?? (await import("@/lib/prisma")).prisma;
  const authority = await resolveEvidenceAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireEvidenceSubmit(authority);

  const clientCommandId = input.clientCommandId?.trim() || null;
  if (clientCommandId) {
    const existing = await client.operationalEvidenceRecord.findFirst({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        clientCommandId,
      },
      include: { values: true, corrections: true },
    });
    if (existing) return existing;
  }

  const attachment = await loadLogAttachmentForFacility(
    client,
    input.facilityId,
    input.logAttachmentId,
  );
  if (!attachment) throw new Error("Log Attachment not found.");
  if (attachment.departmentId !== input.departmentId) {
    throw new Error("Attachment department does not match submission department.");
  }
  const fromKey = toServiceDateKey(attachment.effectiveFrom);
  const toKey = attachment.effectiveTo ? toServiceDateKey(attachment.effectiveTo) : null;
  if (input.operationalDateKey < fromKey || (toKey && input.operationalDateKey > toKey)) {
    throw new Error("This Log is not required on the selected service date.");
  }

  const catalog = attachment.catalogDefinition;
  if (!catalog || catalog.status !== "PUBLISHED") {
    throw new Error("Attachment Catalog version is not published.");
  }
  if (catalog.id !== attachment.catalogDefinitionId) {
    throw new Error("Attachment Catalog reference mismatch.");
  }

  const fields = mapFields(catalog.fields);
  const validation = validateEvidenceSubmission({
    fields,
    values: input.values,
    correctiveActionText: input.correctiveActionText,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  const target = normalizeAttachmentTarget({
    kind: attachment.targetKind,
    assetId: attachment.assetId,
    spaceId: attachment.spaceId,
    unitId: attachment.unitId,
    targetDepartmentId: attachment.targetDepartmentId,
  });

  const scheduleKind = mapTimingModeToScheduleKind(attachment.timingMode);
  const isAdHoc = input.adHoc === true || attachment.timingMode === "AD_HOC";
  const requirementKey =
    input.requirementKey?.trim() ||
    (isAdHoc
      ? `adhoc|${attachment.stableKey}|${input.operationalDateKey}|${cuidLike().slice(0, 8)}`
      : null);
  if (!requirementKey) {
    throw new Error("requirementKey is required for scheduled Log submissions.");
  }

  // Scheduled requirements may only be satisfied once (ad hoc generates unique keys).
  if (!isAdHoc) {
    const already = await client.operationalEvidenceRecord.findFirst({
      where: {
        facilityId: input.facilityId,
        OR: [{ logRequirementKey: requirementKey }, { requirementKey }],
        status: {
          in: ["COMPLETED", "COMPLETED_WITH_CORRECTIVE_ACTION", "NEEDS_REVIEW"],
        },
      },
      select: { id: true },
    });
    if (already) {
      throw new Error("This Log has already been completed.");
    }
  }

  const snapshot = buildCanonicalLogSubmissionSnapshot({
    catalog: {
      id: catalog.id,
      stableKey: catalog.stableKey,
      version: catalog.version,
      name: catalog.name,
      description: catalog.description,
      instructions: catalog.instructions,
      purposeType: catalog.purposeType,
      category: catalog.category,
      recommendedCadence: catalog.recommendedCadence,
      fields: catalog.fields.map((f) => ({
        fieldKey: f.fieldKey,
        label: f.label,
        fieldType: f.fieldType,
        isRequired: f.isRequired,
        displaySequence: f.displaySequence,
        helpText: f.helpText,
        unitLabel: f.unitLabel,
        minNumber: f.minNumber,
        maxNumber: f.maxNumber,
        allowedSelections: f.allowedSelections,
        correctiveActionTrigger: f.correctiveActionTrigger,
        correctiveActionRequired: f.correctiveActionRequired,
      })),
    },
    attachment: {
      id: attachment.id,
      stableKey: attachment.stableKey,
      departmentId: attachment.departmentId,
      status: attachment.status,
      localDisplayLabel: attachment.localDisplayLabel,
      localInstructions: attachment.localInstructions,
      timingMode: attachment.timingMode,
      targetKind: attachment.targetKind,
      target: target.target,
      cycleStableKeys: attachment.cycleSelections.map((c) => c.cycleStableKey),
      dailyWindows: attachment.dailyWindows.map((w) => ({
        label: w.label,
        startLocal: w.startLocal,
        endLocal: w.endLocal,
        displaySequence: w.displaySequence,
      })),
      calendar:
        attachment.timingMode === "CALENDAR"
          ? {
              cadence: attachment.calendarCadence,
              daysOfWeek: attachment.calendarDaysOfWeek,
              dayOfMonth: attachment.calendarDayOfMonth,
              dueTimeLocal: attachment.calendarDueTimeLocal,
            }
          : null,
      allowAdHoc: attachment.allowAdHoc,
    },
    timingContext: {
      scheduleKind,
      cycleStableKey: input.cycleStableKey ?? null,
      cycleLabel: input.cycleLabel ?? null,
      windowStartLocal: input.windowStartLocal ?? null,
      windowEndLocal: input.windowEndLocal ?? null,
      windowOrdinal: input.windowOrdinal ?? null,
    },
  });

  const now = input.now ?? new Date();
  const occurredAt = toDate(input.occurredAt);
  const recordedOnline = input.recordedOnline !== false;
  const correctiveActionText = input.correctiveActionText?.trim() || null;
  const status = resolveRecordStatus({
    outOfStandard: validation.outOfStandard,
    correctiveActionText,
    allowNeedsReview: input.allowNeedsReview === true,
  });
  const recordedByUserId =
    input.actorUserId !== undefined ? input.actorUserId : sessionUserIdForFk(session);

  const purposeType = catalog.purposeType as OperationalTemplatePurposeType;

  try {
    return await client.operationalEvidenceRecord.create({
      data: {
        id: cuidLike(),
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        templateId: null,
        logAttachmentId: attachment.id,
        attachmentStableKey: attachment.stableKey,
        catalogDefinitionId: catalog.id,
        templateStableKey: catalog.stableKey,
        templateVersion: catalog.version,
        templateName: attachment.localDisplayLabel?.trim() || catalog.name,
        purposeType,
        requirementKey,
        logRequirementKey: isAdHoc ? null : requirementKey,
        operationalDate: facilityLocalDateToServiceDate(input.operationalDateKey),
        scheduleKind,
        cycleStableKey: input.cycleStableKey ?? null,
        cycleLabel: input.cycleLabel ?? null,
        windowStartLocal: input.windowStartLocal ?? null,
        windowEndLocal: input.windowEndLocal ?? null,
        unitId: target.unitId,
        spaceId: target.spaceId,
        assetId: target.assetId,
        status,
        outOfStandard: validation.outOfStandard,
        correctiveActionText,
        correctiveActionAt: correctiveActionText ? now : null,
        correctiveActionByUserId: correctiveActionText ? recordedByUserId : null,
        correctiveActionByEmployeeId: correctiveActionText
          ? (input.recordedByEmployeeId ?? null)
          : null,
        occurredAt,
        recordedAt: now,
        synchronizedAt: recordedOnline ? now : null,
        recordedOnline,
        clientCommandId,
        deviceBoundUnitId: input.deviceBoundUnitId ?? null,
        recordedByUserId,
        recordedByEmployeeId: input.recordedByEmployeeId ?? null,
        recordedByLabel: input.recordedByLabel ?? session.name ?? null,
        templateSnapshotJson: snapshotToPrismaJson(
          legacyCompatibleTemplateFields(snapshot) as unknown as ReturnType<
            typeof buildCanonicalLogSubmissionSnapshot
          >,
        ),
        values: {
          create: buildValueRows(fields, input.values, validation.fieldOutOfStandard),
        },
      },
      include: { values: true, corrections: true },
    });
  } catch (err) {
    if (clientCommandId && isUniqueViolation(err)) {
      const again = await client.operationalEvidenceRecord.findFirst({
        where: {
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          clientCommandId,
        },
        include: { values: true, corrections: true },
      });
      if (again) return again;
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
