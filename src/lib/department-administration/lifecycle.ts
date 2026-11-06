/**
 * Department Operational Profile lifecycle — pure transition rules.
 *
 * DRAFT → CERTIFIED → ACTIVE → RETIRED
 *
 * - DRAFT is the only editable state.
 * - DRAFT never activates directly.
 * - ACTIVE/CERTIFIED are immutable and never deleted.
 * - Activating a new version retires the previous ACTIVE in the same step.
 */

import type { OperationalProfileStatusKey } from "./profile-types";

const ALLOWED_TRANSITIONS: Record<
  OperationalProfileStatusKey,
  readonly OperationalProfileStatusKey[]
> = {
  DRAFT: ["CERTIFIED"],
  CERTIFIED: ["ACTIVE"],
  ACTIVE: ["RETIRED"],
  RETIRED: [],
};

export function canTransitionProfileStatus(
  from: OperationalProfileStatusKey,
  to: OperationalProfileStatusKey,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertProfileTransition(
  from: OperationalProfileStatusKey,
  to: OperationalProfileStatusKey,
): void {
  if (!canTransitionProfileStatus(from, to)) {
    throw new Error(`Invalid profile transition: ${from} → ${to}`);
  }
}

export function isProfileEditable(status: OperationalProfileStatusKey): boolean {
  return status === "DRAFT";
}

export function assertProfileEditable(
  status: OperationalProfileStatusKey,
): void {
  if (!isProfileEditable(status)) {
    throw new Error(
      `Profile is ${status} and immutable. Create a new DRAFT version to make changes.`,
    );
  }
}

export function isProfileDeletable(
  status: OperationalProfileStatusKey,
): boolean {
  // Certified/active/retired history is never destroyed.
  return status === "DRAFT";
}

/** Next draft version number given existing versions for the department. */
export function nextProfileVersion(existingVersions: readonly number[]): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

export type ActivationPlan = {
  activateId: string;
  /** Previous ACTIVE profile ids to retire in the same transaction. */
  retireIds: string[];
  errors: string[];
};

/**
 * Plan an activation for one facility department.
 * The target must be CERTIFIED; any current ACTIVE is retired transactionally.
 */
export function planProfileActivation(
  profiles: readonly {
    id: string;
    status: OperationalProfileStatusKey;
    facilityId: string;
    departmentId: string;
  }[],
  targetProfileId: string,
): ActivationPlan {
  const errors: string[] = [];
  const target = profiles.find((p) => p.id === targetProfileId);
  if (!target) {
    return { activateId: targetProfileId, retireIds: [], errors: ["Profile not found"] };
  }
  if (target.status !== "CERTIFIED") {
    errors.push(
      `Only CERTIFIED profiles may activate (profile is ${target.status})`,
    );
  }
  const retireIds = profiles
    .filter(
      (p) =>
        p.id !== target.id &&
        p.status === "ACTIVE" &&
        p.facilityId === target.facilityId &&
        p.departmentId === target.departmentId,
    )
    .map((p) => p.id);

  return { activateId: target.id, retireIds, errors };
}
