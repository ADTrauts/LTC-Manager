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
    fields: LogSubmissionSnapshotV2["catalog"]["fields"];
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
