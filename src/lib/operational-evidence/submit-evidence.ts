import type { OperationalEvidenceRecordStatus, Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  requireEvidenceSubmit,
  resolveEvidenceAuthority,
} from "./evidence-authority";
import type {
  EvidenceFieldValueInput,
  SubmitEvidenceInput,
  TemplateFieldSnapshot,
  TemplateSnapshotJson,
} from "./types";
import { validateEvidenceSubmission } from "./validate-evidence-submission";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapFieldSnapshots(
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

function resolveRecordStatus(input: {
  outOfStandard: boolean;
  correctiveActionText: string | null | undefined;
  allowNeedsReview: boolean;
}): OperationalEvidenceRecordStatus {
  if (!input.outOfStandard) return "COMPLETED";
  if (input.correctiveActionText?.trim()) return "COMPLETED_WITH_CORRECTIVE_ACTION";
  if (input.allowNeedsReview) return "NEEDS_REVIEW";
  return "COMPLETED_WITH_CORRECTIVE_ACTION";
}

/**
 * Persist an Evidence Record for a published template requirement.
 * Idempotent on clientCommandId within facility+department.
 */
export async function submitEvidenceRecord(
  session: AppJwtPayload,
  input: SubmitEvidenceInput & {
    actorUserId?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
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

  const template = await client.operationalTemplate.findFirst({
    where: {
      id: input.templateId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: {
      fields: { orderBy: { displaySequence: "asc" } },
    },
  });
  if (!template) throw new Error("Template not found.");
  if (template.status !== "PUBLISHED") {
    throw new Error("Evidence may only be submitted against a published template version.");
  }

  const fields = mapFieldSnapshots(template.fields);
  const validation = validateEvidenceSubmission({
    fields,
    values: input.values,
    correctiveActionText: input.correctiveActionText,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  const now = input.now ?? new Date();
  const occurredAt = toDate(input.occurredAt);
  const recordedAt = now;
  const recordedOnline = input.recordedOnline !== false;
  const synchronizedAt = recordedOnline ? now : null;
  const correctiveActionText = input.correctiveActionText?.trim() || null;
  const status = resolveRecordStatus({
    outOfStandard: validation.outOfStandard,
    correctiveActionText,
    allowNeedsReview: input.allowNeedsReview === true,
  });

  const snapshot: TemplateSnapshotJson = {
    templateId: template.id,
    stableKey: template.stableKey,
    version: template.version,
    name: template.name,
    description: template.description,
    instructions: template.instructions,
    purposeType: template.purposeType,
    fields,
  };

  const recordedByUserId =
    input.actorUserId !== undefined
      ? input.actorUserId
      : sessionUserIdForFk(session);

  try {
    const created = await client.operationalEvidenceRecord.create({
      data: {
        id: cuidLike(),
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        templateId: template.id,
        templateStableKey: template.stableKey,
        templateVersion: template.version,
        templateName: template.name,
        purposeType: template.purposeType,
        requirementKey: input.requirementKey,
        operationalDate: facilityLocalDateToServiceDate(input.operationalDateKey),
        scheduleKind: input.scheduleKind,
        cycleStableKey: input.cycleStableKey ?? null,
        cycleLabel: input.cycleLabel ?? null,
        windowStartLocal: input.windowStartLocal ?? null,
        windowEndLocal: input.windowEndLocal ?? null,
        unitId: input.unitId ?? null,
        spaceId: input.spaceId ?? null,
        assetId: input.assetId ?? null,
        status,
        outOfStandard: validation.outOfStandard,
        correctiveActionText,
        correctiveActionAt: correctiveActionText ? now : null,
        correctiveActionByUserId: correctiveActionText ? recordedByUserId : null,
        correctiveActionByEmployeeId: correctiveActionText
          ? (input.recordedByEmployeeId ?? null)
          : null,
        occurredAt,
        recordedAt,
        synchronizedAt,
        recordedOnline,
        clientCommandId,
        deviceBoundUnitId: input.deviceBoundUnitId ?? null,
        recordedByUserId,
        recordedByEmployeeId: input.recordedByEmployeeId ?? null,
        recordedByLabel: input.recordedByLabel ?? session.name ?? null,
        templateSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        values: {
          create: buildValueRows(fields, input.values, validation.fieldOutOfStandard),
        },
      },
      include: { values: true, corrections: true },
    });
    return created;
  } catch (err) {
    // Concurrent idempotent replay on unique(clientCommandId).
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
