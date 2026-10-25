/**
 * Scoped Record-engine authority.
 *
 * Environment master gate (CANONICAL_LOGS_ENABLED)
 *   + RecordEngineRollout rows for facilityId + departmentId
 *   + facility service date
 *   → LEGACY or CANONICAL
 *
 * The environment flag is a deployment capability switch. It does not mean every
 * department is canonical, and turning it off does not rewrite stored rollout rows.
 * While it is off, the effective engine is LEGACY.
 *
 * A service date uses the latest rollout whose effectiveFromServiceDate is on or
 * before that date. Earlier rows stay, so cutover, rollback, and reactivation
 * remain readable.
 *
 * Canonical scope fences legacy Record writers for that department and date.
 * It does not write LogSubmission, OperationalTemplate evidence, or
 * InspectionSubmission as a fallback. When the flag is on, a Department with
 * no rollout row uses the forward engine, including Plant.
 */

export type RecordEngineMode = "LEGACY" | "CANONICAL";

export type RecordEngineRollout = {
  facilityId: string;
  departmentId: string;
  mode: RecordEngineMode;
  effectiveFromServiceDate: string;
};

const SERVICE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A Department with no rollout row uses the forward engine, including Plant (LEG-02). */
export function defaultRecordEngineForMissingRollout(_departmentKey: string | null | undefined): RecordEngineMode {
  return "CANONICAL";
}

export function resolveRecordEngine(input: {
  capabilityEnabled: boolean;
  facilityId: string;
  departmentId: string;
  departmentKey?: string | null;
  serviceDate: string;
  rollouts: readonly RecordEngineRollout[];
}): RecordEngineMode {
  if (!input.capabilityEnabled) return "LEGACY";
  if (!SERVICE_DATE.test(input.serviceDate)) return "LEGACY";
  const applicable = input.rollouts
    .filter(
      (row) =>
        row.facilityId === input.facilityId &&
        row.departmentId === input.departmentId &&
        SERVICE_DATE.test(row.effectiveFromServiceDate) &&
        row.effectiveFromServiceDate <= input.serviceDate,
    )
    .sort((a, b) => (a.effectiveFromServiceDate < b.effectiveFromServiceDate ? -1 : 1));
  if (applicable.length > 0) return applicable.at(-1)!.mode;
  const scheduledLater = input.rollouts.some(
    (row) => row.facilityId === input.facilityId && row.departmentId === input.departmentId,
  );
  if (scheduledLater) return "LEGACY";
  return defaultRecordEngineForMissingRollout(input.departmentKey);
}

export type CutoverReadiness = {
  status: "READY" | "BLOCKED";
  blockers: string[];
  warnings: string[];
};

export const PILOT_ACCEPTANCE_WORKFLOWS = [
  "cooler",
  "checklist",
  "inspection",
  "repeating",
] as const;

export type PilotAcceptanceWorkflow = (typeof PILOT_ACCEPTANCE_WORKFLOWS)[number];

const PILOT_WORKFLOW_LABEL: Record<PilotAcceptanceWorkflow, string> = {
  cooler: "Cooler Temperature Log",
  checklist: "an operational checklist",
  inspection: "kitchen sanitation audit",
  repeating: "sanitizer reading log",
};

export function evaluateCanonicalCutoverReadiness(input: {
  capabilityEnabled: boolean;
  departmentExists: boolean;
  effectiveFromServiceDate: string;
  todayKey: string;
  activeAttachmentCount: number;
  attachmentSetupErrorCount: number;
}): CutoverReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!input.capabilityEnabled) {
    blockers.push("This deployment is not capable of canonical Records.");
  }
  if (!input.departmentExists) blockers.push("The department could not be resolved.");
  if (!SERVICE_DATE.test(input.effectiveFromServiceDate) || !SERVICE_DATE.test(input.todayKey)) {
    blockers.push("The effective service date is not valid.");
  } else if (input.effectiveFromServiceDate < input.todayKey) {
    blockers.push("Canonical Records start on a service date that is still ahead, not a date already closed.");
  } else if (input.effectiveFromServiceDate === input.todayKey) {
    warnings.push("This service date is already open. Prefer the next service date so the day is not split.");
  }
  if (input.attachmentSetupErrorCount > 0) {
    blockers.push("An active Log has a setup error.");
  }
  if (input.activeAttachmentCount === 0) {
    warnings.push("No Logs are placed yet. Due work will be empty until a manager places one.");
  }
  warnings.push("Repeating readings submit online. A lost connection does not save those rows.");
  return { status: blockers.length > 0 ? "BLOCKED" : "READY", blockers, warnings };
}

/** Engine-ready means the department can switch. Pilot-ready means the acceptance Logs are placed. */
export function evaluatePilotAcceptanceReadiness(input: {
  engine: CutoverReadiness;
  rolloutConfigured: boolean;
  placed: Partial<Record<PilotAcceptanceWorkflow, boolean>>;
  staffAccess: boolean;
}): {
  pilotStatus: "PILOT_READY" | "NOT_PILOT_READY";
  blockers: string[];
  warnings: string[];
} {
  const blockers = [...input.engine.blockers];
  if (!input.rolloutConfigured) {
    blockers.push("Canonical Records are not saved for this department and service date.");
  }
  for (const workflow of PILOT_ACCEPTANCE_WORKFLOWS) {
    if (!input.placed[workflow]) blockers.push(`Place a ${PILOT_WORKFLOW_LABEL[workflow]}.`);
  }
  if (!input.staffAccess) blockers.push("A frontline staff account is not available for this department.");
  return {
    pilotStatus: blockers.length === 0 ? "PILOT_READY" : "NOT_PILOT_READY",
    blockers,
    warnings: input.engine.warnings,
  };
}

export function pilotServiceDayCounts(input: {
  expected: number;
  completed: number;
  exceptions: number;
  overdue: number;
  missed: number;
  waived: number;
  rechecks: number;
  legacyWrites: number;
}) {
  return {
    ...input,
    completionRate: input.expected === 0 ? null : Math.round((input.completed / input.expected) * 1000) / 10,
  };
}
