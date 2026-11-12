/**
 * One shared employee next-action resolver.
 * Prefers canonical JobFlowItem attention/ownerKind when items are present.
 * Priority is owner-derived attention — no invented score or overdue.
 */


import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";

import type { JobFlowItem } from "./job-flow-item";
import type {
  EmployeeRuntimeLocationNext,
  EmployeeRuntimeNextAction,
  EmployeeRuntimeNextKind,
} from "./types";

function none(): EmployeeRuntimeNextAction {
  return { kind: "none", label: "", spaceId: null, sourceId: "" };
}

/** Kinds that may become the employee's next required action. */
const ACTIONABLE_OWNER_KINDS = new Set([
  "RECORD_REQUIREMENT",
  "WORK_ORDER",
  "OPERATING_RHYTHM_KEY_POINT",
]);

function isActionableItem(item: JobFlowItem): boolean {
  if (!ACTIONABLE_OWNER_KINDS.has(item.ownerKind)) return false;
  if (item.attention === "completed" || item.attention === "not_applicable") return false;
  if (item.attention === "informational") return false;
  if (item.ownerKind === "OPERATING_RHYTHM_KEY_POINT") {
    // NONE/OPTIONAL tracking never surfaces as overdue; only owner due/attention bands.
    return (
      item.attention === "needs_attention" ||
      item.attention === "due_now" ||
      (item.attention === "upcoming" &&
        (item.ownerState === "not_recorded" || item.ownerState === "due" || item.ownerState === "adjusted"))
    );
  }
  return true;
}

function itemToNextKind(item: JobFlowItem, band: "overdue" | "due" | "upcoming"): EmployeeRuntimeNextKind {
  switch (item.ownerKind) {
    case "RECORD_REQUIREMENT":
      return band === "overdue"
        ? "overdue_evidence"
        : band === "due"
          ? "due_evidence"
          : "upcoming_evidence";
    case "WORK_ORDER":
      return band === "upcoming" ? "upcoming_work_order" : "due_work_order";
    case "OPERATING_RHYTHM_KEY_POINT":
      return "milestone";
    default:
      return "none";
  }
}

/**
 * Next sourceId stays compatible with presentation href lookup:
 * Records → requirementKey; Work Orders → repair id.
 */
function itemSourceId(item: JobFlowItem): string {
  if (item.ownerKind === "RECORD_REQUIREMENT") {
    const idx = item.ownerId.indexOf(":");
    return idx >= 0 ? item.ownerId.slice(idx + 1) : item.ownerId;
  }
  return item.ownerId;
}

function itemAction(item: JobFlowItem, band: "overdue" | "due" | "upcoming"): EmployeeRuntimeNextAction {
  return {
    kind: itemToNextKind(item, band),
    label: item.label,
    spaceId: item.place.spaceId,
    sourceId: itemSourceId(item),
  };
}

function pickItem(
  items: readonly JobFlowItem[],
  attentions: readonly JobFlowItem["attention"][],
): JobFlowItem | null {
  const matches = items.filter(
    (row) => isActionableItem(row) && attentions.includes(row.attention),
  );
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    const label = a.label.localeCompare(b.label);
    if (label !== 0) return label;
    const kind = a.ownerKind.localeCompare(b.ownerKind);
    if (kind !== 0) return kind;
    return a.ownerId.localeCompare(b.ownerId);
  })[0]!;
}

function resolveFromItems(input: {
  items: readonly JobFlowItem[];
  currentAssignment: JobFlowAssignmentSnapshot | null;
  upcomingAssignment: JobFlowAssignmentSnapshot | null;
  locationNext: EmployeeRuntimeLocationNext | null;
}): EmployeeRuntimeNextAction {
  const needsAttention = pickItem(input.items, ["needs_attention"]);
  if (needsAttention) {
    const band = needsAttention.ownerKind === "RECORD_REQUIREMENT" ? "overdue" : "due";
    return itemAction(needsAttention, band);
  }

  const dueNow = pickItem(input.items, ["due_now"]);
  if (dueNow) return itemAction(dueNow, "due");

  if (!input.currentAssignment && input.upcomingAssignment) {
    return {
      kind: "assignment_transition",
      label: `Next assignment: ${input.upcomingAssignment.roleLabel}`,
      spaceId: null,
      sourceId: input.upcomingAssignment.id,
    };
  }

  const upcoming = pickItem(input.items, ["upcoming"]);
  if (upcoming) return itemAction(upcoming, "upcoming");

  if (input.locationNext) {
    return {
      kind: "location_next",
      label: input.locationNext.label,
      spaceId: input.locationNext.spaceId,
      sourceId: input.locationNext.spaceId,
    };
  }

  return none();
}

export function resolveEmployeeNextAction(input: {
  items: readonly JobFlowItem[];
  currentAssignment: JobFlowAssignmentSnapshot | null;
  upcomingAssignment: JobFlowAssignmentSnapshot | null;
  locationNext: EmployeeRuntimeLocationNext | null;
}): EmployeeRuntimeNextAction {
  return resolveFromItems(input);
}
