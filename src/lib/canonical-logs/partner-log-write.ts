import type { PrismaClient } from "@prisma/client";

import { performCanonicalEvidenceCorrection } from "@/lib/operational-evidence/correct-evidence";
import type { EvidenceFieldValueInput } from "@/lib/operational-evidence/types";
import { canPartner } from "@/lib/partner-user-access";
import type { PartnerOperationalContext } from "@/lib/partner-operational-context";

import { performCanonicalLogSubmission, type SubmitCanonicalLogInput } from "./submit-canonical-log";

type Db = PrismaClient;

const NOT_FOUND = "Log not found.";

function activeDepartment(context: PartnerOperationalContext): string {
  const departmentId = context.activeDepartmentId;
  if (!departmentId || !context.allowedDepartmentIds.includes(departmentId)) {
    throw new Error("Partner Log writes require the active Department.");
  }
  return departmentId;
}

export type PartnerCanonicalLogSubmitInput = {
  client: Db;
  context: PartnerOperationalContext;
  actorLabel: string | null;
  logAttachmentId: string;
  requirementKey?: string | null;
  operationalDateKey: string;
  cycleStableKey?: string | null;
  cycleLabel?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  values: EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
  adHoc?: boolean;
  now?: Date;
};

/**
 * Partner submit entry. Live context and the attachment row decide Facility and Department.
 * The canonical writer is `performCanonicalLogSubmission`.
 */
export async function submitPartnerCanonicalLog(input: PartnerCanonicalLogSubmitInput) {
  if (!canPartner(input.context.effectiveRole, "logs.submit")) {
    throw new Error("Partner Log submission denied.");
  }
  const departmentId = activeDepartment(input.context);
  const attachment = await input.client.logAttachment.findFirst({
    where: {
      id: input.logAttachmentId,
      facilityId: input.context.facilityId,
      departmentId,
    },
    select: { id: true, departmentId: true },
  });
  if (!attachment) throw new Error(NOT_FOUND);

  const submission: SubmitCanonicalLogInput & { client: Db; now?: Date } = {
    client: input.client,
    facilityId: input.context.facilityId,
    departmentId: attachment.departmentId,
    logAttachmentId: attachment.id,
    requirementKey: input.requirementKey,
    operationalDateKey: input.operationalDateKey,
    cycleStableKey: input.cycleStableKey,
    cycleLabel: input.cycleLabel,
    windowStartLocal: input.windowStartLocal,
    windowEndLocal: input.windowEndLocal,
    occurredAt: input.now ?? new Date(),
    values: input.values,
    correctiveActionText: input.correctiveActionText,
    adHoc: input.adHoc === true,
    recordedByEmployeeId: null,
    now: input.now,
  };

  return performCanonicalLogSubmission(
    { userId: input.context.userId, label: input.actorLabel, employeeId: null },
    submission,
  );
}

/**
 * Certified correction: append previous values, reason, and User actor, then replace current values.
 * Does not delete the record, change its Department, or edit the Log definition.
 */
export async function correctPartnerCanonicalLog(input: {
  client: Db;
  context: PartnerOperationalContext;
  actorLabel: string | null;
  recordId: string;
  reason: string;
  values: EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
  now?: Date;
}) {
  if (!canPartner(input.context.effectiveRole, "logs.correct")) {
    throw new Error("Partner Log correction denied.");
  }
  const departmentId = activeDepartment(input.context);
  const existing = await input.client.operationalEvidenceRecord.findFirst({
    where: {
      id: input.recordId,
      facilityId: input.context.facilityId,
      departmentId,
    },
    select: { id: true, facilityId: true, departmentId: true },
  });
  if (!existing) throw new Error(NOT_FOUND);

  return performCanonicalEvidenceCorrection(
    { userId: input.context.userId, label: input.actorLabel, employeeId: null },
    {
      client: input.client,
      facilityId: existing.facilityId,
      departmentId: existing.departmentId,
      recordId: existing.id,
      reason: input.reason,
      values: input.values,
      correctiveActionText: input.correctiveActionText,
      correctedByEmployeeId: null,
      now: input.now,
    },
  );
}
