import type { Prisma, PrismaClient, OperationalTemplatePurposeType } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { FacilitySession } from "@/lib/auth";
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
import {
  dropHiddenFieldValues,
  parseCatalogEvidenceRules,
  recordStatusFromException,
} from "./evidence-rules";
import {
  evidenceMediaStorageKey,
  getEvidenceMediaStore,
  isEvidenceMediaFieldType,
  newEvidenceAttachmentId,
  prepareEvidenceMedia,
  putEvidenceObjects,
  EVIDENCE_STORAGE_UNAVAILABLE,
  type EvidenceMediaInput,
  type EvidenceMediaStore,
} from "./evidence-media";
import { mapTimingModeToScheduleKind } from "./schedule-kind";
import {
  buildCanonicalLogSubmissionSnapshot,
  legacyCompatibleTemplateFields,
  parseLogSubmissionSnapshot,
  snapshotToPrismaJson,
} from "./snapshot";
import { normalizeAttachmentTarget } from "./attachment-validate";
import {
  evaluateInspectionScore,
  inspectionFailureMarksOutOfStandard,
  parseInspectionSections,
} from "./inspection-score";
import { parseRepeatingGroups, validateRepeatSubmission } from "./template-structure";
import { followUpRecordDecision, recordPurposeRejection } from "./record-engine";
import { partnerActingColumns, type PartnerActingContext } from "@/lib/operational-evidence/acting-context";

type Db = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

async function placeLabelAtSubmission(
  client: Db,
  input: { facilityId: string; spaceId: string | null; supplied?: string | null },
): Promise<string | null> {
  const supplied = input.supplied?.trim() || null;
  if (supplied) return supplied;
  if (!input.spaceId) return null;
  const space = await client.unitSpace.findFirst({
    where: { id: input.spaceId, facilityId: input.facilityId },
    select: { name: true },
  });
  return space?.name ?? null;
}

function resolveRecordStatus(input: {
  outOfStandard: boolean;
  correctiveActionText: string | null | undefined;
  allowNeedsReview: boolean;
}): "COMPLETED" | "COMPLETED_WITH_CORRECTIVE_ACTION" | "NEEDS_REVIEW" {
  return recordStatusFromException(input);
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
    let valueText = value?.valueText?.trim() || null;
    let valueBoolean = value?.valueBoolean ?? null;
    if (field.fieldType === "YES_NO") {
      if (valueBoolean == null && valueText) {
        const text = valueText.toUpperCase();
        if (text === "YES") valueBoolean = true;
        if (text === "NO") valueBoolean = false;
      }
      valueText = null;
    }
    if (field.fieldType === "ATTESTATION") {
      if (valueBoolean == null && valueText) {
        const text = valueText.toUpperCase();
        if (text === "YES" || text === "TRUE" || text === "CONFIRMED") valueBoolean = true;
      }
      valueText = valueBoolean == null ? valueText : null;
    }
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
      valueText,
      valueNumber: value?.valueNumber ?? null,
      valueBoolean,
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
  boundSpaceId?: string | null;
  /** Place label shown at submission. Looked up when omitted and a place is known. */
  placeLabelSnapshot?: string | null;
  followsRecordId?: string | null;
  /** When true, allows submit without a scheduled requirement key (ad hoc). */
  adHoc?: boolean;
  media?: readonly EvidenceMediaInput[];
  mediaStore?: EvidenceMediaStore;
  repeatRows?: Array<{
    groupKey: string;
    rowKey: string;
    rowSequence: number;
    cells: Array<{
      columnKey: string;
      valueText?: string | null;
      valueNumber?: number | null;
      valueBoolean?: boolean | null;
      valueSelections?: string[];
    }>;
  }>;
};

export type CanonicalLogActor = {
  userId: string | null;
  label: string | null;
  employeeId: string | null;
};

/**
 * Submit an Attachment-backed canonical Log into OperationalEvidenceRecord.
 * Snapshot is built server-side. Client must not supply templateSnapshotJson.
 * This entry is internal Facility authorization. Partner sessions stay denied here.
 */
export async function submitCanonicalLogSubmission(
  session: FacilitySession,
  input: SubmitCanonicalLogInput & {
    actorUserId?: string | null;
    client?: Db;
    now?: Date;
  },
) {
  if (session.accessKind === "partner" || !session.role) {
    throw new Error("Partner sessions cannot submit canonical Logs.");
  }
  if (!isCanonicalLogsEnabled()) {
    throw new Error("Canonical Logs are not enabled (CANONICAL_LOGS_ENABLED).");
  }

  const authority = await resolveEvidenceAuthority(
    session,
    input.facilityId,
    input.departmentId,
  );
  requireEvidenceSubmit(authority);

  return performCanonicalLogSubmission(
    {
      userId: input.actorUserId !== undefined ? input.actorUserId : sessionUserIdForFk(session),
      label: input.recordedByLabel ?? session.name ?? null,
      employeeId: input.recordedByEmployeeId ?? null,
    },
    input,
  );
}

/**
 * Canonical evidence write. Callers must already have authorized the actor and the target.
 */
export async function performCanonicalLogSubmission(
  actor: CanonicalLogActor,
  input: SubmitCanonicalLogInput & {
    client?: Db;
    now?: Date;
  },
  actingContext?: PartnerActingContext,
) {
  if (!isCanonicalLogsEnabled()) {
    throw new Error("Canonical Logs are not enabled (CANONICAL_LOGS_ENABLED).");
  }
  const { departmentUsesCanonicalRecords } = await import("./record-engine-store");
  if (
    !(await departmentUsesCanonicalRecords({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.operationalDateKey,
      client: input.client,
    }))
  ) {
    throw new Error("This department is not using canonical Records for this service date.");
  }

  const client = input.client ?? (await import("@/lib/prisma")).prisma;

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
  const purposeRejection = recordPurposeRejection(catalog.purposeType);
  if (purposeRejection) throw new Error(purposeRejection);

  const followsRecordId = input.followsRecordId?.trim() || null;
  let governing = {
    id: catalog.id,
    stableKey: catalog.stableKey,
    version: catalog.version,
    name: catalog.name,
    description: catalog.description,
    instructions: catalog.instructions,
    purposeType: catalog.purposeType,
    category: catalog.category,
    recommendedCadence: catalog.recommendedCadence,
    fields: catalog.fields,
    rulesJson: "rulesJson" in catalog ? (catalog as { rulesJson?: unknown }).rulesJson : [],
    passingScore: "passingScore" in catalog ? (catalog as { passingScore?: number | null }).passingScore ?? null : null,
    criticalFailureForcesFailure:
      "criticalFailureForcesFailure" in catalog
        ? (catalog as { criticalFailureForcesFailure?: boolean }).criticalFailureForcesFailure === true
        : false,
    sections: "sectionsJson" in catalog ? (catalog as { sectionsJson?: unknown }).sectionsJson : [],
    repeatingGroups:
      "repeatingGroupsJson" in catalog ? (catalog as { repeatingGroupsJson?: unknown }).repeatingGroupsJson : [],
    calculations: "calculationsJson" in catalog ? (catalog as { calculationsJson?: unknown }).calculationsJson : [],
  };
  if (followsRecordId) {
    const origin = await client.operationalEvidenceRecord.findFirst({
      where: { id: followsRecordId, facilityId: input.facilityId },
      select: {
        id: true,
        departmentId: true,
        logAttachmentId: true,
        catalogDefinitionId: true,
        templateStableKey: true,
        templateSnapshotJson: true,
      },
    });
    if (!origin) throw new Error("The originating Record was not found.");
    if (!origin.logAttachmentId || origin.logAttachmentId !== attachment.id) {
      throw new Error("A recheck uses the originating Log attachment.");
    }
    if (origin.departmentId !== attachment.departmentId) {
      throw new Error("A recheck stays in the originating department.");
    }
    const pinned = parseLogSubmissionSnapshot(origin.templateSnapshotJson);
    if (!pinned) throw new Error("The originating Record has no pinned definition.");
    const link = followUpRecordDecision({
      originStableKey: origin.templateStableKey,
      nextStableKey: pinned.catalog.stableKey,
      originId: origin.id,
      nextId: "new",
    });
    if (!link.ok) throw new Error(link.reason);
    governing = {
      id: origin.catalogDefinitionId ?? pinned.catalog.id,
      stableKey: pinned.catalog.stableKey,
      version: pinned.catalog.version,
      name: pinned.catalog.name,
      description: pinned.catalog.description,
      instructions: pinned.catalog.instructions,
      purposeType: pinned.catalog.purposeType,
      category: pinned.catalog.category,
      recommendedCadence: pinned.catalog.recommendedCadence,
      fields: pinned.catalog.fields as typeof catalog.fields,
      rulesJson: pinned.catalog.rules,
      passingScore: pinned.catalog.passingScore ?? null,
      criticalFailureForcesFailure: pinned.catalog.criticalFailureForcesFailure === true,
      sections: pinned.catalog.sections ?? [],
      repeatingGroups: pinned.catalog.repeatingGroups ?? [],
      calculations: pinned.catalog.calculations ?? [],
    };
  }

  const fields = mapFields(governing.fields);
  const rules = parseCatalogEvidenceRules(governing.rulesJson);
  const provisional = validateEvidenceSubmission({
    fields,
    values: input.values,
    correctiveActionText: input.correctiveActionText,
    rules,
  });
  const visibleForMedia = new Set(
    fields
      .filter(
        (field) =>
          provisional.visibleFieldKeys.includes(field.fieldKey) &&
          isEvidenceMediaFieldType(field.fieldType),
      )
      .map((field) => field.fieldKey),
  );
  const preparedMedia = prepareEvidenceMedia(
    (input.media ?? []).filter((item) => visibleForMedia.has(item.fieldKey)),
    visibleForMedia,
  );
  if (!preparedMedia.ok) throw new Error(preparedMedia.message);
  for (const item of preparedMedia.items) {
    const field = fields.find((row) => row.fieldKey === item.fieldKey);
    if (field && field.fieldType !== item.kind) {
      throw new Error("An attachment does not match its field type.");
    }
  }
  const validation = validateEvidenceSubmission({
    fields,
    values: input.values,
    correctiveActionText: input.correctiveActionText,
    rules,
    providedMediaFieldKeys: preparedMedia.items.map((item) => item.fieldKey),
  });
  if (!validation.valid) {
    throw new Error(validation.errors.map((e) => e.message).join(" "));
  }
  const repeat = validateRepeatSubmission({
    groups: parseRepeatingGroups(governing.repeatingGroups),
    rows: input.repeatRows ?? [],
  });
  if (repeat.errors.length > 0) throw new Error(repeat.errors.join(" "));
  if (repeat.correctiveActionRequired && !input.correctiveActionText?.trim()) {
    throw new Error(repeat.reasons[0] ? `Corrective action is required: ${repeat.reasons[0]}` : "Corrective action is required.");
  }
  const visibleValues = dropHiddenFieldValues(input.values, validation.visibleFieldKeys);
  const inspectionScore = evaluateInspectionScore({
    purposeType: governing.purposeType,
    passingScore: governing.passingScore,
    criticalFailureForcesFailure: governing.criticalFailureForcesFailure,
    sections: parseInspectionSections(governing.sections),
    fields: governing.fields,
    values: visibleValues,
    visibleFieldKeys: validation.visibleFieldKeys,
  });
  const recordOutOfStandard =
    validation.outOfStandard ||
    repeat.outOfStandard ||
    inspectionFailureMarksOutOfStandard(inspectionScore?.outcome);
  for (const item of preparedMedia.items) {
    if (!visibleValues.some((value) => value.fieldKey === item.fieldKey)) {
      visibleValues.push({
        fieldKey: item.fieldKey,
        valueText: item.kind === "SIGNATURE" ? "Signature" : item.originalFilename,
      });
    }
  }
  const visibleFields = fields.filter((field) => validation.visibleFieldKeys.includes(field.fieldKey));

  const target = normalizeAttachmentTarget({
    kind: attachment.targetKind,
    assetId: attachment.assetId,
    spaceId: attachment.spaceId,
    unitId: attachment.unitId,
    targetDepartmentId: attachment.targetDepartmentId,
    operationalTypeKey: attachment.operationalTypeKey,
  });
  const boundSpaceId =
    target.targetKind === "OPERATIONAL_TYPE" ? input.boundSpaceId?.trim() || null : null;

  const scheduleKind = mapTimingModeToScheduleKind(attachment.timingMode);
  const isFollowUp = Boolean(followsRecordId);
  const isAdHoc = input.adHoc === true || attachment.timingMode === "AD_HOC" || isFollowUp;
  const requirementKey =
    isFollowUp
      ? `followup|${followsRecordId}|${cuidLike().slice(0, 8)}`
      : input.requirementKey?.trim() ||
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
      id: governing.id,
      stableKey: governing.stableKey,
      version: governing.version,
      name: governing.name,
      description: governing.description,
      instructions: governing.instructions,
      purposeType: governing.purposeType,
      category: governing.category,
      recommendedCadence: governing.recommendedCadence,
      passingScore: governing.passingScore,
      criticalFailureForcesFailure: governing.criticalFailureForcesFailure,
      sections: parseInspectionSections(governing.sections),
      fields: governing.fields.map((f) => ({
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
        sectionKey: "sectionKey" in f ? (f.sectionKey ?? null) : null,
        scoreWeight: "scoreWeight" in f ? (f.scoreWeight ?? null) : null,
        critical: "critical" in f ? f.critical === true : false,
        creditValues: "creditValues" in f ? (f.creditValues ?? []) : [],
      })),
      rules,
      repeatingGroups: parseRepeatingGroups(governing.repeatingGroups),
      calculations: Array.isArray(governing.calculations) ? governing.calculations : [],
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
      cycleStableKey: isFollowUp ? null : (input.cycleStableKey ?? null),
      cycleLabel: isFollowUp ? null : (input.cycleLabel ?? null),
      windowStartLocal: isFollowUp ? null : (input.windowStartLocal ?? null),
      windowEndLocal: isFollowUp ? null : (input.windowEndLocal ?? null),
      windowOrdinal: isFollowUp ? null : (input.windowOrdinal ?? null),
    },
  });

  const now = input.now ?? new Date();
  const occurredAt = toDate(input.occurredAt);
  const recordedOnline = input.recordedOnline !== false;
  const correctiveActionText = input.correctiveActionText?.trim() || null;
  const status = resolveRecordStatus({
    outOfStandard: recordOutOfStandard,
    correctiveActionText,
    allowNeedsReview: input.allowNeedsReview === true || validation.needsReview,
  });
  const recordedByUserId = actor.userId;

  const purposeType = governing.purposeType as OperationalTemplatePurposeType;
  const recordId = cuidLike();
  const mediaStore = input.mediaStore ?? getEvidenceMediaStore();
  if (preparedMedia.items.length > 0 && !mediaStore) {
    throw new Error(EVIDENCE_STORAGE_UNAVAILABLE);
  }
  let storedKeys: string[] = [];
  const attachmentRows = preparedMedia.items.map((item, index) => {
    const id = newEvidenceAttachmentId();
    const storageKey = evidenceMediaStorageKey({
      facilityId: input.facilityId,
      recordId,
      attachmentId: id,
      extension: item.extension,
    });
    return { id, item, storageKey, displaySequence: (index + 1) * 10 };
  });

  try {
    if (attachmentRows.length > 0) {
      if (!mediaStore) throw new Error(EVIDENCE_STORAGE_UNAVAILABLE);
      storedKeys = await putEvidenceObjects(
        mediaStore,
        attachmentRows.map((row) => ({
          storageKey: row.storageKey,
          bytes: row.item.bytes,
          contentType: row.item.contentType,
        })),
      );
    }
    return await client.operationalEvidenceRecord.create({
      data: {
        id: recordId,
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        logAttachmentId: attachment.id,
        attachmentStableKey: attachment.stableKey,
        catalogDefinitionId: governing.id,
        templateStableKey: governing.stableKey,
        templateVersion: governing.version,
        templateName: attachment.localDisplayLabel?.trim() || governing.name,
        purposeType,
        requirementKey,
        logRequirementKey: isAdHoc ? null : requirementKey,
        operationalDate: facilityLocalDateToServiceDate(input.operationalDateKey),
        scheduleKind,
        cycleStableKey: isFollowUp ? null : (input.cycleStableKey ?? null),
        cycleLabel: isFollowUp ? null : (input.cycleLabel ?? null),
        windowStartLocal: isFollowUp ? null : (input.windowStartLocal ?? null),
        windowEndLocal: isFollowUp ? null : (input.windowEndLocal ?? null),
        unitId: target.unitId,
        spaceId: boundSpaceId ?? target.spaceId,
        placeLabelSnapshot: await placeLabelAtSubmission(client, {
          facilityId: input.facilityId,
          spaceId: boundSpaceId ?? target.spaceId,
          supplied: input.placeLabelSnapshot,
        }),
        assetId: target.assetId,
        followsRecordId,
        status,
        outOfStandard: recordOutOfStandard,
        correctiveActionText,
        correctiveActionAt: correctiveActionText ? now : null,
        correctiveActionByUserId: correctiveActionText ? recordedByUserId : null,
        correctiveActionByEmployeeId: correctiveActionText ? actor.employeeId : null,
        occurredAt,
        recordedAt: now,
        synchronizedAt: recordedOnline ? now : null,
        recordedOnline,
        clientCommandId,
        deviceBoundUnitId: input.deviceBoundUnitId ?? null,
        recordedByUserId,
        recordedByEmployeeId: actor.employeeId,
        recordedByLabel: actor.label,
        ...(actingContext ? partnerActingColumns(actingContext) : {}),
        templateSnapshotJson: snapshotToPrismaJson(
          legacyCompatibleTemplateFields(snapshot) as unknown as ReturnType<
            typeof buildCanonicalLogSubmissionSnapshot
          >,
        ),
        values: {
          create: [
            ...buildValueRows(visibleFields, visibleValues, validation.fieldOutOfStandard),
            ...repeat.rows.flatMap((row) =>
              row.cells.map((cell) => ({
                fieldKey: cell.columnKey,
                label: cell.label,
                fieldType: cell.fieldType as TemplateFieldSnapshot["fieldType"],
                valueText: cell.valueText,
                valueNumber: cell.valueNumber,
                valueBoolean: cell.valueBoolean,
                valueDateTime: null,
                valueSelections: cell.valueSelections,
                outOfStandard: cell.outOfStandard,
                groupKey: row.groupKey,
                rowKey: row.rowKey,
                rowSequence: row.rowSequence,
              })),
            ),
          ],
        },
        attachments: {
          create: attachmentRows.map((row) => ({
            id: row.id,
            facilityId: input.facilityId,
            fieldKey: row.item.fieldKey,
            kind: row.item.kind,
            storageKey: row.storageKey,
            originalFilename: row.item.originalFilename,
            contentType: row.item.contentType,
            sizeBytes: row.item.sizeBytes,
            displaySequence: row.displaySequence,
            uploadedByUserId: recordedByUserId,
            uploadedByEmployeeId: actor.employeeId,
            uploadedByLabel: actor.label,
          })),
        },
      },
      include: { values: true, corrections: true },
    });
  } catch (err) {
    if (mediaStore) {
      await Promise.all(storedKeys.map((storageKey) => mediaStore.remove(storageKey)));
    }
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
