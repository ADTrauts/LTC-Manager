/**
 * N1B recipient resolution.
 *
 * A recipient reason names a responsibility. This module answers whether an
 * authorized User currently holds it. It reads facility and Department
 * authority. It does not write a notification, invent an on-call roster, or
 * treat a role title as supervisory responsibility. On-duty supervisor and
 * on-call responder come from Assignment resolvers. They are not the same fact.
 */

import {
  NotificationRecipientReason,
  type Prisma,
  type PrismaClient,
  type RoleKey,
} from "@prisma/client";

import { APP_ROLES, type AppRole } from "@/lib/access";
import type { FacilitySession, PartnerFacilitySession } from "@/lib/auth";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import {
  loadAcceptedVendorHeads,
  vendorHeadAcceptedForPeriod,
} from "@/lib/department-authority/vendor-heads";
import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";
import type { DepartmentAccessMode } from "@/lib/department-authority/access";
import { findOtherOpenFacilityAdministratorPeriod } from "@/lib/facility-access/administrator-seat";
import { userHasActiveFacilityAccess } from "@/lib/facility-access/assert-user-facility-access";
import { resolveCurrentInternalFacilityRole } from "@/lib/facility-access/internal-facility-role";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";

import { resolveOperationalResponseResponsibility } from "@/lib/scheduling/operational-assignments/resolve-operational-response";
import { resolveOnDutySupervisorResponsibility } from "@/lib/scheduling/operational-assignments/resolve-on-duty-supervisor";

import type { AttentionAudience } from "./policy-registry";

type Db = PrismaClient | Prisma.TransactionClient;

export const RECIPIENT_UNRESOLVED_CAUSE = {
  onDutyResponsibilityNotAvailable: "on_duty_responsibility_not_available",
  onDutyResponsibilityUncovered: "on_duty_responsibility_uncovered",
  onCallResponsibilityNotAvailable: "on_call_responsibility_not_available",
  onCallResponsibilityUncovered: "on_call_responsibility_uncovered",
  escalationPolicyNotPublished: "escalation_policy_not_published",
  assigneeNotProvided: "assignee_not_provided",
  assigneeNotInFacility: "assignee_not_in_facility",
  employeeNotLinked: "employee_not_linked",
  facilityAccessDenied: "facility_access_denied",
  departmentAccessDenied: "department_access_denied",
  departmentNotInFacility: "department_not_in_facility",
  departmentNotProvided: "department_not_provided",
  departmentHeadNotAssigned: "department_head_not_assigned",
  vendorHeadNotAccepted: "vendor_head_not_accepted",
  facilityAdministratorNotAFloorRecipient: "facility_administrator_not_a_floor_recipient",
  noFacilityAdministrator: "no_facility_administrator",
  assetNotProvided: "asset_not_provided",
  assetNotInFacility: "asset_not_in_facility",
  assetOwnerIsOrganization: "asset_owner_is_organization",
  workOrderNotProvided: "work_order_not_provided",
  workOrderNotInFacility: "work_order_not_in_facility",
  workOrderAssigneeNotAssigned: "work_order_assignee_not_assigned",
  workOrderDepartmentMismatch: "work_order_department_mismatch",
  syncActorNotProvided: "sync_actor_not_provided",
} as const;

export type RecipientUnresolvedCause =
  (typeof RECIPIENT_UNRESOLVED_CAUSE)[keyof typeof RECIPIENT_UNRESOLVED_CAUSE];

export type ResolvedRecipient = {
  userId: string;
  reason: NotificationRecipientReason;
  explanation: string;
};

export type NamedSourceRecipient = {
  userId: string;
  source: "sync_actor";
  explanation: string;
};

export type UnresolvedRecipient = {
  reason: NotificationRecipientReason | null;
  source: "reason" | "sync_actor";
  cause: RecipientUnresolvedCause;
};

export type RecipientResolution = {
  resolved: ResolvedRecipient[];
  namedUsers: NamedSourceRecipient[];
  unresolved: UnresolvedRecipient[];
};

export type RecipientResolutionInput = {
  facilityId: string;
  departmentId?: string | null;
  audience: AttentionAudience;
  reasons: readonly NotificationRecipientReason[];
  /** Authoritative Employee assignment. The resolver does not search for one. */
  assigneeEmployeeId?: string | null;
  repairId?: string | null;
  assetId?: string | null;
  /** User named by the sync receipt. Not a recipient reason. */
  syncActorUserId?: string | null;
  /**
   * Facts the Workforce resolver needs. Absent facts leave on-duty unresolved.
   * This module does not decide who is supervising.
   */
  onDuty?: {
    serviceDate: string;
    at: Date;
    unitId?: string | null;
    spaceId?: string | null;
  } | null;
  /**
   * The instant of the operational incident. Absent facts leave on-call unresolved.
   * This module does not decide who is on call.
   */
  onCall?: {
    at: Date;
    unitId?: string | null;
    spaceId?: string | null;
  } | null;
};

type DepartmentRow = {
  id: string;
  name: string;
  headEmployeeId: string | null;
};

const SYNC_ACTOR_EXPLANATION =
  "You received this because this synchronization conflict is yours to resolve.";

export async function resolveNotificationRecipients(
  db: Db,
  input: RecipientResolutionInput,
): Promise<RecipientResolution> {
  const reasons = uniqueReasons(input.reasons);
  const resolved: ResolvedRecipient[] = [];
  const unresolved: UnresolvedRecipient[] = [];
  const seen = new Set<string>();

  const department = input.departmentId
    ? await db.department.findFirst({
        where: { id: input.departmentId, facilityId: input.facilityId },
        select: { id: true, name: true, headEmployeeId: true },
      })
    : null;

  if (input.departmentId && !department) {
    for (const reason of reasons) {
      unresolved.push({ reason, source: "reason", cause: RECIPIENT_UNRESOLVED_CAUSE.departmentNotInFacility });
    }
    if (input.syncActorUserId != null) {
      unresolved.push({
        reason: null,
        source: "sync_actor",
        cause: RECIPIENT_UNRESOLVED_CAUSE.departmentNotInFacility,
      });
    }
    return { resolved, namedUsers: [], unresolved };
  }

  for (const reason of reasons) {
    if (reason === NotificationRecipientReason.ON_DUTY_SUPERVISOR) {
      await appendOnDutySupervisors(db, input, department, resolved, unresolved, seen);
      continue;
    }
    if (reason === NotificationRecipientReason.ON_CALL_RESPONDER) {
      await appendOnCallResponders(db, input, department, resolved, unresolved, seen);
      continue;
    }
    const outcome = await resolveReason(db, input, department, reason);
    if (outcome.ok) {
      const key = `${outcome.recipient.reason}:${outcome.recipient.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(outcome.recipient);
    } else {
      unresolved.push({ reason, source: "reason", cause: outcome.cause });
    }
  }

  const namedUsers: NamedSourceRecipient[] = [];
  if (input.syncActorUserId != null) {
    const named = await resolveSyncActor(db, input, input.syncActorUserId);
    if (named.ok) namedUsers.push(named.recipient);
    else unresolved.push({ reason: null, source: "sync_actor", cause: named.cause });
  }

  return { resolved, namedUsers, unresolved };
}

async function resolveReason(
  db: Db,
  input: RecipientResolutionInput,
  department: DepartmentRow | null,
  reason: NotificationRecipientReason,
): Promise<{ ok: true; recipient: ResolvedRecipient } | { ok: false; cause: RecipientUnresolvedCause }> {
  switch (reason) {
    case NotificationRecipientReason.ON_DUTY_SUPERVISOR:
      return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.onDutyResponsibilityNotAvailable };
    case NotificationRecipientReason.ON_CALL_RESPONDER:
      return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.onCallResponsibilityNotAvailable };
    case NotificationRecipientReason.ESCALATION_TARGET:
      return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.escalationPolicyNotPublished };
    case NotificationRecipientReason.ASSET_OWNER:
      return resolveAssetOwner(db, input);
    case NotificationRecipientReason.FACILITY_ADMIN:
      return resolveFacilityAdmin(db, input, department);
    case NotificationRecipientReason.DEPARTMENT_MANAGER:
      return resolveDepartmentManager(db, input, department);
    case NotificationRecipientReason.CURRENT_ASSIGNEE:
      return resolveAssignee(db, input, department, input.assigneeEmployeeId, "current");
    case NotificationRecipientReason.WORK_ORDER_ASSIGNEE:
      return resolveWorkOrderAssignee(db, input, department);
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

const ON_DUTY_EXPLANATION =
  "You received this because you are the on-duty supervisor responsible for this location.";

const ON_CALL_EXPLANATION =
  "You received this because you are assigned On-Call Coverage for this Department.";

async function appendOnDutySupervisors(
  db: Db,
  input: RecipientResolutionInput,
  department: DepartmentRow | null,
  resolved: ResolvedRecipient[],
  unresolved: UnresolvedRecipient[],
  seen: Set<string>,
): Promise<void> {
  if (!department || !input.onDuty?.serviceDate || !(input.onDuty.at instanceof Date)) {
    unresolved.push({
      reason: NotificationRecipientReason.ON_DUTY_SUPERVISOR,
      source: "reason",
      cause: RECIPIENT_UNRESOLVED_CAUSE.onDutyResponsibilityNotAvailable,
    });
    return;
  }
  const responsibility = await resolveOnDutySupervisorResponsibility(db, {
    facilityId: input.facilityId,
    departmentId: department.id,
    serviceDate: input.onDuty.serviceDate,
    at: input.onDuty.at,
    unitId: input.onDuty.unitId,
    spaceId: input.onDuty.spaceId,
  });
  if (responsibility.status !== "resolved") {
    unresolved.push({
      reason: NotificationRecipientReason.ON_DUTY_SUPERVISOR,
      source: "reason",
      cause:
        responsibility.status === "uncovered"
          ? RECIPIENT_UNRESOLVED_CAUSE.onDutyResponsibilityUncovered
          : RECIPIENT_UNRESOLVED_CAUSE.onDutyResponsibilityNotAvailable,
    });
    return;
  }

  let delivered = false;
  for (const assignment of responsibility.assignments) {
    const linked = await linkedEmployeeUser(db, input.facilityId, assignment.employeeId);
    if (!linked.ok) {
      unresolved.push({
        reason: NotificationRecipientReason.ON_DUTY_SUPERVISOR,
        source: "reason",
        cause: linked.cause,
      });
      continue;
    }
    const access = await authorizeInternalUser(db, {
      userId: linked.userId,
      facilityId: input.facilityId,
      department,
      audience: input.audience,
      reason: NotificationRecipientReason.ON_DUTY_SUPERVISOR,
    });
    if (!access.ok) {
      unresolved.push({
        reason: NotificationRecipientReason.ON_DUTY_SUPERVISOR,
        source: "reason",
        cause: access.cause,
      });
      continue;
    }
    const key = `${NotificationRecipientReason.ON_DUTY_SUPERVISOR}:${linked.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    delivered = true;
    resolved.push({
      userId: linked.userId,
      reason: NotificationRecipientReason.ON_DUTY_SUPERVISOR,
      explanation: ON_DUTY_EXPLANATION,
    });
  }
  if (!delivered && !unresolved.some((row) => row.reason === NotificationRecipientReason.ON_DUTY_SUPERVISOR)) {
    unresolved.push({
      reason: NotificationRecipientReason.ON_DUTY_SUPERVISOR,
      source: "reason",
      cause: RECIPIENT_UNRESOLVED_CAUSE.onDutyResponsibilityUncovered,
    });
  }
}

async function appendOnCallResponders(
  db: Db,
  input: RecipientResolutionInput,
  department: DepartmentRow | null,
  resolved: ResolvedRecipient[],
  unresolved: UnresolvedRecipient[],
  seen: Set<string>,
): Promise<void> {
  if (!department || !(input.onCall?.at instanceof Date)) {
    unresolved.push({
      reason: NotificationRecipientReason.ON_CALL_RESPONDER,
      source: "reason",
      cause: RECIPIENT_UNRESOLVED_CAUSE.onCallResponsibilityNotAvailable,
    });
    return;
  }
  const responsibility = await resolveOperationalResponseResponsibility(db, {
    facilityId: input.facilityId,
    departmentId: department.id,
    at: input.onCall.at,
    unitId: input.onCall.unitId,
    spaceId: input.onCall.spaceId,
  });
  if (responsibility.status !== "resolved") {
    unresolved.push({
      reason: NotificationRecipientReason.ON_CALL_RESPONDER,
      source: "reason",
      cause:
        responsibility.status === "uncovered"
          ? RECIPIENT_UNRESOLVED_CAUSE.onCallResponsibilityUncovered
          : RECIPIENT_UNRESOLVED_CAUSE.onCallResponsibilityNotAvailable,
    });
    return;
  }

  let delivered = false;
  for (const assignment of responsibility.assignments) {
    const linked = await linkedEmployeeUser(db, input.facilityId, assignment.employeeId);
    if (!linked.ok) {
      unresolved.push({
        reason: NotificationRecipientReason.ON_CALL_RESPONDER,
        source: "reason",
        cause: linked.cause,
      });
      continue;
    }
    const access = await authorizeInternalUser(db, {
      userId: linked.userId,
      facilityId: input.facilityId,
      department,
      audience: input.audience,
      reason: NotificationRecipientReason.ON_CALL_RESPONDER,
    });
    if (!access.ok) {
      unresolved.push({
        reason: NotificationRecipientReason.ON_CALL_RESPONDER,
        source: "reason",
        cause: access.cause,
      });
      continue;
    }
    const key = `${NotificationRecipientReason.ON_CALL_RESPONDER}:${linked.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    delivered = true;
    resolved.push({
      userId: linked.userId,
      reason: NotificationRecipientReason.ON_CALL_RESPONDER,
      explanation: ON_CALL_EXPLANATION,
    });
  }
  if (!delivered && !unresolved.some((row) => row.reason === NotificationRecipientReason.ON_CALL_RESPONDER)) {
    unresolved.push({
      reason: NotificationRecipientReason.ON_CALL_RESPONDER,
      source: "reason",
      cause: RECIPIENT_UNRESOLVED_CAUSE.onCallResponsibilityUncovered,
    });
  }
}

async function resolveFacilityAdmin(
  db: Db,
  input: RecipientResolutionInput,
  department: DepartmentRow | null,
): Promise<{ ok: true; recipient: ResolvedRecipient } | { ok: false; cause: RecipientUnresolvedCause }> {
  const seat = await findOtherOpenFacilityAdministratorPeriod(db, { facilityId: input.facilityId });
  if (!seat) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.noFacilityAdministrator };
  const access = await authorizeInternalUser(db, {
    userId: seat.userId,
    facilityId: input.facilityId,
    department,
    audience: input.audience,
    reason: NotificationRecipientReason.FACILITY_ADMIN,
  });
  if (!access.ok) return access;
  return {
    ok: true,
    recipient: {
      userId: seat.userId,
      reason: NotificationRecipientReason.FACILITY_ADMIN,
      explanation: "You received this because you are the Facility Administrator.",
    },
  };
}

async function resolveDepartmentManager(
  db: Db,
  input: RecipientResolutionInput,
  department: DepartmentRow | null,
): Promise<{ ok: true; recipient: ResolvedRecipient } | { ok: false; cause: RecipientUnresolvedCause }> {
  if (!department) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.departmentNotProvided };
  const explanation = `You received this because you are the Department Manager for ${department.name}.`;

  if (isContractedDepartmentAuthorityEnabled()) {
    const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
      facilityId: input.facilityId,
      departmentIds: [department.id],
    });
    const operator = operators.get(department.id);
    if (operator?.operatingModel === "CONTRACTED") {
      const acceptedHeads = await loadAcceptedVendorHeads(db, { departmentIds: [department.id] });
      const accepted = acceptedHeads.get(department.id);
      if (!accepted || !vendorHeadAcceptedForPeriod(accepted, operator.relationship.id)) {
        return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.vendorHeadNotAccepted };
      }
      const access = await authorizeVendorHead(db, {
        userId: accepted.assigneeUserId,
        facilityId: input.facilityId,
        department,
        partnerOrganizationId: operator.relationship.organizationId,
      });
      if (!access.ok) return access;
      return {
        ok: true,
        recipient: {
          userId: accepted.assigneeUserId,
          reason: NotificationRecipientReason.DEPARTMENT_MANAGER,
          explanation,
        },
      };
    }
  }

  if (!department.headEmployeeId) {
    return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.departmentHeadNotAssigned };
  }
  const linked = await linkedEmployeeUser(db, input.facilityId, department.headEmployeeId);
  if (!linked.ok) return linked;
  const access = await authorizeInternalUser(db, {
    userId: linked.userId,
    facilityId: input.facilityId,
    department,
    audience: input.audience,
    reason: NotificationRecipientReason.DEPARTMENT_MANAGER,
  });
  if (!access.ok) return access;
  return {
    ok: true,
    recipient: {
      userId: linked.userId,
      reason: NotificationRecipientReason.DEPARTMENT_MANAGER,
      explanation,
    },
  };
}

async function resolveAssignee(
  db: Db,
  input: RecipientResolutionInput,
  department: DepartmentRow | null,
  employeeId: string | null | undefined,
  kind: "current" | "work_order",
): Promise<{ ok: true; recipient: ResolvedRecipient } | { ok: false; cause: RecipientUnresolvedCause }> {
  if (!employeeId?.trim()) {
    return {
      ok: false,
      cause:
        kind === "work_order"
          ? RECIPIENT_UNRESOLVED_CAUSE.workOrderAssigneeNotAssigned
          : RECIPIENT_UNRESOLVED_CAUSE.assigneeNotProvided,
    };
  }
  const linked = await linkedEmployeeUser(db, input.facilityId, employeeId);
  if (!linked.ok) return linked;
  const reason =
    kind === "work_order"
      ? NotificationRecipientReason.WORK_ORDER_ASSIGNEE
      : NotificationRecipientReason.CURRENT_ASSIGNEE;
  const access = await authorizeInternalUser(db, {
    userId: linked.userId,
    facilityId: input.facilityId,
    department,
    audience: input.audience,
    reason,
  });
  if (!access.ok) return access;
  return {
    ok: true,
    recipient: {
      userId: linked.userId,
      reason,
      explanation:
        kind === "work_order"
          ? "You received this because this Work Order is assigned to you."
          : "You received this because this work is assigned to you.",
    },
  };
}

async function resolveWorkOrderAssignee(
  db: Db,
  input: RecipientResolutionInput,
  department: DepartmentRow | null,
): Promise<{ ok: true; recipient: ResolvedRecipient } | { ok: false; cause: RecipientUnresolvedCause }> {
  if (!input.repairId?.trim()) {
    return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.workOrderNotProvided };
  }
  const repair = await db.repair.findFirst({
    where: { id: input.repairId, unit: { facilityId: input.facilityId } },
    select: { assignedEmployeeId: true, responsibleDepartmentId: true },
  });
  if (!repair) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.workOrderNotInFacility };
  if (
    department &&
    repair.responsibleDepartmentId &&
    repair.responsibleDepartmentId !== department.id
  ) {
    return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.workOrderDepartmentMismatch };
  }
  let scope = department;
  if (!scope && repair.responsibleDepartmentId) {
    scope = await db.department.findFirst({
      where: { id: repair.responsibleDepartmentId, facilityId: input.facilityId },
      select: { id: true, name: true, headEmployeeId: true },
    });
    if (!scope) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.departmentNotInFacility };
  }
  const namedByEvent = input.assigneeEmployeeId?.trim() || null;
  return resolveAssignee(
    db,
    input,
    scope,
    namedByEvent ?? repair.assignedEmployeeId,
    "work_order",
  );
}

async function resolveAssetOwner(
  db: Db,
  input: RecipientResolutionInput,
): Promise<{ ok: true; recipient: ResolvedRecipient } | { ok: false; cause: RecipientUnresolvedCause }> {
  if (!input.assetId?.trim()) {
    return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.assetNotProvided };
  }
  const asset = await db.asset.findFirst({
    where: { id: input.assetId, unit: { facilityId: input.facilityId } },
    select: { id: true },
  });
  if (!asset) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.assetNotInFacility };
  // Maintainer and title are organizations. There is no deliverable User on the asset.
  return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.assetOwnerIsOrganization };
}

async function resolveSyncActor(
  db: Db,
  input: RecipientResolutionInput,
  userId: string,
): Promise<{ ok: true; recipient: NamedSourceRecipient } | { ok: false; cause: RecipientUnresolvedCause }> {
  if (!userId.trim()) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.syncActorNotProvided };
  const department = input.departmentId
    ? await db.department.findFirst({
        where: { id: input.departmentId, facilityId: input.facilityId },
        select: { id: true, name: true, headEmployeeId: true },
      })
    : null;
  const access = await authorizeInternalUser(db, {
    userId: userId.trim(),
    facilityId: input.facilityId,
    department,
    audience: input.audience,
    reason: NotificationRecipientReason.CURRENT_ASSIGNEE,
  });
  if (!access.ok) return access;
  return {
    ok: true,
    recipient: {
      userId: userId.trim(),
      source: "sync_actor",
      explanation: SYNC_ACTOR_EXPLANATION,
    },
  };
}

async function linkedEmployeeUser(
  db: Db,
  facilityId: string,
  employeeId: string,
): Promise<{ ok: true; userId: string } | { ok: false; cause: RecipientUnresolvedCause }> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId, facilityId },
    select: { userId: true },
  });
  if (!employee) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.assigneeNotInFacility };
  if (!employee.userId) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.employeeNotLinked };
  return { ok: true, userId: employee.userId };
}

async function authorizeInternalUser(
  db: Db,
  input: {
    userId: string;
    facilityId: string;
    department: DepartmentRow | null;
    audience: AttentionAudience;
    reason: NotificationRecipientReason;
  },
): Promise<{ ok: true } | { ok: false; cause: RecipientUnresolvedCause }> {
  const [role, facilityAccess, user] = await Promise.all([
    resolveCurrentInternalFacilityRole(db, { userId: input.userId, facilityId: input.facilityId }),
    userHasActiveFacilityAccess(db, input.userId, input.facilityId),
    db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, displayName: true, email: true, isActive: true },
    }),
  ]);
  if (!role || !facilityAccess || !user?.isActive) {
    return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.facilityAccessDenied };
  }
  const appRole = asAppRole(role.roleKey);
  if (!appRole) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.facilityAccessDenied };
  if (!input.department) return { ok: true };

  const access = await resolveDepartmentAccess(db, internalSession(user, appRole, input.facilityId), {
    facilityId: input.facilityId,
    departmentId: input.department.id,
  });
  const cause = departmentCause(input.reason, input.audience, access?.mode ?? null);
  if (cause) return { ok: false, cause };
  return { ok: true };
}

async function authorizeVendorHead(
  db: Db,
  input: {
    userId: string;
    facilityId: string;
    department: DepartmentRow;
    partnerOrganizationId: string;
  },
): Promise<{ ok: true } | { ok: false; cause: RecipientUnresolvedCause }> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, displayName: true, email: true, isActive: true },
  });
  if (!user?.isActive) return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.facilityAccessDenied };
  const access = await resolveDepartmentAccess(
    db,
    partnerSession(user, input.facilityId, input.partnerOrganizationId),
    { facilityId: input.facilityId, departmentId: input.department.id },
  );
  if (access?.mode !== "MANAGE") {
    return { ok: false, cause: RECIPIENT_UNRESOLVED_CAUSE.departmentAccessDenied };
  }
  return { ok: true };
}

function departmentCause(
  reason: NotificationRecipientReason,
  audience: AttentionAudience,
  mode: DepartmentAccessMode | null,
): RecipientUnresolvedCause | null {
  if (mode === "MANAGE" || mode === "VIEW") return null;
  if (mode === "SUMMARY" && audience === "governance") return null;
  if (
    mode === "SUMMARY" &&
    audience === "floor" &&
    reason === NotificationRecipientReason.FACILITY_ADMIN
  ) {
    return RECIPIENT_UNRESOLVED_CAUSE.facilityAdministratorNotAFloorRecipient;
  }
  return RECIPIENT_UNRESOLVED_CAUSE.departmentAccessDenied;
}

function internalSession(
  user: { id: string; displayName: string; email: string },
  role: AppRole,
  facilityId: string,
): FacilitySession {
  return {
    uid: user.id,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role,
    facilityId,
    name: user.displayName,
    email: user.email,
    sessionVersion: 1,
  };
}

function partnerSession(
  user: { id: string; displayName: string; email: string },
  facilityId: string,
  partnerOrganizationId: string,
): PartnerFacilitySession {
  return {
    uid: user.id,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    accessKind: "partner",
    facilityId,
    partnerOrganizationId,
    facilityPartnerOrganizationId: "n1b-operator-context",
    name: user.displayName,
    email: user.email,
    sessionVersion: 1,
  };
}

function asAppRole(roleKey: RoleKey): AppRole | null {
  return (APP_ROLES as readonly string[]).includes(roleKey) ? (roleKey as AppRole) : null;
}

function uniqueReasons(reasons: readonly NotificationRecipientReason[]): NotificationRecipientReason[] {
  const seen = new Set<NotificationRecipientReason>();
  const unique: NotificationRecipientReason[] = [];
  for (const reason of reasons) {
    if (seen.has(reason)) continue;
    seen.add(reason);
    unique.push(reason);
  }
  return unique;
}
