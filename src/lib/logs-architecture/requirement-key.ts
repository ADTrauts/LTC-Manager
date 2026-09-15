/**
 * Requirement key + satisfaction helpers for canonical Logs.
 * Extends Phase 9C buildRequirementKey with Attachment identity.
 */

import type { OperationalTemplateScheduleKind } from "@prisma/client";

import { buildRequirementKey } from "@/lib/operational-evidence/requirement-key";

import type { LogAttachmentTarget } from "./types";

export type LogRequirementKeyParts = {
  attachmentStableKey: string;
  catalogStableKey: string;
  scheduleKind: OperationalTemplateScheduleKind;
  cycleStableKey?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  target: LogAttachmentTarget;
  operationalDateKey: string;
};

function targetSegments(target: LogAttachmentTarget): {
  unitId: string | null;
  spaceId: string | null;
  assetId: string | null;
  departmentId: string | null;
} {
  switch (target.kind) {
    case "ASSET":
      return { unitId: null, spaceId: null, assetId: target.assetId, departmentId: null };
    case "SPACE":
      return { unitId: null, spaceId: target.spaceId, assetId: null, departmentId: null };
    case "UNIT":
      return { unitId: target.unitId, spaceId: null, assetId: null, departmentId: null };
    case "DEPARTMENT":
      return { unitId: null, spaceId: null, assetId: null, departmentId: target.departmentId };
    case "FACILITY":
      return { unitId: null, spaceId: null, assetId: null, departmentId: null };
  }
}

/**
 * Deterministic key for one Attachment + window + service date.
 * Prefixes Attachment stableKey so multiple attachments of the same Catalog
 * never collide.
 */
export function buildLogRequirementKey(parts: LogRequirementKeyParts): string {
  const target = targetSegments(parts.target);
  const base = buildRequirementKey({
    templateStableKey: parts.catalogStableKey,
    scheduleKind: parts.scheduleKind,
    cycleStableKey: parts.cycleStableKey,
    windowStartLocal: parts.windowStartLocal,
    windowEndLocal: parts.windowEndLocal,
    unitId: target.unitId,
    spaceId: target.spaceId,
    assetId: target.assetId,
    operationalDateKey: parts.operationalDateKey,
  });
  const dept = target.departmentId?.trim() || "-";
  return `${parts.attachmentStableKey}|${base}|dept:${dept}|kind:${parts.target.kind}`;
}

/**
 * Future OperationalEvidenceRecord.requirementKey for Attachment-based Logs
 * should use buildLogRequirementKey. Legacy Evidence keys (templateStableKey…)
 * remain valid for Phase 9C facility templates until cutover.
 */
export function isAttachmentBackedRequirementKey(requirementKey: string): boolean {
  // Attachment keys include "|kind:" suffix and start with attachmentStableKey segment.
  return requirementKey.includes("|kind:");
}
