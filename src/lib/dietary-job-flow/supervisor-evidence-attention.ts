/**
 * Phase 6N — Supervisor Board evidence attention.
 * Pure. Does not query, resolve logs, or recalculate due state.
 *
 * Current requirement truth (Harbor on) comes from RLS evidence.
 * Historical attention comes from OperationalEvidenceRecord rows already loaded.
 */

import type { RuntimeLocationState } from "@/lib/runtime-location-state";

import type { SupervisorExceptionTemporal } from "./types";

export type SupervisorEvidenceKind = "current" | "historical";

export type SupervisorHistoricalEvidenceRecord = {
  id: string;
  unitId: string | null;
  spaceId: string | null;
  templateName: string;
  status: string;
  outOfStandard: boolean;
  correctiveActionText: string | null;
  logAttachmentId: string | null;
  logRequirementKey: string | null;
  requirementKey: string;
};

export type SupervisorEvidenceAttentionItem = {
  kind: SupervisorEvidenceKind;
  status: string;
  temporal: SupervisorExceptionTemporal;
  unitId: string | null;
  unitName: string | null;
  locationLabel: string | null;
  spaceId: string | null;
  sourceHref: string;
  availableActions: string[];
  requirementKey: string | null;
  recordId: string | null;
};

function spaceEvidenceHref(unitId: string | null, spaceId: string): string {
  if (unitId) {
    return `/unit/${unitId}?space=${encodeURIComponent(spaceId)}#evidence`;
  }
  return `/unit/${spaceId}?space=${encodeURIComponent(spaceId)}#evidence`;
}

function harborOpenHref(attachmentId: string, requirementKey: string, spaceId: string | null): string {
  const params = new URLSearchParams({
    attachmentId,
    requirementKey,
  });
  if (spaceId) params.set("spaceId", spaceId);
  return `/staffing/logs/open?${params.toString()}`;
}

function currentHarborItems(
  states: readonly RuntimeLocationState[],
): SupervisorEvidenceAttentionItem[] {
  const items: SupervisorEvidenceAttentionItem[] = [];
  for (const state of states) {
    const spaceId = state.identity.location.spaceId;
    const unitId = state.identity.location.unitId;
    const unitName = state.identity.hierarchy.unitName;
    const locationLabel = state.identity.displayName;

    for (const item of state.evidence.items) {
      const overdue = item.productState === "OVERDUE";
      const exception = item.productState === "COMPLETED_WITH_EXCEPTION";
      const review = item.needsSupervisorReview;
      if (!overdue && !exception && !review) continue;

      const recordHref = item.href ?? (item.recordId ? `/staffing/logs/records/${item.recordId}` : null);
      let sourceHref: string;
      let availableActions: string[];
      let status: string;
      let temporal: SupervisorExceptionTemporal;

      if (overdue) {
        status = `${item.displayName} overdue`;
        temporal = "Late";
        sourceHref =
          unitId || spaceId
            ? spaceEvidenceHref(unitId, spaceId)
            : harborOpenHref(item.attachmentId, item.requirementKey, spaceId);
        availableActions = ["Open SPACE evidence"];
      } else if (review) {
        status = `${item.displayName} needs review`;
        temporal = "Current";
        sourceHref = recordHref ?? spaceEvidenceHref(unitId, spaceId);
        availableActions = recordHref ? ["Open evidence record"] : ["Open SPACE evidence"];
      } else {
        status = `${item.displayName} completed with exception`;
        temporal = "NotConfirmed";
        sourceHref = recordHref ?? spaceEvidenceHref(unitId, spaceId);
        availableActions = recordHref ? ["Open evidence record"] : ["Open SPACE evidence"];
      }

      items.push({
        kind: "current",
        status,
        temporal,
        unitId,
        unitName,
        locationLabel,
        spaceId,
        sourceHref,
        availableActions,
        requirementKey: item.requirementKey,
        recordId: item.recordId,
      });
    }
  }
  return items;
}

function historicalStatus(row: SupervisorHistoricalEvidenceRecord): string {
  const name = row.templateName.trim() || "Evidence";
  if (row.status === "NEEDS_REVIEW") return `Needs review — ${name}`;
  if (row.correctiveActionText) return `Corrective action recorded — ${name}`;
  if (row.outOfStandard) return `Out-of-standard result — ${name}`;
  return `Evidence needs review — ${name}`;
}

function historicalItems(
  records: readonly SupervisorHistoricalEvidenceRecord[],
  unitNameById: ReadonlyMap<string, string>,
  spaceLabelById: ReadonlyMap<string, string>,
): SupervisorEvidenceAttentionItem[] {
  return records.map((row) => {
    const locationLabel = row.spaceId ? (spaceLabelById.get(row.spaceId) ?? null) : null;
    return {
      kind: "historical" as const,
      status: historicalStatus(row),
      temporal: (row.status === "NEEDS_REVIEW" ? "Current" : "NotConfirmed") as SupervisorExceptionTemporal,
      unitId: row.unitId,
      unitName: row.unitId ? (unitNameById.get(row.unitId) ?? null) : null,
      locationLabel,
      spaceId: row.spaceId,
      sourceHref: `/staffing/log-book/${row.id}`,
      availableActions: ["Open evidence record", "Open Log Book"],
      requirementKey: row.logRequirementKey ?? row.requirementKey,
      recordId: row.id,
    };
  });
}

/**
 * Suppress a historical row only when it is the same submitted record already
 * shown as current Harbor attention (same record id).
 * Legacy template history without a matching current record always remains.
 */
export function suppressDuplicateHistoricalAttention(
  current: readonly SupervisorEvidenceAttentionItem[],
  historical: readonly SupervisorEvidenceAttentionItem[],
): SupervisorEvidenceAttentionItem[] {
  const currentRecordIds = new Set(
    current.map((row) => row.recordId).filter((id): id is string => Boolean(id)),
  );
  return historical.filter((row) => !row.recordId || !currentRecordIds.has(row.recordId));
}

export function presentSupervisorEvidenceAttention(input: {
  canonicalLogsEnabled: boolean;
  states: readonly RuntimeLocationState[];
  historicalRecords: readonly SupervisorHistoricalEvidenceRecord[];
  unitNameById: ReadonlyMap<string, string>;
}): SupervisorEvidenceAttentionItem[] {
  const spaceLabelById = new Map<string, string>();
  for (const state of input.states) {
    spaceLabelById.set(state.identity.location.spaceId, state.identity.displayName);
  }

  const current = input.canonicalLogsEnabled ? currentHarborItems(input.states) : [];
  const historical = historicalItems(input.historicalRecords, input.unitNameById, spaceLabelById);
  const retainedHistorical = suppressDuplicateHistoricalAttention(current, historical);
  return [...current, ...retainedHistorical];
}
