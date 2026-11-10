import type { Prisma, PrismaClient } from "@prisma/client";

import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import { getRoleDefinition, isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";
import { recordAssignmentEvent } from "@/lib/scheduling/operational-assignments/assignment-events";

import { decideOperationalStaffing } from "./eligibility";

type Db = PrismaClient | Prisma.TransactionClient;

/** Eligibility is explicit. Titles, Teams and platform authority never supply it. */
export async function requireAssignmentEligibility(db: Db, input: {
  facilityId: string; departmentId: string; employeeId: string; roleKey: string;
  canOverride: boolean; exceptionReason?: string | null;
}): Promise<string | null> {
  const [employee, department, qualification] = await Promise.all([
    db.employee.findFirst({ where: { id: input.employeeId, facilityId: input.facilityId, status: "ACTIVE" },
      select: { primaryDepartmentId: true, employeeDepartments: { select: { departmentId: true } } } }),
    db.department.findFirst({ where: { id: input.departmentId, facilityId: input.facilityId, isActive: true }, select: { key: true } }),
    db.employeeOperationalRoleQualification.findFirst({ where: { facilityId: input.facilityId,
      departmentId: input.departmentId, employeeId: input.employeeId, roleKey: input.roleKey, status: "ACTIVE" }, select: { id: true } }),
  ]);
  if (!employee || !department || !employeeBelongsToDepartment(employee, input.departmentId)) {
    throw new Error("Assignment requires an active employee in this Department and Facility.");
  }
  if (!getRoleDefinition(input.roleKey) || !isRoleValidForDepartment(input.roleKey, department.key)) {
    throw new Error("Choose an operational role from this Department's registry.");
  }
  const decision = decideOperationalStaffing({ qualified: Boolean(qualification),
    exceptionReason: input.exceptionReason, canOverride: input.canOverride });
  if (!decision.allow) throw new Error(decision.message);
  return decision.recordExceptionReason;
}

/** Every exception appends an authorization event; it never creates a qualification. */
export async function recordAssignmentEligibilityOverride(db: Db, input: {
  facilityId: string; departmentId: string; employeeId: string; roleKey: string;
  assignmentId: string; actorUserId: string | null; actorRole: string; authMethod?: string;
  reason: string | null;
}) {
  if (!input.reason) return;
  await recordAssignmentEvent({ client: db, assignmentId: input.assignmentId, facilityId: input.facilityId,
    departmentId: input.departmentId, employeeId: input.employeeId, actorUserId: input.actorUserId,
    actorRole: input.actorRole, authMethod: input.authMethod, eventType: "OVERRIDE",
    summary: `Operational eligibility exception: ${input.roleKey}`, reason: input.reason,
    newValuesJson: JSON.stringify({ roleKey: input.roleKey, eligibilityException: true }),
  });
}
