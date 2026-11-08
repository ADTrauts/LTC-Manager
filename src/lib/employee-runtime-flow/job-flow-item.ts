/**
 * Phase 2C-2A/2B — canonical Job Flow item contract.
 *
 * Job Flow is a composition of owner-referenced facts. It does not persist
 * items, invent overdue state, or replace domain lifecycles. Compatibility Work
 * is an explicit transitional owner kind until later phases remove it.
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
 * Discriminator for COMPATIBILITY_WORK only.
 * Mirrors DepartmentWorkOccurrenceSourceKind — plan-derived vs one-off.
 * Null for non-compatibility owners.
 */
export type CompatibilityWorkSource = "WORK_PLAN" | "ONE_OFF";

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
  /**
   * Set only for COMPATIBILITY_WORK from WorkRequirement.sourceKind.
   * Enables a later plan-derived cutover without a new owner kind.
   */
  compatibilitySource: CompatibilityWorkSource | null;
};

/** Assigned Plant Repair row already scoped by the loader (fail-closed). */
export type JobFlowWorkOrderSource = {
  id: string;
  repairCode: string;
  title: string;
  status: string;
  dueAt: Date | null;
  unitId: string;
  spaceId: string | null;
  assetId: string | null;
  /** When set, this WO is the actionable owner for that PM occurrence. */
  pmOccurrenceId: string | null;
  workOrderKind: string;
};

export type JobFlowAssignmentExceptionSource = {
  id: string;
  kind: "CALL_OFF" | "ASSIGNMENT_REVISION";
  label: string;
  ownerState: string;
  unitId: string | null;
  href: string | null;
};

/** Pre-WO PM occurrence. Intentionally unused while WO is the execution owner. */
export type JobFlowPreventiveMaintenanceSource = {
  id: string;
  label: string;
  status: string;
  unitId: string | null;
  spaceId: string | null;
  assetId: string | null;
  /** When a WO already exists for this occurrence, omit the PM item. */
  activeWorkOrderId: string | null;
  dueAt: Date | null;
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

const ATTENTION_ORDER: Record<JobFlowItemAttention, number> = {
  needs_attention: 0,
  due_now: 1,
  upcoming: 2,
  informational: 3,
  completed: 4,
  not_applicable: 5,
};

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
  const compatibilitySource: CompatibilityWorkSource =
    row.sourceKind === "ONE_OFF" ? "ONE_OFF" : "WORK_PLAN";
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
    compatibilitySource,
  };
}

export function isPlanDerivedCompatibilityWork(item: JobFlowItem): boolean {
  return item.ownerKind === "COMPATIBILITY_WORK" && item.compatibilitySource === "WORK_PLAN";
}

export function isOneOffCompatibilityWork(item: JobFlowItem): boolean {
  return item.ownerKind === "COMPATIBILITY_WORK" && item.compatibilitySource === "ONE_OFF";
}

/**
 * Cutover helper for a later approved phase — NOT wired into compose in 2C-2E.
 * Removes plan-derived CompatWork while retaining one-off and all canonical owners.
 */
export function withoutPlanDerivedCompatibilityWork(
  items: readonly JobFlowItem[],
): JobFlowItem[] {
  return items.filter((row) => !isPlanDerivedCompatibilityWork(row));
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
    compatibilitySource: null,
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
    compatibilitySource: null,
  };
}

export function jobFlowItemsFromTemplateEvidence(
  rows: readonly EvidenceRequirement[],
): JobFlowItem[] {
  return rows.map(jobFlowItemFromTemplateEvidence);
}

function milestoneAttention(statusKey: string): JobFlowItemAttention {
  switch (statusKey) {
    case "overdue":
    case "completed_late":
      return "needs_attention";
    case "due":
    case "not_recorded":
      return "due_now";
    case "upcoming":
    case "adjusted":
      return "upcoming";
    case "completed_on_time":
      return "completed";
    default:
      return "informational";
  }
}

/**
 * Stable Key Point identity uses place + cycle + kind — not transient status.
 * Owner state / attention still reflect the domain statusKey.
 */
export function jobFlowItemFromMilestone(row: EmployeeRuntimeMilestone): JobFlowItem {
  const cycleKey = row.cycleStableKey?.trim() || "legacy";
  return {
    ownerKind: "OPERATING_RHYTHM_KEY_POINT",
    ownerId: `${row.spaceId}:${cycleKey}:${row.kind}`,
    place: {
      unitId: null,
      spaceId: row.spaceId,
      assetId: null,
    },
    time: {
      windowStartsAt: null,
      windowEndsAt: null,
      dueAt: null,
      windowStartLocal: row.expectedLocal ?? row.adjustedLocal ?? null,
      windowEndLocal: null,
    },
    ownerState: row.statusKey,
    attention: milestoneAttention(row.statusKey),
    label: row.label,
    href: row.href ?? null,
    compatibility: false,
    compatibilitySource: null,
  };
}

export function jobFlowItemsFromMilestones(
  rows: readonly EmployeeRuntimeMilestone[],
): JobFlowItem[] {
  return rows.map(jobFlowItemFromMilestone);
}

function workOrderAttention(status: string): JobFlowItemAttention {
  switch (status) {
    case "COMPLETED":
    case "CANCELLED":
      return "completed";
    case "WAITING_ON_VENDOR":
    case "ON_HOLD":
      return "informational";
    case "OPEN":
    case "ASSIGNED":
    case "IN_PROGRESS":
      return "due_now";
    default:
      return "informational";
  }
}

export function jobFlowItemFromWorkOrder(row: JobFlowWorkOrderSource): JobFlowItem {
  return {
    ownerKind: "WORK_ORDER",
    ownerId: row.id,
    place: {
      unitId: row.unitId,
      spaceId: row.spaceId,
      assetId: row.assetId,
    },
    time: {
      windowStartsAt: null,
      windowEndsAt: null,
      dueAt: row.dueAt,
      windowStartLocal: null,
      windowEndLocal: null,
    },
    ownerState: row.pmOccurrenceId
      ? `${row.status}:pm:${row.pmOccurrenceId}`
      : row.status,
    attention: workOrderAttention(row.status),
    label: row.title.trim() || row.repairCode,
    href: `/repairs/${row.id}`,
    compatibility: false,
    compatibilitySource: null,
  };
}

export function jobFlowItemsFromWorkOrders(
  rows: readonly JobFlowWorkOrderSource[],
): JobFlowItem[] {
  return rows.map(jobFlowItemFromWorkOrder);
}

/**
 * PM occurrence items only when no active Work Order owns execution.
 * Loaders currently pass [] — PM-generated WOs appear solely as WORK_ORDER.
 */
export function jobFlowItemFromPreventiveMaintenance(
  row: JobFlowPreventiveMaintenanceSource,
): JobFlowItem | null {
  if (row.activeWorkOrderId) return null;
  return {
    ownerKind: "PREVENTIVE_MAINTENANCE",
    ownerId: row.id,
    place: {
      unitId: row.unitId,
      spaceId: row.spaceId,
      assetId: row.assetId,
    },
    time: {
      windowStartsAt: null,
      windowEndsAt: null,
      dueAt: row.dueAt,
      windowStartLocal: null,
      windowEndLocal: null,
    },
    ownerState: row.status,
    attention: row.status === "COMPLETED" || row.status === "SKIPPED" ? "completed" : "due_now",
    label: row.label,
    href: `/preventive-maintenance/${row.id}`,
    compatibility: false,
    compatibilitySource: null,
  };
}

export function jobFlowItemsFromPreventiveMaintenance(
  rows: readonly JobFlowPreventiveMaintenanceSource[],
): JobFlowItem[] {
  const items: JobFlowItem[] = [];
  for (const row of rows) {
    const item = jobFlowItemFromPreventiveMaintenance(row);
    if (item) items.push(item);
  }
  return items;
}

export function jobFlowItemFromAssignmentException(
  row: JobFlowAssignmentExceptionSource,
): JobFlowItem {
  return {
    ownerKind: "ASSIGNMENT_EXCEPTION",
    ownerId: row.id,
    place: {
      unitId: row.unitId,
      spaceId: null,
      assetId: null,
    },
    time: emptyTime(),
    ownerState: row.ownerState,
    attention: row.kind === "CALL_OFF" ? "needs_attention" : "informational",
    label: row.label,
    href: row.href,
    compatibility: false,
    compatibilitySource: null,
  };
}

export function jobFlowItemsFromAssignmentExceptions(
  rows: readonly JobFlowAssignmentExceptionSource[],
): JobFlowItem[] {
  return rows.map(jobFlowItemFromAssignmentException);
}

/** Stable owner identity — first wins; later duplicates are dropped. */
export function dedupeJobFlowItems(items: readonly JobFlowItem[]): JobFlowItem[] {
  const seen = new Set<string>();
  const out: JobFlowItem[] = [];
  for (const item of items) {
    const key = `${item.ownerKind}:${item.ownerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Drop PREVENTIVE_MAINTENANCE rows whose occurrence already has a WORK_ORDER
 * in the same composition (pmOccurrenceId encoded in WO ownerState).
 */
export function suppressPmDuplicatesAgainstWorkOrders(
  items: readonly JobFlowItem[],
): JobFlowItem[] {
  const pmCoveredByWo = new Set<string>();
  for (const item of items) {
    if (item.ownerKind !== "WORK_ORDER") continue;
    const match = /^[^:]+:pm:(.+)$/.exec(item.ownerState);
    if (match?.[1]) pmCoveredByWo.add(match[1]);
  }
  if (pmCoveredByWo.size === 0) return [...items];
  return items.filter(
    (item) =>
      !(item.ownerKind === "PREVENTIVE_MAINTENANCE" && pmCoveredByWo.has(item.ownerId)),
  );
}

export function sortJobFlowItems(items: readonly JobFlowItem[]): JobFlowItem[] {
  return [...items].sort((a, b) => {
    const band = ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention];
    if (band !== 0) return band;
    const aDue = a.time.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = b.time.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    const kind = a.ownerKind.localeCompare(b.ownerKind);
    if (kind !== 0) return kind;
    return a.ownerId.localeCompare(b.ownerId);
  });
}

/** Compose the transitional unified list from currently available flow slices. */
export function composeJobFlowItems(input: {
  compatibilityWork?: readonly WorkRequirement[];
  harborEvidence?: readonly EmployeeRuntimeEvidenceItem[];
  templateEvidence?: readonly EvidenceRequirement[];
  milestones?: readonly EmployeeRuntimeMilestone[];
  workOrders?: readonly JobFlowWorkOrderSource[];
  preventiveMaintenance?: readonly JobFlowPreventiveMaintenanceSource[];
  assignmentExceptions?: readonly JobFlowAssignmentExceptionSource[];
}): JobFlowItem[] {
  const merged = [
    ...jobFlowItemsFromCompatibilityWork(input.compatibilityWork ?? []),
    ...jobFlowItemsFromHarborEvidence(input.harborEvidence ?? []),
    ...jobFlowItemsFromTemplateEvidence(input.templateEvidence ?? []),
    ...jobFlowItemsFromMilestones(input.milestones ?? []),
    ...jobFlowItemsFromWorkOrders(input.workOrders ?? []),
    ...jobFlowItemsFromPreventiveMaintenance(input.preventiveMaintenance ?? []),
    ...jobFlowItemsFromAssignmentExceptions(input.assignmentExceptions ?? []),
  ];
  return sortJobFlowItems(dedupeJobFlowItems(suppressPmDuplicatesAgainstWorkOrders(merged)));
}
