import type { OperationalEvidenceRecordStatus, Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { FacilitySession } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  requireEvidenceCorrect,
  resolveEvidenceAuthority,
} from "./evidence-authority";
import type {
  CorrectEvidenceInput,
  EvidenceFieldValueInput,
  TemplateFieldSnapshot,
  TemplateSnapshotJson,
} from "./types";
import { validateEvidenceSubmission } from "./validate-evidence-submission";
import { partnerActingColumns, type PartnerActingContext } from "./acting-context";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function snapshotFields(snapshot: TemplateSnapshotJson | null): TemplateFieldSnapshot[] {
  if (!snapshot?.fields?.length) return [];
  return snapshot.fields;
}

function previousValuesPayload(record: {
  status: OperationalEvidenceRecordStatus;
  correctiveActionText: string | null;
  outOfStandard: boolean;
  values: Array<{
    fieldKey: string;
    label: string;
    fieldType: string;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
    valueDateTime: Date | null;
    valueSelections: string[];
    outOfStandard: boolean;
  }>;
}) {
  return {
    status: record.status,
    correctiveActionText: record.correctiveActionText,
    outOfStandard: record.outOfStandard,
    values: record.values.map((v) => ({
      fieldKey: v.fieldKey,
      label: v.label,
      fieldType: v.fieldType,
      valueText: v.valueText,
      valueNumber: v.valueNumber,
      valueBoolean: v.valueBoolean,
      valueDateTime: v.valueDateTime?.toISOString() ?? null,
      valueSelections: v.valueSelections,
      outOfStandard: v.outOfStandard,
    })),
  };
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
}): OperationalEvidenceRecordStatus {
  if (!input.outOfStandard) return "COMPLETED";
  if (input.correctiveActionText?.trim()) return "COMPLETED_WITH_CORRECTIVE_ACTION";
  return "NEEDS_REVIEW";
}

/**
 * Append-preserving correction for SUPERVISOR+.
 * Stores previous values on OperationalEvidenceCorrection; never silently overwrites history.
 */
export async function correctEvidenceRecord(
  session: FacilitySession,
  input: CorrectEvidenceInput & {
    actorUserId?: string | null;
    client?: DbClient;
    now?: Date;
  },
) {
  if (session.accessKind === "partner" || !session.role) {
    throw new Error("Partner sessions cannot correct canonical Logs.");
  }
  const authority = await resolveEvidenceAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireEvidenceCorrect(authority);

  return performCanonicalEvidenceCorrection(
    {
      userId: input.actorUserId !== undefined ? input.actorUserId : sessionUserIdForFk(session),
      label: input.correctedByLabel ?? session.name ?? null,
      employeeId: input.correctedByEmployeeId ?? null,
    },
    input,
  );
}

/**
 * Append-preserving canonical correction. Callers authorize the actor and the record first.
 * Previous values stay on OperationalEvidenceCorrection. The record is not deleted or moved.
 */
export async function performCanonicalEvidenceCorrection(
  actor: { userId: string | null; label: string | null; employeeId: string | null },
  input: CorrectEvidenceInput & {
    client?: DbClient;
    now?: Date;
  },
  actingContext?: PartnerActingContext,
) {
  const client = input.client ?? prisma;

  const reason = input.reason?.trim();
  if (!reason) {
    throw new Error("Correction reason is required.");
  }

  const existing = await client.operationalEvidenceRecord.findFirst({
    where: {
      id: input.recordId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    },
    include: { values: true },
  });
  if (!existing) throw new Error("Evidence record not found.");

  const snapshot = existing.templateSnapshotJson as unknown as TemplateSnapshotJson;
  const fields = snapshotFields(snapshot);
  if (fields.length === 0) {
    throw new Error("Template snapshot fields are missing; cannot correct.");
  }

  const correctiveActionText =
    input.correctiveActionText !== undefined
      ? input.correctiveActionText?.trim() || null
      : existing.correctiveActionText;

  const validation = validateEvidenceSubmission({
    fields,
    values: input.values,
    correctiveActionText,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }

  const now = input.now ?? new Date();
  const correctedByUserId = actor.userId;
  const previous = previousValuesPayload(existing);
  const status = resolveRecordStatus({
    outOfStandard: validation.outOfStandard,
    correctiveActionText,
  });

  await client.operationalEvidenceCorrection.create({
    data: {
      id: cuidLike(),
      recordId: existing.id,
      reason,
      previousValuesJson: previous as unknown as Prisma.InputJsonValue,
      previousStatus: existing.status,
      previousCorrectiveActionText: existing.correctiveActionText,
      correctedByUserId,
      correctedByEmployeeId: actor.employeeId,
      correctedByLabel: actor.label,
      createdAt: now,
      ...(actingContext ? partnerActingColumns(actingContext) : {}),
    },
  });

  await client.operationalEvidenceFieldValue.deleteMany({
    where: { recordId: existing.id },
  });

  const updated = await client.operationalEvidenceRecord.update({
    where: { id: existing.id },
    data: {
      status,
      outOfStandard: validation.outOfStandard,
      correctiveActionText,
      correctiveActionAt: correctiveActionText ? now : null,
      correctiveActionByUserId: correctiveActionText ? correctedByUserId : null,
      correctiveActionByEmployeeId: correctiveActionText
        ? (actor.employeeId ?? existing.correctiveActionByEmployeeId)
        : null,
      values: {
        create: buildValueRows(fields, input.values, validation.fieldOutOfStandard),
      },
    },
    include: {
      values: true,
      corrections: { orderBy: { createdAt: "desc" } },
    },
  });

  return updated;
}
