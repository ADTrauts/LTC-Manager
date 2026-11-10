import type { OperationalAssignmentStatus, Prisma, PrismaClient } from "@prisma/client";

import { sessionUserIdForFk, type FacilitySession } from "@/lib/auth";
import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import { requireAssignmentEligibility, recordAssignmentEligibilityOverride } from "@/lib/employee-operational-qualifications/assignment-eligibility";
import { processNotificationOutboxAfterCommit } from "@/lib/notifications/live-publishers";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { validateSessionAuthority } from "@/lib/session-revocation";
import { hasAtLeastRole } from "@/lib/access";
import { resolveAssignmentAuthority } from "./assignment-authority";
import { writeAssignmentChangeAttention } from "./assignment-change";
import { lockEmployeeAssignmentDay, assertNoOverlappingActiveAssignments } from "./enforce-overlap";
import { requireAssignmentLocationScope, resolveAssignmentLocationWrites } from "./location-scope";
import { loadCoverageSlotSnapshot } from "../coverage-episodes/observe";

type Db = PrismaClient | Prisma.TransactionClient;
export type AssignmentLifecycleAction = "activate" | "complete" | "cancel" | "reopen";
export type AssignmentLifecycleInput = {
  session: FacilitySession;
  assignmentId: string;
  action: AssignmentLifecycleAction;
  reason?: string | null;
  /** A form or issued offline intent may only act on the exact Assignment revision. */
  expectedUpdatedAt?: string;
  /** Replacement must stay in the authorized Department and service day. */
  departmentId?: string;
  serviceDateKey?: string;
  now?: Date;
  /** Only a surrounding replacement transaction may observe the final Coverage delta. */
  deferCoverageObservation?: boolean;
};

/** One Assignment status/event/attention owner for supervisors, employees and replay. */
export async function transitionAssignment(db: Db, input: AssignmentLifecycleInput) {
  if (input.deferCoverageObservation && "$transaction" in db) throw new Error("Replacement needs a shared transaction.");
  const apply = async (tx: Prisma.TransactionClient) => {
    const { session, action } = input;
    if (session.scopeKind !== "facility") throw new Error("A current Facility session is required.");
    const reference = await tx.operationalAssignment.findFirst({ where: { id: input.assignmentId,
      facilityId: session.facilityId }, select: { employeeId: true, serviceDate: true } });
    if (!reference) throw new Error("Assignment not found.");
    await lockEmployeeAssignmentDay(tx, reference.employeeId, toServiceDateKey(reference.serviceDate));
    await tx.$queryRaw`SELECT "id" FROM "OperationalAssignment" WHERE "id"=${input.assignmentId} AND "facilityId"=${session.facilityId} FOR UPDATE`;
    const assignment = await tx.operationalAssignment.findFirstOrThrow({ where: { id: input.assignmentId,
      facilityId: session.facilityId }, include: { plan: true, facility: { select: { timezone: true } }, locations: true } });
    if ((input.departmentId && assignment.departmentId !== input.departmentId) ||
      (input.serviceDateKey && toServiceDateKey(assignment.serviceDate) !== input.serviceDateKey)) {
      throw new Error("Replacement must belong to this Department and service date.");
    }
    if (!(await validateSessionAuthority(session, tx)).valid) throw new Error("Authority changed. Authenticate online.");
    const authority = await resolveAssignmentAuthority({ db: tx, session, facilityId: session.facilityId, departmentId: assignment.departmentId });
    const actor = await tx.employee.findFirst({ where: { facilityId: session.facilityId, status: "ACTIVE",
      ...(session.authKind === "employee" ? { id: session.uid } : { userId: session.uid }) },
      select: { id: true, primaryDepartmentId: true, employeeDepartments: { select: { departmentId: true } } } });
    const frontline = session.authKind === "employee" || !hasAtLeastRole(session.role, "SUPERVISOR");
    const owns = frontline && authority.canViewOwn && actor?.id === assignment.employeeId && employeeBelongsToDepartment(actor, assignment.departmentId);
    const mayManage = action === "reopen" ? authority.canReopen : authority.canManage;
    if (!mayManage && !(action === "complete" && owns)) throw new Error("Assignment lifecycle authority is required.");
    if (session.authKind !== "user" && session.authKind !== "employee" || session.accessKind) throw new Error("Operational employee authority is required.");
    if (!mayManage && action === "complete" && !input.expectedUpdatedAt) throw new Error("Reload your current Assignment before completing it.");
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== assignment.updatedAt.toISOString()) throw new Error("Assignment changed. Reload and review before continuing.");
    if (assignment.plan?.status === "CLOSED") throw new Error("Reopen the closed Assignment plan first.");
    if (assignment.plan && (assignment.plan.facilityId !== assignment.facilityId || assignment.plan.departmentId !== assignment.departmentId ||
      toServiceDateKey(assignment.plan.serviceDate) !== toServiceDateKey(assignment.serviceDate))) throw new Error("Assignment plan does not match its Department and service date.");
    const rule: Record<AssignmentLifecycleAction, { from: OperationalAssignmentStatus[]; to: OperationalAssignmentStatus; event: "ACTIVATED" | "COMPLETED" | "CANCELLED" | "REOPENED" }> = {
      activate: { from: ["PLANNED"], to: "ACTIVE", event: "ACTIVATED" },
      complete: { from: ["PLANNED", "ACTIVE"], to: "COMPLETED", event: "COMPLETED" },
      cancel: { from: ["PLANNED", "ACTIVE"], to: "CANCELLED", event: "CANCELLED" },
      reopen: { from: ["COMPLETED"], to: "ACTIVE", event: "REOPENED" },
    };
    const transition = rule[action];
    if (!transition.from.includes(assignment.status)) throw new Error(`Cannot ${action} an Assignment with status ${assignment.status}.`);
    const reason = input.reason?.trim() || null;
    if (action === "reopen" && !reason) throw new Error("A reason is required to reopen an Assignment.");
    const now = input.now ?? new Date();
    if (action === "complete") {
      if (!assignment.plan || !["CONFIRMED", "REOPENED"].includes(assignment.plan.status)) throw new Error("Only a confirmed Assignment may be completed.");
      if (!mayManage && (toServiceDateKey(assignment.serviceDate) !== toServiceDateKey(getFacilityServiceDate(assignment.facility.timezone, now)) ||
        assignment.startsAt && assignment.startsAt > now || assignment.endsAt && assignment.endsAt <= now)) {
        throw new Error("Complete your current Assignment within its responsibility window.");
      }
    }
    const locations = action === "cancel" ? assignment.locations : await resolveAssignmentLocationWrites(tx, { facilityId: session.facilityId,
      departmentId: assignment.departmentId, unitId: assignment.unitId, unitSpaceIds: assignment.locations.map(row => row.unitSpaceId) });
    if (action !== "cancel") await requireAssignmentLocationScope(tx, { facilityId: session.facilityId, departmentId: assignment.departmentId,
      unitId: assignment.unitId, spaceIds: locations.map(row => row.unitSpaceId) });
    if (session.authKind === "employee" && (!session.activeUnitId || (locations.length
      ? locations.some(row => row.unitId !== session.activeUnitId) : assignment.unitId !== session.activeUnitId))) {
      throw new Error("This Assignment is outside the PIN device's current Neighborhood.");
    }
    if (action === "reopen" || action === "activate") {
      const eligibilityReason = await requireAssignmentEligibility(tx, { facilityId: session.facilityId,
        departmentId: assignment.departmentId, employeeId: assignment.employeeId, roleKey: assignment.roleKey,
        canOverride: authority.canOverride, exceptionReason: reason });
      await assertNoOverlappingActiveAssignments(tx, { facilityId: session.facilityId, employeeId: assignment.employeeId,
        serviceDate: assignment.serviceDate, startsAt: assignment.startsAt, endsAt: assignment.endsAt, excludeAssignmentId: assignment.id });
      await recordAssignmentEligibilityOverride(tx, { facilityId: session.facilityId, departmentId: assignment.departmentId,
        employeeId: assignment.employeeId, roleKey: assignment.roleKey, assignmentId: assignment.id,
        actorUserId: sessionUserIdForFk(session), actorRole: session.role, authMethod: session.authMethod, reason: eligibilityReason });
    }
    const coverageBefore = input.deferCoverageObservation ? null : await loadCoverageSlotSnapshot(tx, { facilityId: session.facilityId,
      departmentId: assignment.departmentId, serviceDateKey: toServiceDateKey(assignment.serviceDate) });
    await tx.operationalAssignment.update({ where: { id: assignment.id }, data: { status: transition.to,
      lastChangedByUserId: sessionUserIdForFk(session), lastChangedAt: now, changeReason: reason } });
    const attention = await writeAssignmentChangeAttention(tx, { facilityId: session.facilityId,
      departmentId: assignment.departmentId, assignmentId: assignment.id, employeeId: assignment.employeeId,
      serviceDate: assignment.serviceDate, subjectLabel: assignment.roleLabel, unitId: assignment.unitId,
      spaceId: locations.length === 1 ? locations[0].unitSpaceId : null, coverageBefore,
      event: { assignmentId: assignment.id, planId: assignment.planId, facilityId: session.facilityId,
        departmentId: assignment.departmentId, employeeId: assignment.employeeId, unitId: assignment.unitId,
        serviceDate: assignment.serviceDate, eventType: transition.event, actorUserId: sessionUserIdForFk(session),
        actorRole: session.role, authMethod: session.authMethod, fromStatus: assignment.status, toStatus: transition.to,
        summary: `Assignment ${transition.event.toLowerCase()}`, reason,
        newValuesJson: JSON.stringify({ completedByEmployeeId: action === "complete" ? actor?.id ?? null : null }) } });
    return { assignmentId: assignment.id, status: transition.to,
      outboxIds: [attention.assignmentOutboxId, ...attention.coverageOutboxIds] };
  };
  if ("$transaction" in db) {
    const result = await db.$transaction(apply);
    for (const id of result.outboxIds) await processNotificationOutboxAfterCommit(id);
    return result;
  }
  return apply(db);
}
