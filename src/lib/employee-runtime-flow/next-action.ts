/**
 * One shared employee next-action resolver.
 * Priority is today's Assignment, due Records, and Operating Rhythm.
 */

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";

import type {
  EmployeeRuntimeEvidenceItem,
  EmployeeRuntimeLocationNext,
  EmployeeRuntimeMilestone,
  EmployeeRuntimeNextAction,
} from "./types";

function none(): EmployeeRuntimeNextAction {
  return { kind: "none", label: "", spaceId: null, sourceId: "" };
}

function pickEvidence(
  evidence: readonly EmployeeRuntimeEvidenceItem[],
  categories: readonly EmployeeRuntimeEvidenceItem["category"][],
): EmployeeRuntimeEvidenceItem | null {
  const matches = evidence.filter((row) => categories.includes(row.category));
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    const label = a.displayName.localeCompare(b.displayName);
    if (label !== 0) return label;
    return a.requirementKey.localeCompare(b.requirementKey);
  })[0]!;
}

function evidenceAction(
  kind: EmployeeRuntimeNextAction["kind"],
  row: EmployeeRuntimeEvidenceItem,
): EmployeeRuntimeNextAction {
  return {
    kind,
    label: row.displayName,
    spaceId: row.spaceId,
    sourceId: row.requirementKey,
  };
}

function isRecordableMilestone(row: EmployeeRuntimeMilestone): boolean {
  return (
    row.statusKey === "not_recorded" &&
    (row.kind === "SERVERY_READY" || row.kind === "MEAL_SERVICE_STARTED" || row.kind === "KEY_TIME")
  );
}

export function resolveEmployeeNextAction(input: {
  evidence: readonly EmployeeRuntimeEvidenceItem[];
  milestones: readonly EmployeeRuntimeMilestone[];
  currentAssignment: JobFlowAssignmentSnapshot | null;
  upcomingAssignment: JobFlowAssignmentSnapshot | null;
  locationNext: EmployeeRuntimeLocationNext | null;
}): EmployeeRuntimeNextAction {
  const overdueEvidence = pickEvidence(input.evidence, ["needs_attention"]);
  if (overdueEvidence && overdueEvidence.productState === "OVERDUE") {
    return evidenceAction("overdue_evidence", overdueEvidence);
  }

  const dueEvidence = pickEvidence(input.evidence, ["due_now"]);
  if (dueEvidence) return evidenceAction("due_evidence", dueEvidence);

  if (overdueEvidence) return evidenceAction("overdue_evidence", overdueEvidence);

  const milestone = input.milestones.find(isRecordableMilestone);
  if (milestone) {
    return {
      kind: "milestone",
      label: milestone.label,
      spaceId: milestone.spaceId,
      sourceId: `${milestone.spaceId}:${milestone.kind}`,
    };
  }

  if (!input.currentAssignment && input.upcomingAssignment) {
    return {
      kind: "assignment_transition",
      label: `Next assignment: ${input.upcomingAssignment.roleLabel}`,
      spaceId: null,
      sourceId: input.upcomingAssignment.id,
    };
  }

  const upcomingEvidence = pickEvidence(input.evidence, ["upcoming"]);
  if (upcomingEvidence) return evidenceAction("upcoming_evidence", upcomingEvidence);

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
