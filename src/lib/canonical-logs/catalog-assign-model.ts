/**
 * Client-safe Catalog assign types and pure helpers.
 * Keep Node / Prisma services out of this module so BUILD picker UI can import it.
 */
import type { LogAttachmentTargetKind } from "@prisma/client";

export type CatalogAssignKind = Exclude<LogAttachmentTargetKind, "FACILITY">;

export type CatalogAssignTargetRow = {
  key: string;
  kind: CatalogAssignKind;
  id: string;
  label: string;
  groupLabel: string | null;
  departmentId: string | null;
  departmentName: string | null;
  suggested: boolean;
  assigned: boolean;
  attachmentId: string | null;
  disabled: boolean;
  disabledReason: string | null;
};

export type CatalogAssignCategory = {
  kind: CatalogAssignKind;
  label: string;
  targets: CatalogAssignTargetRow[];
};

export type CatalogAssignView = {
  catalogStableKey: string;
  catalogName: string;
  catalogDefinitionId: string;
  recommendedCadenceLabel: string;
  timingSummary: string;
  usingRecommendedSchedule: boolean;
  catalogNeedsSetup: boolean;
  catalogNeedsSetupReason: string | null;
  effectiveFromKey: string;
  effectiveLabel: string;
  categories: CatalogAssignCategory[];
};

export function targetAssignKey(kind: CatalogAssignKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseTargetAssignKey(
  key: string,
): { kind: CatalogAssignKind; id: string } | null {
  const split = key.indexOf(":");
  if (split <= 0) return null;
  const kind = key.slice(0, split);
  const id = key.slice(split + 1);
  if (!id) return null;
  if (
    kind !== "ASSET" &&
    kind !== "SPACE" &&
    kind !== "UNIT" &&
    kind !== "DEPARTMENT" &&
    kind !== "OPERATIONAL_TYPE"
  ) {
    return null;
  }
  return { kind, id };
}

export function computeCatalogAssignDiff(input: {
  selectedKeys: readonly string[];
  liveAssignments: ReadonlyArray<{ key: string; attachmentId: string }>;
}): {
  addKeys: string[];
  remove: Array<{ key: string; attachmentId: string }>;
} {
  const selected = new Set(input.selectedKeys);
  const live = new Map(input.liveAssignments.map((row) => [row.key, row.attachmentId]));
  const addKeys: string[] = [];
  const remove: Array<{ key: string; attachmentId: string }> = [];
  for (const key of selected) {
    if (!live.has(key)) addKeys.push(key);
  }
  for (const [key, attachmentId] of live) {
    if (!selected.has(key)) remove.push({ key, attachmentId });
  }
  return { addKeys, remove };
}

export const CATALOG_UNASSIGN_NOTICE =
  "This Log will no longer be required on the unselected targets. Completed records stay in the Log Book.";
