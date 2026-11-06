/**
 * Groups successor Attachment rows into one logical configuration per Catalog + target.
 * Pure projection — not coupled to React.
 */

import { attachmentLineageKey } from "./attachment-update-policy";
import { toServiceDateKey } from "@/lib/operational-time";

export type LogicalAttachmentSegment = {
  id: string;
  stableKey: string;
  catalogStableKey: string;
  catalogVersion: number;
  status: "ACTIVE" | "INACTIVE" | "RETIRED";
  effectiveFrom: Date;
  effectiveTo: Date | null;
  targetKind: string;
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
  operationalTypeKey?: string | null;
  departmentId?: string | null;
};

export type LogicalLogAttachmentProjection = {
  lineageKey: string;
  catalogStableKey: string;
  targetKind: string;
  current: LogicalAttachmentSegment;
  prior: LogicalAttachmentSegment[];
  latestPublishedCatalogVersion: number | null;
  updateAvailable: boolean;
  effectiveHistory: Array<{
    attachmentId: string;
    catalogVersion: number;
    status: LogicalAttachmentSegment["status"];
    effectiveFromKey: string;
    effectiveToKey: string | null;
  }>;
};

function rankCurrent(a: LogicalAttachmentSegment, b: LogicalAttachmentSegment): number {
  if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
  if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
  return toServiceDateKey(b.effectiveFrom).localeCompare(toServiceDateKey(a.effectiveFrom));
}

export function groupLogicalLogAttachments(
  rows: readonly LogicalAttachmentSegment[],
  latestPublishedVersionByStableKey?: ReadonlyMap<string, number>,
): LogicalLogAttachmentProjection[] {
  const byLineage = new Map<string, LogicalAttachmentSegment[]>();
  for (const row of rows) {
    const key = attachmentLineageKey({
      catalogStableKey: row.catalogStableKey,
      targetKind: row.targetKind,
      assetId: row.assetId,
      spaceId: row.spaceId,
      unitId: row.unitId,
      targetDepartmentId: row.targetDepartmentId,
      operationalTypeKey: row.operationalTypeKey,
      departmentId: row.departmentId,
    });
    const list = byLineage.get(key) ?? [];
    list.push(row);
    byLineage.set(key, list);
  }

  const out: LogicalLogAttachmentProjection[] = [];
  for (const [lineageKey, segments] of byLineage) {
    const sorted = [...segments].sort(rankCurrent);
    const current = sorted[0]!;
    const latest = latestPublishedVersionByStableKey?.get(current.catalogStableKey) ?? null;
    const history = [...segments]
      .sort((a, b) => toServiceDateKey(a.effectiveFrom).localeCompare(toServiceDateKey(b.effectiveFrom)))
      .map((seg) => ({
        attachmentId: seg.id,
        catalogVersion: seg.catalogVersion,
        status: seg.status,
        effectiveFromKey: toServiceDateKey(seg.effectiveFrom),
        effectiveToKey: seg.effectiveTo ? toServiceDateKey(seg.effectiveTo) : null,
      }));
    out.push({
      lineageKey,
      catalogStableKey: current.catalogStableKey,
      targetKind: current.targetKind,
      current,
      prior: sorted.slice(1),
      latestPublishedCatalogVersion: latest,
      updateAvailable: latest != null && latest > current.catalogVersion,
      effectiveHistory: history,
    });
  }
  return out.sort((a, b) => a.catalogStableKey.localeCompare(b.catalogStableKey));
}

/** BUILD list: current live/paused configs only — not closed historical segments. */
export function logicalAttachmentsForBuildList(
  groups: readonly LogicalLogAttachmentProjection[],
): LogicalLogAttachmentProjection[] {
  return groups.filter((g) => {
    if (g.current.status === "ACTIVE") return true;
    if (g.current.status === "INACTIVE" && !g.current.effectiveTo) return true;
    return false;
  });
}
