/**
 * Batch-safe canonical evidence grouping for Runtime Location State.
 * Reuses resolveLogRequirementsForAttachment. Does not load Log Book per space.
 */

import type { LogRequirement } from "@/lib/logs-architecture/types";
import {
  bindOperationalTypeRequirementToSpace,
  dedupeLocationLogRequirements,
  matchLogAttachmentToLocation,
  spaceIdForLogTarget,
  type LocationLogAttachmentRow,
} from "@/lib/canonical-logs/log-operational-type-applicability";
import {
  resolveLogRequirementsForAttachment,
  type ExistingLogEvidenceForResolve,
  type LogAttachmentForResolve,
  type PublishedCycleForLogs,
} from "@/lib/canonical-logs/resolve-log-requirements";

import type { RuntimeEvidenceItem, RuntimeEvidenceState } from "./types";

export type RuntimeEvidenceSpaceContext = {
  spaceId: string;
  departmentId: string;
  unitId: string | null;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
  facilityId: string;
};

export function resolveEvidenceRequirementsForSpaces(input: {
  attachments: readonly LogAttachmentForResolve[];
  spaces: readonly RuntimeEvidenceSpaceContext[];
  operationalDateKey: string;
  now: Date;
  facilityTimezone: string;
  publishedCyclesByDepartmentId: ReadonlyMap<string, readonly PublishedCycleForLogs[]>;
  existingRecords: readonly ExistingLogEvidenceForResolve[];
}): Map<string, LogRequirement[]> {
  const bySpace = new Map<string, LogRequirement[]>();
  const attachmentRows: LocationLogAttachmentRow[] = input.attachments.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    catalogStableKey: row.catalogStableKey,
    catalogVersion: row.catalogVersion,
    label: row.localDisplayLabel ?? row.catalogDefinition.name,
    targetKind: row.targetKind,
    spaceId: row.spaceId,
    unitId: row.unitId,
    targetDepartmentId: row.targetDepartmentId,
    operationalTypeKey: row.operationalTypeKey,
    assetId: row.assetId,
    status: row.status,
  }));

  for (const space of input.spaces) {
    const collected: LogRequirement[] = [];
    for (const attachment of input.attachments) {
      const row = attachmentRows.find((item) => item.id === attachment.id);
      if (!row) continue;
      const match = matchLogAttachmentToLocation(row, {
        facilityId: space.facilityId,
        departmentId: space.departmentId,
        spaceId: space.spaceId,
        unitId: space.unitId,
        operationalTypeKey: space.operationalTypeKey,
        operationalTypeName: space.operationalTypeName,
      });
      if (!match) continue;

      const resolvedSpaceId =
        attachment.targetKind === "OPERATIONAL_TYPE" ? space.spaceId : attachment.resolvedSpaceId;
      const resolved = resolveLogRequirementsForAttachment({
        attachment: {
          ...attachment,
          resolvedSpaceId,
        },
        operationalDateKey: input.operationalDateKey,
        now: input.now,
        facilityTimezone: input.facilityTimezone,
        publishedCycles: [
          ...(input.publishedCyclesByDepartmentId.get(attachment.departmentId) ?? []),
        ],
        existingRecords: [...input.existingRecords],
      });
      for (const requirement of resolved) {
        collected.push(
          requirement.target.kind === "OPERATIONAL_TYPE"
            ? bindOperationalTypeRequirementToSpace(requirement, space.spaceId)
            : requirement,
        );
      }
    }
    bySpace.set(space.spaceId, dedupeLocationLogRequirements(collected));
  }

  return bySpace;
}

export function summarizeRuntimeEvidence(
  requirements: readonly LogRequirement[],
): RuntimeEvidenceState {
  const items: RuntimeEvidenceItem[] = requirements.map((requirement) => ({
    requirementKey: requirement.requirementKey,
    attachmentId: requirement.attachmentId,
    catalogStableKey: requirement.catalogStableKey,
    displayName: requirement.catalogName,
    productState: requirement.productState,
    cycleStableKey: requirement.cycleStableKey,
    window: {
      start: requirement.windowStartLocal,
      end: requirement.windowEndLocal,
    },
    recordId: requirement.recordId,
    href: requirement.recordId
      ? `/staffing/logs/records/${requirement.recordId}`
      : null,
    needsSupervisorReview: requirement.needsSupervisorReview,
  }));

  const countable = items.filter(
    (item) => item.productState !== "NOT_APPLICABLE" && item.productState !== "NEEDS_SETUP",
  );

  return {
    requiredToday: countable.length,
    dueNow: items.filter((item) => item.productState === "DUE").map((item) => item.requirementKey),
    upcoming: items
      .filter((item) => item.productState === "UPCOMING")
      .map((item) => item.requirementKey),
    completed: items
      .filter(
        (item) =>
          item.productState === "COMPLETED" || item.productState === "COMPLETED_WITH_EXCEPTION",
      )
      .map((item) => item.requirementKey),
    overdue: items
      .filter((item) => item.productState === "OVERDUE")
      .map((item) => item.requirementKey),
    needsReview: items
      .filter((item) => item.needsSupervisorReview)
      .map((item) => item.requirementKey),
    correctiveOpen: items
      .filter((item) => item.productState === "COMPLETED_WITH_EXCEPTION")
      .map((item) => item.requirementKey),
    items,
  };
}

export function evidenceBelongsToSpace(
  requirement: LogRequirement,
  spaceId: string,
  unitId: string | null,
): boolean {
  const targetSpace = spaceIdForLogTarget(requirement.target);
  if (targetSpace) return targetSpace === spaceId;
  if (requirement.target.kind === "UNIT") {
    return Boolean(unitId && requirement.target.unitId === unitId);
  }
  return true;
}
