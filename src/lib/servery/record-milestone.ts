import {
  Prisma,
  type MealType,
  type PrismaClient,
  type RoleKey,
  type SessionAuthMethod,
} from "@prisma/client";

import type { AppRole } from "@/lib/access";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma as defaultPrisma } from "@/lib/prisma";

import {
  decideServeryMilestoneAuthority,
  type ServeryMilestone,
  type ServeryMilestoneAction,
  type ServeryMilestoneDenialReason,
} from "./milestone-authority";

/** Prisma unique-violation code. Raised when two commands race on the same idempotency key. */
const UNIQUE_VIOLATION = "P2002";

export type ServeryMilestoneActor = {
  /** Set for password sessions. */
  userId: string | null;
  /** Set for PIN sessions, and for password sessions with a matching Employee record. */
  employeeId: string | null;
  role: AppRole;
  authMethod: SessionAuthMethod;
};

export type RecordServeryMilestoneInput = {
  facilityId: string;
  unitId: string;
  mealType: MealType;
  milestone: ServeryMilestone;
  action: ServeryMilestoneAction;
  /** Idempotency key for this command. A replay with the same key returns the original result. */
  clientActionId: string;
  /**
   * When the milestone occurred. Omitted for an ordinary record, where the server uses `now` and
   * marks the entry as server-timed. Required for a correction.
   */
  occurredAt?: Date | null;
  /** Required for corrections. */
  reason?: string | null;
  actor: ServeryMilestoneActor;
  /** Unit this tablet is bound to, when unit-locked. */
  deviceBoundUnitId?: string | null;
  now?: Date;
};

export type RecordServeryMilestoneFailure =
  | ServeryMilestoneDenialReason
  | "UNIT_NOT_FOUND"
  | "MEAL_NOT_CONFIGURED"
  | "NOTHING_TO_CORRECT"
  | "ALREADY_RECORDED"
  | "OCCURRENCE_TIME_INVALID";

export type RecordServeryMilestoneResult =
  | {
      ok: true;
      eventId: string;
      milestone: ServeryMilestone;
      occurredAt: Date;
      recordedAt: Date;
      /** True when this exact command had already been accepted; no second effect was produced. */
      deduplicated: boolean;
    }
  | { ok: false; reason: RecordServeryMilestoneFailure };

/**
 * The single Dietary milestone write.
 *
 * Everything the authorization decision needs is looked up scoped to the session Facility, so a
 * client-supplied Unit, Department, or Employee identifier from another Facility resolves to
 * nothing and is reported as "not found" rather than "forbidden" — an out-of-scope object's
 * existence is not disclosed.
 */
export type ServeryMilestoneAccess =
  | { ok: false; reason: RecordServeryMilestoneFailure }
  | {
      ok: true;
      unitId: string;
      configuredMeals: MealType[];
      employeeId: string | null;
    };

/**
 * Resolve scope and evaluate authority for one actor against one Unit.
 *
 * Shared by the write path and by the Unit Workspace, so the buttons a user is offered and the
 * decision the server makes come from the same evaluation rather than two rules that can drift.
 */
export async function evaluateServeryMilestoneAccess(
  input: {
    facilityId: string;
    unitId: string;
    action: ServeryMilestoneAction;
    actor: ServeryMilestoneActor;
    deviceBoundUnitId?: string | null;
  },
  client: PrismaClient = defaultPrisma,
): Promise<ServeryMilestoneAccess> {
  const unit = await client.unit.findFirst({
    where: { id: input.unitId, facilityId: input.facilityId, isActive: true },
    select: {
      id: true,
      unitType: true,
      parentUnitId: true,
    },
  });
  if (!unit) {
    return { ok: false, reason: "UNIT_NOT_FOUND" };
  }

  const dietary = await client.department.findFirst({
    where: { facilityId: input.facilityId, key: "DIETARY", isActive: true },
    select: { id: true },
  });

  const relationships = await loadActorRelationships(client, {
    facilityId: input.facilityId,
    unitId: unit.id,
    dietaryDepartmentId: dietary?.id ?? null,
    actor: input.actor,
  });

  const decision = decideServeryMilestoneAuthority({
    action: input.action,
    role: input.actor.role,
    authMethod: input.actor.authMethod,
    unitInSessionFacility: true,
    unitRunsMealService: unit.unitType === "SERVERY",
    dietaryDepartmentActive: dietary != null,
    actorInDietaryDepartment: relationships.inDietaryDepartment,
    actorActive: relationships.active,
    actorHasUnitAuthority: relationships.hasUnitAuthority,
    deviceBoundUnitId: input.deviceBoundUnitId ?? null,
    targetUnitId: unit.id,
  });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason };
  }

  let configuredMeals: MealType[] = [];
  if (dietary) {
    const { configuredMealTypesFromTimings, materializeMealServiceDayExpectations } =
      await import("@/lib/operational-cycles/materialize-day-expectations");
    const { timingOwnerUnitIds } = await import(
      "@/lib/operational-cycles/plan-day-expectations"
    );
    const materialized = await materializeMealServiceDayExpectations(
      {
        facilityId: input.facilityId,
        departmentId: dietary.id,
      },
      client,
    );
    const fromExpectations = configuredMealTypesFromTimings(
      materialized.timings,
      timingOwnerUnitIds(unit),
    );
    if (fromExpectations.length > 0) {
      configuredMeals = fromExpectations as MealType[];
    }
  }

  return {
    ok: true,
    unitId: unit.id,
    configuredMeals,
    employeeId: relationships.employeeId,
  };
}

export async function recordServeryMilestone(
  input: RecordServeryMilestoneInput,
  client: PrismaClient = defaultPrisma,
): Promise<RecordServeryMilestoneResult> {
  const now = input.now ?? new Date();

  const access = await evaluateServeryMilestoneAccess(
    {
      facilityId: input.facilityId,
      unitId: input.unitId,
      action: input.action,
      actor: input.actor,
      deviceBoundUnitId: input.deviceBoundUnitId,
    },
    client,
  );
  if (!access.ok) {
    return { ok: false, reason: access.reason };
  }
  void access;
  return { ok: false, reason: "MEAL_NOT_CONFIGURED" };
}

async function loadActorRelationships(
  client: PrismaClient,
  input: {
    facilityId: string;
    unitId: string;
    dietaryDepartmentId: string | null;
    actor: ServeryMilestoneActor;
  },
): Promise<{
  employeeId: string | null;
  active: boolean;
  inDietaryDepartment: boolean;
  hasUnitAuthority: boolean;
}> {
  const employeeId = input.actor.employeeId;

  if (employeeId) {
    const employee = await client.employee.findFirst({
      where: { id: employeeId, facilityId: input.facilityId },
      select: {
        id: true,
        status: true,
        primaryUnitId: true,
        primaryDepartmentId: true,
        unitAccesses: { select: { unitId: true } },
        employeeDepartments: { select: { departmentId: true } },
        headedDepartments: { select: { id: true } },
      },
    });
    if (!employee) {
      return {
        employeeId: null,
        active: false,
        inDietaryDepartment: false,
        hasUnitAuthority: false,
      };
    }

    const departmentIds = new Set<string>([
      ...(employee.primaryDepartmentId ? [employee.primaryDepartmentId] : []),
      ...employee.employeeDepartments.map((row) => row.departmentId),
      ...employee.headedDepartments.map((row) => row.id),
    ]);

    // An empty access list means the employee is not restricted to particular units, which is how
    // the existing PIN flow already treats it.
    const hasUnitAuthority =
      employee.unitAccesses.length === 0 ||
      employee.unitAccesses.some((row) => row.unitId === input.unitId) ||
      employee.primaryUnitId === input.unitId;

    return {
      employeeId: employee.id,
      // `OFF` means off-shift, not deactivated. Someone covering an unscheduled shift must still be
      // able to record that their servery is ready; only a separated employee loses the authority.
      active: employee.status !== "TERMINATED",
      inDietaryDepartment:
        input.dietaryDepartmentId != null && departmentIds.has(input.dietaryDepartmentId),
      hasUnitAuthority,
    };
  }

  if (input.actor.userId) {
    const user = await client.user.findFirst({
      where: { id: input.actor.userId, facilityId: input.facilityId },
      select: { id: true, isActive: true, primaryDepartmentId: true },
    });
    if (!user) {
      return {
        employeeId: null,
        active: false,
        inDietaryDepartment: false,
        hasUnitAuthority: false,
      };
    }
    return {
      employeeId: null,
      active: user.isActive,
      inDietaryDepartment:
        input.dietaryDepartmentId != null &&
        user.primaryDepartmentId === input.dietaryDepartmentId,
      // A User-session actor holds no per-unit access rows; unit authority comes from their
      // Facility and Department scope, which the decision applies by role.
      hasUnitAuthority: false,
    };
  }

  return { employeeId: null, active: false, inDietaryDepartment: false, hasUnitAuthority: false };
}
