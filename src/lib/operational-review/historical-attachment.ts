/**
 * Harbor attachment history reliability for Review.
 *
 * Successor lineage (closed prior interval + later segment) is reconstructable.
 * In-place mutation of an already-effective segment is not.
 */

import { attachmentLineageKey } from "@/lib/canonical-logs/attachment-update-policy";
import { segmentCoversDate } from "@/lib/canonical-logs/expectation-history";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";

import type { ReviewAttachmentSegmentFact } from "./types";

export type AttachmentHistoryReliability =
  | { status: "reliable"; covering: ReviewAttachmentSegmentFact }
  | { status: "none" }
  | { status: "unavailable"; reason: "attachment_history_not_reliable" };

function lineageOf(segment: ReviewAttachmentSegmentFact): string {
  return attachmentLineageKey({
    catalogStableKey: segment.catalogStableKey,
    targetKind: segment.targetKind,
    assetId: segment.assetId,
    spaceId: segment.spaceId,
    unitId: segment.unitId,
    targetDepartmentId: segment.targetDepartmentId,
    operationalTypeKey: segment.operationalTypeKey,
    departmentId: segment.departmentId,
  });
}

function hasSuccessor(segments: readonly ReviewAttachmentSegmentFact[], covering: ReviewAttachmentSegmentFact): boolean {
  if (!covering.effectiveTo) return false;
  const coveringTo = toServiceDateKey(covering.effectiveTo);
  const key = lineageOf(covering);
  return segments.some((row) => {
    if (row.id === covering.id) return false;
    if (lineageOf(row) !== key) return false;
    return toServiceDateKey(row.effectiveFrom) > coveringTo || toServiceDateKey(row.effectiveFrom) > toServiceDateKey(covering.effectiveFrom);
  });
}

function overlappingCovering(
  segments: readonly ReviewAttachmentSegmentFact[],
  serviceDateKey: string,
): boolean {
  const byLineage = new Map<string, ReviewAttachmentSegmentFact[]>();
  for (const segment of segments) {
    if (!segmentCoversDate(segment, serviceDateKey)) continue;
    const key = lineageOf(segment);
    const list = byLineage.get(key) ?? [];
    list.push(segment);
    byLineage.set(key, list);
  }
  for (const group of byLineage.values()) {
    if (group.length > 1) return true;
  }
  return false;
}

/**
 * Prove that the covering segment's definition can be used for this service date.
 * In-place mutation: covering row updated after it became effective, no successor,
 * and the review date is before that update's facility service date.
 */
export function attachmentHistoryReliability(input: {
  segments: readonly ReviewAttachmentSegmentFact[];
  lineageSegments: readonly ReviewAttachmentSegmentFact[];
  serviceDateKey: string;
  timezone: string;
}): AttachmentHistoryReliability {
  const covering = input.segments.filter((segment) => segmentCoversDate(segment, input.serviceDateKey));
  if (covering.length === 0) return { status: "none" };
  if (overlappingCovering(input.lineageSegments, input.serviceDateKey)) {
    return { status: "unavailable", reason: "attachment_history_not_reliable" };
  }
  if (covering.length > 1) {
    return { status: "unavailable", reason: "attachment_history_not_reliable" };
  }

  const segment = covering[0]!;
  const effectiveFromKey = toServiceDateKey(segment.effectiveFrom);
  const updatedKey = toServiceDateKey(getFacilityServiceDate(input.timezone, segment.updatedAt));

  if (hasSuccessor(input.lineageSegments, segment)) {
    return { status: "reliable", covering: segment };
  }

  if (updatedKey > effectiveFromKey && input.serviceDateKey < updatedKey) {
    return { status: "unavailable", reason: "attachment_history_not_reliable" };
  }

  return { status: "reliable", covering: segment };
}

export function groupAttachmentLineages(
  segments: readonly ReviewAttachmentSegmentFact[],
): Map<string, ReviewAttachmentSegmentFact[]> {
  const byLineage = new Map<string, ReviewAttachmentSegmentFact[]>();
  for (const segment of segments) {
    const key = lineageOf(segment);
    const list = byLineage.get(key) ?? [];
    list.push(segment);
    byLineage.set(key, list);
  }
  return byLineage;
}

export function catalogDefinitionForHistory(
  segment: ReviewAttachmentSegmentFact,
): ReviewAttachmentSegmentFact {
  if (segment.catalogDefinition.status === "RETIRED") {
    return {
      ...segment,
      catalogDefinition: {
        ...segment.catalogDefinition,
        status: "PUBLISHED",
      },
    };
  }
  return segment;
}
