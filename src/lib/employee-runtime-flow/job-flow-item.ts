/**
 * Phase 2C-2A — canonical Job Flow item contract.
 *
 * Job Flow is a composition of owner-referenced facts. It does not persist
 * items, invent overdue state, or replace domain lifecycles. Compatibility Work
 * is an explicit transitional owner kind until Phase 2C-2B+ removes it.
 */

import type { WorkRequirement } from "@/lib/department-work/types";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";

import type {
  EmployeeRuntimeEvidenceItem,
  EmployeeRuntimeMilestone,
} from "./types";

/** Source domains that may contribute composed Job Flow rows. */
export type JobFlowOwnerKind =
  | "OPERATING_RHYTHM_KEY_POINT"
  | "RECORD_REQUIREMENT"
  | "WORK_ORDER"
  | "PREVENTIVE_MAINTENANCE"
  | "ASSIGNMENT_EXCEPTION"
  | "COMPATIBILITY_WORK";

/**
 * Owner-derived presentation band. Domains map their own states into this
 * band; Job Flow must not invent overdue when the owner did not.
 */
export type JobFlowItemAttention =
  | "needs_attention"
  | "due_now"
  | "upcoming"
  | "completed"
  | "informational"
  | "not_applicable";

export type JobFlowItemPlace = {
  unitId: string | null;
  spaceId: string | null;
  assetId: string | null;
};

export type JobFlowItemTime = {
  /** Facility-local or absolute window start from the owning domain. */
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  dueAt: Date | null;
  /** Owner-supplied civil clock hints (optional; overnight-safe when instants set). */
  windowStartLocal: string | null;
  windowEndLocal: string | null;
};

/**
 * One composed row. `ownerId` is meaningful only within `ownerKind`.
 * No Job-Flow-local lifecycle store — state comes from the owner.
 */
export type JobFlowItem = {
  ownerKind: JobFlowOwnerKind;
  ownerId: string;
  place: JobFlowItemPlace;
  time: JobFlowItemTime;
  /** Opaque owner state token (e.g. WorkRequirementState, productState). */
  ownerState: string;
  attention: JobFlowItemAttention;
  label: string;
  href: string | null;
  /**
   * True only for COMPATIBILITY_WORK (plan-derived or one-off Work).
   * Must never be true for forward canonical owners.
   */
  compatibility: boolean;
};

function emptyTime(): JobFlowItemTime {
  return {
    windowStartsAt: null,
    windowEndsAt: null,
    dueAt: null,
    windowStartLocal: null,
    windowEndLocal: null,
  };
}

function workAttention(state: WorkRequirement["state"]): JobFlowItemAttention {
  switch (state) {
    case "PAST_DUE_NOT_CONFIRMED":
    case "CONFLICT_REVIEW":
      return "needs_attention";
    case "DUE":
    case "CURRENT":
    case "SAVED_ON_THIS_TABLET":
    case "SYNCHRONIZING":
      return "due_now";
    case "UPCOMING":
      return "upcoming";
    case "COMPLETED":
    case "COMPLETED_WITH_EVIDENCE":
    case "NOT_REQUIRED":
      return "completed";
    case "NOT_APPLICABLE":
    case "NOT_CONFIGURED":
    case "REASSIGNED":
      return "not_applicable";
    default:
      return "informational";
  }
}

/**
 * Adapt a derived WorkRequirement into an explicit compatibility item.
 * Does not create or publish Work Plans.
 */
export function jobFlowItemFromCompatibilityWork(row: WorkRequirement): JobFlowItem {
  return {
    ownerKind: "COMPATIBILITY_WORK",
    ownerId: row.occurrenceId ?? row.occurrenceKey,
    place: {
      unitId: row.unitId,
      spaceId: row.spaceId,
      assetId: row.assetId,
    },
    time: {
      windowStartsAt: row.windowStartsAt,
      windowEndsAt: row.windowEndsAt,
      dueAt: row.dueAt,
      windowStartLocal: row.windowStartLocal,
      windowEndLocal: row.windowEndLocal,
    },
    ownerState: row.state,
    attention: workAttention(row.state),
    label: row.label,
    href: row.sourceHref,
    compatibility: true,
  };
}

export function jobFlowItemsFromCompatibilityWork(
  rows: readonly WorkRequirement[],
): JobFlowItem[] {
  return rows.map(jobFlowItemFromCompatibilityWork);
}

function harborEvidenceAttention(
  category: EmployeeRuntimeEvidenceItem["category"],
): JobFlowItemAttention {
  switch (category) {
    case "needs_attention":
      return "needs_attention";
    case "due_now":
      return "due_now";
    case "upcoming":
      return "upcoming";
    case "completed":
      return "completed";
    default:
      return "informational";
  }
}

/** Harbor / canonical Records projection already on the flow. */
export function jobFlowItemFromHarborEvidence(row: EmployeeRuntimeEvidenceItem): JobFlowItem {
  return {
    ownerKind: "RECORD_REQUIREMENT",
    ownerId: `${row.attachmentId}:${row.requirementKey}`,
    place: {
      unitId: null,
      spaceId: row.spaceId,
      assetId: null,
    },
    time: {
      windowStartsAt: null,
      windowEndsAt: null,
      dueAt: null,
      windowStartLocal: row.window.start,
      windowEndLocal: row.window.end,
    },
    ownerState: row.productState,
    attention: harborEvidenceAttention(row.category),
    label: row.displayName,
    href: row.href,
    compatibility: false,
  };
}

export function jobFlowItemsFromHarborEvidence(
  rows: readonly EmployeeRuntimeEvidenceItem[],
): JobFlowItem[] {
  return rows.map(jobFlowItemFromHarborEvidence);
}

function templateEvidenceAttention(row: EvidenceRequirement): JobFlowItemAttention {
  if (row.state === "NOT_CONFIRMED" || row.state === "NEEDS_REVIEW" || row.state === "CONFLICT_REVIEW") {
    return "needs_attention";
  }
  if (row.state === "DUE" || row.state === "SAVED_ON_THIS_TABLET" || row.state === "SYNCHRONIZING") {
    return "due_now";
  }
  if (row.state === "UPCOMING") return "upcoming";
  if (row.state === "COMPLETED" || row.state === "COMPLETED_WITH_CORRECTIVE_ACTION") {
    return "completed";
  }
  if (row.state === "NOT_APPLICABLE" || row.state === "NOT_CONFIGURED") return "not_applicable";
  return "informational";
}

/** Legacy template evidence path (when canonical logs are off). */
export function jobFlowItemFromTemplateEvidence(row: EvidenceRequirement): JobFlowItem {
  return {
    ownerKind: "RECORD_REQUIREMENT",
    ownerId: row.requirementKey,
    place: {
      unitId: row.unitId,
      spaceId: row.spaceId,
      assetId: row.assetId ?? null,
    },
    time: {
      windowStartsAt: row.windowStartsAt,
      windowEndsAt: row.windowEndsAt,
      dueAt: row.windowEndsAt,
      windowStartLocal: row.windowStartLocal,
      windowEndLocal: row.windowEndLocal,
    },
    ownerState: row.state,
    attention: templateEvidenceAttention(row),
    label: row.templateName,
    href: null,
    compatibility: false,
  };
}

export function jobFlowItemsFromTemplateEvidence(
  rows: readonly EvidenceRequirement[],
): JobFlowItem[] {
  return rows.map(jobFlowItemFromTemplateEvidence);
}

/** Operating Rhythm Key Point / milestone already projected on RLS. */
export function jobFlowItemFromMilestone(row: EmployeeRuntimeMilestone): JobFlowItem {
  return {
    ownerKind: "OPERATING_RHYTHM_KEY_POINT",
    ownerId: `${row.spaceId}:${row.kind}:${row.statusKey}`,
    place: {
      unitId: null,
      spaceId: row.spaceId,
      assetId: null,
    },
    time: emptyTime(),
    ownerState: row.statusKey,
    attention: "informational",
    label: row.label,
    href: null,
    compatibility: false,
  };
}

export function jobFlowItemsFromMilestones(
  rows: readonly EmployeeRuntimeMilestone[],
): JobFlowItem[] {
  return rows.map(jobFlowItemFromMilestone);
}

/**
 * Plant Work Order / PM adapters — progressive empty until 2C-2B wires loaders.
 * Call sites may pass rows later without changing the contract.
 */
export function jobFlowItemsFromWorkOrders(
  _rows: readonly { id: string; label: string }[],
): JobFlowItem[] {
  void _rows;
  return [];
}

export function jobFlowItemsFromPreventiveMaintenance(
  _rows: readonly { id: string; label: string }[],
): JobFlowItem[] {
  void _rows;
  return [];
}

export function jobFlowItemsFromAssignmentExceptions(
  _rows: readonly { id: string; label: string }[],
): JobFlowItem[] {
  void _rows;
  return [];
}

/** Compose the transitional unified list from currently available flow slices. */
export function composeJobFlowItems(input: {
  compatibilityWork?: readonly WorkRequirement[];
  harborEvidence?: readonly EmployeeRuntimeEvidenceItem[];
  templateEvidence?: readonly EvidenceRequirement[];
  milestones?: readonly EmployeeRuntimeMilestone[];
}): JobFlowItem[] {
  return [
    ...jobFlowItemsFromCompatibilityWork(input.compatibilityWork ?? []),
    ...jobFlowItemsFromHarborEvidence(input.harborEvidence ?? []),
    ...jobFlowItemsFromTemplateEvidence(input.templateEvidence ?? []),
    ...jobFlowItemsFromMilestones(input.milestones ?? []),
    ...jobFlowItemsFromWorkOrders([]),
    ...jobFlowItemsFromPreventiveMaintenance([]),
    ...jobFlowItemsFromAssignmentExceptions([]),
  ];
}
