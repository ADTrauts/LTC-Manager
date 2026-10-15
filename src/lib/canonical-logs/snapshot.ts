import type {
  CatalogLogCategory,
  CatalogLogPurposeType,
  CatalogRecommendedCadence,
  LogAttachmentTargetKind,
  LogAttachmentTimingMode,
  OperationalEvidenceFieldType,
  Prisma,
} from "@prisma/client";

import type { LogAttachmentTarget } from "@/lib/logs-architecture/types";

/** Snapshot schema version discriminator inside templateSnapshotJson. */
export const LOG_SUBMISSION_SNAPSHOT_VERSION = 2 as const;

export type LogSubmissionSnapshotV2 = {
  snapshotSchemaVersion: typeof LOG_SUBMISSION_SNAPSHOT_VERSION;
  kind: "CANONICAL_LOG";
  catalog: {
    id: string;
    stableKey: string;
    version: number;
    name: string;
    description: string | null;
    instructions: string | null;
    purposeType: CatalogLogPurposeType;
    category: CatalogLogCategory;
    recommendedCadence: CatalogRecommendedCadence | null;
    passingScore?: number | null;
    criticalFailureForcesFailure?: boolean;
    sections?: Array<{
      sectionKey: string;
      label: string;
      description?: string | null;
      displaySequence: number;
    }>;
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
      sectionKey?: string | null;
      scoreWeight?: number | null;
      critical?: boolean;
      creditValues?: string[];
    }>;
    rules: Array<{
      ruleKey: string;
      sourceFieldKey: string;
      operator: string;
      compareValue?: string | number | boolean | null;
      actions: Array<{ kind: string; targetFieldKey?: string | null }>;
    }>;
    repeatingGroups?: Array<{
      groupKey: string;
      label: string;
      helpText?: string | null;
      sectionKey?: string | null;
      minRows?: number;
      maxRows?: number;
      displaySequence: number;
      columns: Array<{
        columnKey: string;
        label: string;
        fieldType: string;
        isRequired?: boolean;
        displaySequence: number;
        unitLabel?: string | null;
        minNumber?: number | null;
        maxNumber?: number | null;
        correctiveActionTrigger?: boolean;
        correctiveActionRequired?: boolean;
      }>;
    }>;
    calculations?: Array<{
      calculationKey: string;
      label: string;
      unitLabel?: string | null;
      decimalPrecision?: number | null;
      expression: unknown;
    }>;
  };
  attachment: {
    id: string;
    stableKey: string;
    departmentId: string;
    status: string;
    localDisplayLabel: string | null;
    localInstructions: string | null;
    timingMode: LogAttachmentTimingMode;
    targetKind: LogAttachmentTargetKind;
    target: LogAttachmentTarget;
    cycleStableKeys: string[];
    dailyWindows: Array<{
      label: string;
      startLocal: string;
      endLocal: string;
      displaySequence: number;
    }>;
    calendar: {
      cadence: string | null;
      daysOfWeek: number[];
      dayOfMonth: number | null;
      dueTimeLocal: string | null;
    } | null;
    allowAdHoc: boolean;
  };
  timingContext: {
    scheduleKind: string;
    cycleStableKey: string | null;
    cycleLabel: string | null;
    windowStartLocal: string | null;
    windowEndLocal: string | null;
    windowOrdinal: number | null;
  };
  effectiveInstructions: string | null;
};

export function buildCanonicalLogSubmissionSnapshot(input: {
  catalog: {
    id: string;
    stableKey: string;
    version: number;
    name: string;
    description: string | null;
    instructions: string | null;
    purposeType: CatalogLogPurposeType;
    category: CatalogLogCategory;
    recommendedCadence: CatalogRecommendedCadence | null;
    passingScore?: number | null;
    criticalFailureForcesFailure?: boolean;
    sections?: LogSubmissionSnapshotV2["catalog"]["sections"];
    fields: LogSubmissionSnapshotV2["catalog"]["fields"];
    rules?: LogSubmissionSnapshotV2["catalog"]["rules"];
    repeatingGroups?: LogSubmissionSnapshotV2["catalog"]["repeatingGroups"];
    calculations?: LogSubmissionSnapshotV2["catalog"]["calculations"];
  };
  attachment: {
    id: string;
    stableKey: string;
    departmentId: string;
    status: string;
    localDisplayLabel: string | null;
    localInstructions: string | null;
    timingMode: LogAttachmentTimingMode;
    targetKind: LogAttachmentTargetKind;
    target: LogAttachmentTarget;
    cycleStableKeys: string[];
    dailyWindows: LogSubmissionSnapshotV2["attachment"]["dailyWindows"];
    calendar: LogSubmissionSnapshotV2["attachment"]["calendar"];
    allowAdHoc: boolean;
  };
  timingContext: LogSubmissionSnapshotV2["timingContext"];
}): LogSubmissionSnapshotV2 {
  const effectiveInstructions =
    input.attachment.localInstructions?.trim() ||
    input.catalog.instructions ||
    null;

  return {
    snapshotSchemaVersion: LOG_SUBMISSION_SNAPSHOT_VERSION,
    kind: "CANONICAL_LOG",
    catalog: {
      ...input.catalog,
      fields: input.catalog.fields.map((f) => ({ ...f })),
      rules: (input.catalog.rules ?? []).map((rule) => ({
        ...rule,
        actions: rule.actions.map((action) => ({ ...action })),
      })),
    },
    attachment: {
      ...input.attachment,
      dailyWindows: input.attachment.dailyWindows.map((w) => ({ ...w })),
      cycleStableKeys: [...input.attachment.cycleStableKeys],
    },
    timingContext: { ...input.timingContext },
    effectiveInstructions,
  };
}

export function parseLogSubmissionSnapshot(raw: unknown): LogSubmissionSnapshotV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== "CANONICAL_LOG" || obj.snapshotSchemaVersion !== LOG_SUBMISSION_SNAPSHOT_VERSION) {
    return null;
  }
  const catalog = obj.catalog;
  if (!catalog || typeof catalog !== "object") return null;
  return raw as LogSubmissionSnapshotV2;
}

export function snapshotToPrismaJson(
  snapshot: LogSubmissionSnapshotV2,
): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

/** Phase 9C TemplateSnapshotJson compatibility fields mirrored at top-level for readers. */
export function legacyCompatibleTemplateFields(snapshot: LogSubmissionSnapshotV2) {
  return {
    templateId: snapshot.catalog.id,
    stableKey: snapshot.catalog.stableKey,
    version: snapshot.catalog.version,
    name: snapshot.catalog.name,
    description: snapshot.catalog.description,
    instructions: snapshot.effectiveInstructions,
    purposeType: snapshot.catalog.purposeType,
    fields: snapshot.catalog.fields,
    snapshotSchemaVersion: snapshot.snapshotSchemaVersion,
    kind: snapshot.kind,
    catalog: snapshot.catalog,
    attachment: snapshot.attachment,
    timingContext: snapshot.timingContext,
    effectiveInstructions: snapshot.effectiveInstructions,
  };
}
