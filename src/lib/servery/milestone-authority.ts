import { hasAtLeastRole, type AppRole } from "@/lib/access";

/**
 * The two Dietary service milestones. The canonical product names are "Servery Ready" and
 * "Meal Service Started"; these keys are their stable identifiers.
 */
export const SERVERY_MILESTONES = ["READY", "SERVICE_STARTED"] as const;
export type ServeryMilestone = (typeof SERVERY_MILESTONES)[number];

export type ServeryMilestoneAction = "RECORD" | "CORRECT";

/**
 * Everything the decision is allowed to consider. Assembled by the caller from scoped database
 * lookups — never from client-supplied identifiers.
 */
export type ServeryMilestoneAuthorityInput = {
  action: ServeryMilestoneAction;
  role: AppRole;
  /** PIN sessions carry no more authority than the employee's own role and relationships. */
  authMethod: "PASSWORD" | "QUICK_PIN";
  /** True when the resolved Unit belongs to the session Facility. */
  unitInSessionFacility: boolean;
  /** True when the target Unit runs the Dietary meal-service workflow. */
  unitRunsMealService: boolean;
  /** True when the applicable Dietary Department is active and belongs to the Facility. */
  dietaryDepartmentActive: boolean;
  /**
   * True when the actor holds the applicable Dietary Department relationship: primary department,
   * an `EmployeeDepartment` row, or department headship.
   */
  actorInDietaryDepartment: boolean;
  /** True when the actor's Employee record is active, or the actor is a User-session role. */
  actorActive: boolean;
  /**
   * True when the actor is authorized for this specific Unit: an `EmployeeUnitAccess` row, their
   * primary unit, an active Assignment, or an empty access list (meaning "any unit").
   */
  actorHasUnitAuthority: boolean;
  /**
   * The Unit this shared tablet is bound to, when the device is unit-locked. A locked tablet may
   * only record for its own Unit.
   */
  deviceBoundUnitId: string | null;
  targetUnitId: string;
};

export type ServeryMilestoneAuthorityDecision =
  | { allowed: true }
  | { allowed: false; reason: ServeryMilestoneDenialReason };

export type ServeryMilestoneDenialReason =
  | "UNSUPPORTED_ROLE"
  | "UNIT_OUT_OF_SCOPE"
  | "UNIT_NOT_MEAL_SERVICE"
  | "DEPARTMENT_UNAVAILABLE"
  | "DEPARTMENT_RELATIONSHIP_REQUIRED"
  | "ACTOR_INACTIVE"
  | "UNIT_AUTHORITY_REQUIRED"
  | "DEVICE_UNIT_CONFLICT"
  | "CORRECTION_ROLE_REQUIRED"
  | "CORRECTION_REASON_REQUIRED";

/**
 * Frontline roles record milestones from within their own Unit context. Correction is a separate,
 * higher authority so an original record cannot be quietly rewritten by whoever is standing at the
 * tablet.
 */
const CORRECTION_MINIMUM_ROLE: AppRole = "SUPERVISOR";

/**
 * Roles that may act operationally at all. Every supported platform role appears here; the
 * distinctions between them are made by the scope checks below rather than by role alone.
 */
function isSupportedOperationalRole(role: AppRole): boolean {
  return (
    role === "STAFF" ||
    role === "LEAD_TEAM_MEMBER" ||
    role === "SUPERVISOR" ||
    role === "MANAGER" ||
    role === "GM" ||
    role === "FACILITY_ADMINISTRATOR"
  );
}

/**
 * Roles whose Facility-and-Department authority stands in for per-Unit authorization.
 *
 * A Supervisor covering a floor is not enumerated in `EmployeeUnitAccess` for every servery they
 * oversee, so requiring a Unit row would block the very people expected to correct records. Below
 * this tier, Unit authority is required: a frontline Employee records for the Unit they are working.
 */
function unitAuthorityIsImpliedByScope(role: AppRole): boolean {
  return hasAtLeastRole(role, "SUPERVISOR");
}

/**
 * The single authorization decision for recording or correcting a Dietary service milestone.
 *
 * Pure and synchronous: the caller performs the scoped lookups and passes facts. That keeps the
 * policy testable against every role without a database and keeps the rules in one place instead of
 * spread across the action, the component, and the readers.
 *
 * Facility Administrator is deliberately not a bypass. Administrative authority over user accounts
 * is not operational authority over a servery line, so a Facility Administrator must hold the same
 * Dietary Department relationship as anyone else to record a milestone.
 */
export function decideServeryMilestoneAuthority(
  input: ServeryMilestoneAuthorityInput,
): ServeryMilestoneAuthorityDecision {
  if (!isSupportedOperationalRole(input.role)) {
    return { allowed: false, reason: "UNSUPPORTED_ROLE" };
  }

  if (!input.unitInSessionFacility) {
    return { allowed: false, reason: "UNIT_OUT_OF_SCOPE" };
  }

  if (!input.unitRunsMealService) {
    return { allowed: false, reason: "UNIT_NOT_MEAL_SERVICE" };
  }

  if (!input.actorActive) {
    return { allowed: false, reason: "ACTOR_INACTIVE" };
  }

  if (!input.dietaryDepartmentActive) {
    return { allowed: false, reason: "DEPARTMENT_UNAVAILABLE" };
  }

  if (!input.actorInDietaryDepartment) {
    return { allowed: false, reason: "DEPARTMENT_RELATIONSHIP_REQUIRED" };
  }

  // A unit-locked shared tablet may only record for the Unit it is bound to, whatever the actor's
  // wider authority. This prevents a tablet on one servery line from recording another line's
  // milestone by identifier substitution.
  if (input.deviceBoundUnitId && input.deviceBoundUnitId !== input.targetUnitId) {
    return { allowed: false, reason: "DEVICE_UNIT_CONFLICT" };
  }

  if (!input.actorHasUnitAuthority && !unitAuthorityIsImpliedByScope(input.role)) {
    return { allowed: false, reason: "UNIT_AUTHORITY_REQUIRED" };
  }

  if (input.action === "CORRECT" && !hasAtLeastRole(input.role, CORRECTION_MINIMUM_ROLE)) {
    return { allowed: false, reason: "CORRECTION_ROLE_REQUIRED" };
  }

  return { allowed: true };
}

/** Whether a role could ever correct a milestone, before any scope is considered. */
export function roleMayCorrectMilestones(role: AppRole): boolean {
  return hasAtLeastRole(role, CORRECTION_MINIMUM_ROLE);
}

/** Operator-facing denial copy. Neutral and factual; never attributes a delay to another department. */
export function describeMilestoneDenial(reason: ServeryMilestoneDenialReason): string {
  switch (reason) {
    case "UNSUPPORTED_ROLE":
      return "This role cannot record meal service milestones.";
    case "UNIT_OUT_OF_SCOPE":
      return "This location was not found.";
    case "UNIT_NOT_MEAL_SERVICE":
      return "This location does not use meal service milestones.";
    case "DEPARTMENT_UNAVAILABLE":
      return "Dietary is not set up for this location.";
    case "DEPARTMENT_RELATIONSHIP_REQUIRED":
      return "Recording meal service requires a Dietary department assignment.";
    case "ACTOR_INACTIVE":
      return "This employee record is not active.";
    case "UNIT_AUTHORITY_REQUIRED":
      return "You are not assigned to this servery.";
    case "DEVICE_UNIT_CONFLICT":
      return "This tablet is set up for a different servery.";
    case "CORRECTION_ROLE_REQUIRED":
      return "Correcting a recorded time requires a supervisor or above.";
    case "CORRECTION_REASON_REQUIRED":
      return "A correction needs a reason.";
  }
}
