/**
 * Preventive Maintenance Run grouping.
 * Pure Facility-civil projections. Does not persist dashboard state.
 */

import type { CivilDate } from "./civil-date";
import { compareCivilDates, parseCivilDate } from "./civil-date";
import { getMaterializationDate, isOccurrenceEligibleForMaterialization } from "./schedule";
import {
  getOccurrenceCalendarState,
  presentPmOccurrence,
  type PmOccurrencePresentation,
} from "./version-semantics";
import { isPmActiveWorkOrderStatus } from "./active-work-order";
import { persistPmPriority, presentPmPriority } from "./presentation";

export type PmRunAttentionKind =
  | "OVERDUE"
  | "DUE_TODAY"
  | "DUE_SOON"
  | "UNASSIGNED"
  | "NEEDS_CONFIGURATION";

export type PmRunSecondaryKind = "COMPLETED" | "SKIPPED" | "PROJECTED";

export type PmRunWorkOrderSummary = {
  id: string;
  repairCode: string;
  status: string;
  assignedEmployeeId: string | null;
  assigneeLabel: string | null;
  priority: string;
};

export type PmRunConfigurationIssue = {
  code: string;
  message: string;
};

export type PmRunRowInput = {
  occurrenceId: string | null;
  planId: string;
  planName: string;
  planStatus: string;
  assetName: string;
  assetCode: string;
  assetStatus: string;
  locationLabel: string;
  locationIsPreview: boolean;
  scheduledDate: CivilDate | Date;
  occurrenceStatus: string;
  generationLeadDays: number;
  facilityToday: CivilDate | Date;
  categoryLabel: string | null;
  priority: string;
  procedureLabel: string | null;
  workOrders: PmRunWorkOrderSummary[];
  skipReason: string | null;
  skippedAt: string | null;
  skippedByLabel: string | null;
  completedAt: string | null;
  configurationIssue: PmRunConfigurationIssue | null;
};

export function presentPmWorkOrderKindLabel(kind: string | null | undefined): string {
  return kind === "PREVENTIVE" ? "Preventive" : "Corrective";
}

export function presentPmOccurrenceStateLabel(state: PmOccurrencePresentation | "PROJECTED"): string {
  switch (state) {
    case "OVERDUE":
      return "Overdue";
    case "DUE":
      return "Due today";
    case "UPCOMING":
      return "Due soon";
    case "COMPLETED":
      return "Completed";
    case "SKIPPED":
      return "Skipped";
    case "PROJECTED":
      return "Projected";
    default:
      return "Scheduled";
  }
}

export function isPmDueSoon(input: {
  occurrenceStatus: string;
  scheduledDate: CivilDate | Date;
  facilityToday: CivilDate | Date;
  generationLeadDays: number;
}): boolean {
  if (input.occurrenceStatus !== "OPEN") return false;
  const calendar = getOccurrenceCalendarState(input);
  if (calendar !== "UPCOMING") return false;
  return isOccurrenceEligibleForMaterialization({
    scheduledDate: input.scheduledDate,
    generationLeadDays: input.generationLeadDays,
    facilityToday: input.facilityToday,
  });
}

export function activePmRunWorkOrder(
  workOrders: PmRunWorkOrderSummary[],
): PmRunWorkOrderSummary | null {
  return workOrders.find((row) => isPmActiveWorkOrderStatus(row.status)) ?? null;
}

export function isPmRunUnassigned(input: {
  occurrenceStatus: string;
  workOrders: PmRunWorkOrderSummary[];
}): boolean {
  if (input.occurrenceStatus !== "OPEN") return false;
  const active = activePmRunWorkOrder(input.workOrders);
  return Boolean(active && !active.assignedEmployeeId);
}

export function presentPmConfigurationIssue(code: string, message: string): PmRunConfigurationIssue {
  if (code === "ARCHIVED_CATEGORY") {
    return { code, message: message || "Maintenance category is archived." };
  }
  if (code === "CATEGORY_MISSING") {
    return { code, message: message || "Maintenance category is missing." };
  }
  if (code === "PROCEDURE_INVALID") {
    return { code, message: message || "Pinned Procedure is not valid." };
  }
  if (code === "TEMPLATE_MISSING") {
    return { code, message: message || "A required Record template is missing." };
  }
  return { code, message: message || "Work Order could not be generated." };
}

export function classifyPmRunAttention(input: PmRunRowInput): PmRunAttentionKind[] {
  const kinds: PmRunAttentionKind[] = [];
  if (input.occurrenceStatus !== "OPEN" || !input.occurrenceId) return kinds;
  const calendar = getOccurrenceCalendarState(input);
  const inWindow =
    calendar !== "UPCOMING" ||
    isPmDueSoon(input);
  const active = activePmRunWorkOrder(input.workOrders);
  if (inWindow && !active && input.workOrders.length === 0) {
    kinds.push("NEEDS_CONFIGURATION");
  }
  if (calendar === "OVERDUE") kinds.push("OVERDUE");
  if (calendar === "DUE") kinds.push("DUE_TODAY");
  if (isPmDueSoon(input)) kinds.push("DUE_SOON");
  if (isPmRunUnassigned(input)) kinds.push("UNASSIGNED");
  return kinds;
}

export type PmRunBoardCounts = {
  overdue: number;
  dueToday: number;
  dueSoon: number;
  unassigned: number;
  needsConfiguration: number;
  completed: number;
  skipped: number;
  projected: number;
};

export function emptyPmRunBoardCounts(): PmRunBoardCounts {
  return {
    overdue: 0,
    dueToday: 0,
    dueSoon: 0,
    unassigned: 0,
    needsConfiguration: 0,
    completed: 0,
    skipped: 0,
    projected: 0,
  };
}

function priorityRank(priority: string): number {
  const stored = persistPmPriority(priority);
  if (stored === "URGENT" || stored === "EMERGENCY") return 0;
  if (stored === "HIGH") return 1;
  return 2;
}

export function comparePmRunRows(
  kind: PmRunAttentionKind | PmRunSecondaryKind,
  a: PmRunRowInput,
  b: PmRunRowInput,
): number {
  const dateCmp = compareCivilDates(parseCivilDate(a.scheduledDate), parseCivilDate(b.scheduledDate));
  if (
    kind === "OVERDUE" ||
    kind === "DUE_SOON" ||
    kind === "PROJECTED" ||
    kind === "COMPLETED" ||
    kind === "SKIPPED" ||
    kind === "NEEDS_CONFIGURATION"
  ) {
    if (dateCmp !== 0) return kind === "COMPLETED" || kind === "SKIPPED" ? -dateCmp : dateCmp;
  }
  if (kind === "DUE_TODAY" || kind === "UNASSIGNED") {
    const p = priorityRank(a.priority) - priorityRank(b.priority);
    if (p !== 0) return p;
    if (dateCmp !== 0) return dateCmp;
  }
  return a.planName.localeCompare(b.planName);
}

export function groupPmRunBoard(rows: PmRunRowInput[]): {
  overdue: PmRunRowInput[];
  dueToday: PmRunRowInput[];
  unassigned: PmRunRowInput[];
  dueSoon: PmRunRowInput[];
  needsConfiguration: PmRunRowInput[];
  completed: PmRunRowInput[];
  skipped: PmRunRowInput[];
  projected: PmRunRowInput[];
  counts: PmRunBoardCounts;
} {
  const overdue: PmRunRowInput[] = [];
  const dueToday: PmRunRowInput[] = [];
  const unassigned: PmRunRowInput[] = [];
  const dueSoon: PmRunRowInput[] = [];
  const needsConfiguration: PmRunRowInput[] = [];
  const completed: PmRunRowInput[] = [];
  const skipped: PmRunRowInput[] = [];
  const projected: PmRunRowInput[] = [];

  for (const row of rows) {
    if (!row.occurrenceId) {
      projected.push(row);
      continue;
    }
    const presented = presentPmOccurrence({
      status: row.occurrenceStatus,
      scheduledDate: row.scheduledDate,
      facilityToday: row.facilityToday,
    });
    if (presented === "COMPLETED") {
      completed.push(row);
      continue;
    }
    if (presented === "SKIPPED") {
      skipped.push(row);
      continue;
    }
    const attention = classifyPmRunAttention(row);
    if (attention.includes("OVERDUE")) overdue.push(row);
    if (attention.includes("DUE_TODAY")) dueToday.push(row);
    if (attention.includes("UNASSIGNED")) unassigned.push(row);
    if (attention.includes("DUE_SOON")) dueSoon.push(row);
    if (attention.includes("NEEDS_CONFIGURATION")) needsConfiguration.push(row);
  }

  const sort = (kind: PmRunAttentionKind | PmRunSecondaryKind, list: PmRunRowInput[]) =>
    [...list].sort((a, b) => comparePmRunRows(kind, a, b));

  return {
    overdue: sort("OVERDUE", overdue),
    dueToday: sort("DUE_TODAY", dueToday),
    unassigned: sort("UNASSIGNED", unassigned),
    dueSoon: sort("DUE_SOON", dueSoon),
    needsConfiguration: sort("NEEDS_CONFIGURATION", needsConfiguration),
    completed: sort("COMPLETED", completed),
    skipped: sort("SKIPPED", skipped),
    projected: sort("PROJECTED", projected),
    counts: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      dueSoon: dueSoon.length,
      unassigned: unassigned.length,
      needsConfiguration: needsConfiguration.length,
      completed: completed.length,
      skipped: skipped.length,
      projected: projected.length,
    },
  };
}

export function pmRunCalendarState(input: {
  occurrenceId: string | null;
  occurrenceStatus: string;
  scheduledDate: CivilDate | Date;
  facilityToday: CivilDate | Date;
}): PmOccurrencePresentation | "PROJECTED" {
  if (!input.occurrenceId) return "PROJECTED";
  return presentPmOccurrence({
    status: input.occurrenceStatus,
    scheduledDate: input.scheduledDate,
    facilityToday: input.facilityToday,
  });
}

export function formatPmRunPriority(priority: string): string {
  return presentPmPriority(priority);
}

export function materializationHorizonDate(
  scheduledDate: CivilDate | Date,
  generationLeadDays: number,
): CivilDate {
  return getMaterializationDate(scheduledDate, generationLeadDays);
}

export function hasPmAttention(counts: PmRunBoardCounts): boolean {
  return (
    counts.overdue +
      counts.dueToday +
      counts.dueSoon +
      counts.unassigned +
      counts.needsConfiguration >
    0
  );
}
