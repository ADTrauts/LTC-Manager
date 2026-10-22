import type { DepartmentVendorHeadAssignmentStatus, Prisma, PrismaClient } from "@prisma/client";

import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";
import { organizationDisplayLabel } from "@/lib/department-operators/types";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { ensureVendorPartnerAccess } from "@/lib/department-authority/vendor-entry";
import {
  assertOrganizationAdmin,
  getOrganizationMembers,
  getUserOrganizationMembership,
} from "@/lib/organization-membership";

type Db = PrismaClient | Prisma.TransactionClient;

export class VendorHeadError extends Error {
  readonly code:
    | "NOT_ENABLED"
    | "NOT_ORGANIZATION_ADMIN"
    | "NOT_VENDOR_DEPARTMENT"
    | "NOT_MEMBER"
    | "NOT_ASSIGNEE"
    | "NOT_PENDING"
    | "PERIOD_ENDED"
    | "NOT_HEAD"
    | "NOT_FOUND";

  constructor(code: VendorHeadError["code"], message: string) {
    super(message);
    this.name = "VendorHeadError";
    this.code = code;
  }
}

export type VendorHeadAssignmentView = {
  id: string;
  departmentId: string;
  operatorRelationshipId: string;
  assigneeUserId: string;
  assigneeName: string;
  assigneeEmail: string;
  status: Extract<DepartmentVendorHeadAssignmentStatus, "PENDING" | "ACCEPTED">;
};

export type VendorOperatedDepartment = {
  departmentId: string;
  departmentName: string;
  facilityId: string;
  facilityName: string;
  operatorPeriodId: string;
  operatorName: string;
  assignment: VendorHeadAssignmentView | null;
};

const OPEN_STATUSES = ["PENDING", "ACCEPTED"] as const;

function assertEnabled(): void {
  if (!isContractedDepartmentAuthorityEnabled()) {
    throw new VendorHeadError("NOT_ENABLED", "Vendor head assignment is not in effect.");
  }
}

async function lockDepartment(db: Db, departmentId: string): Promise<void> {
  const client = db as PrismaClient;
  if (typeof client.$queryRaw !== "function") {
    throw new VendorHeadError("NOT_FOUND", "Department lock is unavailable.");
  }
  await client.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
}

async function runInTransaction<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return (db as PrismaClient).$transaction(fn);
  return fn(db as Prisma.TransactionClient);
}

async function currentVendorPeriod(
  db: Db,
  input: { departmentId: string; organizationId: string; now?: Date },
) {
  const department = await db.department.findFirst({
    where: { id: input.departmentId, isActive: true },
    select: {
      id: true,
      facilityId: true,
      facility: { select: { id: true, organizationId: true, timezone: true, displayName: true } },
    },
  });
  if (!department) {
    throw new VendorHeadError("NOT_FOUND", "Department not found.");
  }
  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: department.facilityId,
    departmentIds: [department.id],
    now: input.now,
  });
  const current = operators.get(department.id);
  if (
    !current ||
    current.operatingModel !== "CONTRACTED" ||
    current.relationship.organizationId !== input.organizationId
  ) {
    throw new VendorHeadError(
      "NOT_VENDOR_DEPARTMENT",
      "This organization does not run that Department.",
    );
  }
  return { department, current };
}

async function assertAssignee(
  db: Db,
  input: { organizationId: string; assigneeUserId: string; now?: Date },
): Promise<void> {
  const user = await db.user.findFirst({
    where: { id: input.assigneeUserId, isActive: true },
    select: { id: true },
  });
  const membership = await getUserOrganizationMembership(db, {
    userId: input.assigneeUserId,
    organizationId: input.organizationId,
    now: input.now,
  });
  if (!user || !membership?.currentRole) {
    throw new VendorHeadError("NOT_MEMBER", "Choose a current member of this organization.");
  }
}

/** Departments this organization runs today, with the open head assignment if there is one. */
export async function listVendorOperatedDepartments(
  db: Db,
  input: { organizationId: string; now?: Date },
): Promise<VendorOperatedDepartment[]> {
  const now = input.now ?? new Date();
  const facilities = await db.facility.findMany({
    where: {
      departments: {
        some: { operatorRelationships: { some: { organizationId: input.organizationId } } },
      },
    },
    select: { id: true, displayName: true, timezone: true, organizationId: true },
  });
  const rows: VendorOperatedDepartment[] = [];
  for (const facility of facilities) {
    const departments = await db.department.findMany({
      where: { facilityId: facility.id, isActive: true },
      select: { id: true, name: true },
    });
    const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
      facilityId: facility.id,
      departmentIds: departments.map((department) => department.id),
      now,
    });
    const names = new Map(departments.map((department) => [department.id, department.name]));
    const periodIds: string[] = [];
    for (const [departmentId, current] of operators) {
      if (current.operatingModel !== "CONTRACTED") continue;
      if (current.relationship.organizationId !== input.organizationId) continue;
      periodIds.push(current.relationship.id);
      rows.push({
        departmentId,
        departmentName: names.get(departmentId) ?? "Department",
        facilityId: facility.id,
        facilityName: facility.displayName,
        operatorPeriodId: current.relationship.id,
        operatorName: organizationDisplayLabel(current.relationship.organization),
        assignment: null,
      });
    }
    if (periodIds.length === 0) continue;
    const assignments = await db.departmentVendorHeadAssignment.findMany({
      where: { operatorRelationshipId: { in: periodIds }, status: { in: [...OPEN_STATUSES] } },
      select: {
        id: true,
        departmentId: true,
        operatorRelationshipId: true,
        assigneeUserId: true,
        status: true,
        assigneeUser: { select: { displayName: true, email: true } },
      },
    });
    for (const row of rows) {
      const assignment = assignments.find((item) => item.departmentId === row.departmentId);
      if (!assignment || assignment.status === "DECLINED" || assignment.status === "REPLACED") continue;
      row.assignment = {
        id: assignment.id,
        departmentId: assignment.departmentId,
        operatorRelationshipId: assignment.operatorRelationshipId,
        assigneeUserId: assignment.assigneeUserId,
        assigneeName: assignment.assigneeUser.displayName,
        assigneeEmail: assignment.assigneeUser.email,
        status: assignment.status,
      };
    }
  }
  return rows.sort(
    (left, right) =>
      left.facilityName.localeCompare(right.facilityName) ||
      left.departmentName.localeCompare(right.departmentName),
  );
}

export async function assignVendorHead(
  db: Db,
  input: {
    actorUserId: string;
    organizationId: string;
    departmentId: string;
    assigneeUserId: string;
    now?: Date;
  },
): Promise<VendorHeadAssignmentView> {
  assertEnabled();
  const now = input.now ?? new Date();
  return runInTransaction(db, async (tx) => {
    await lockDepartment(tx, input.departmentId);
    try {
      await assertOrganizationAdmin(tx, {
        userId: input.actorUserId,
        organizationId: input.organizationId,
        now,
      });
    } catch {
      throw new VendorHeadError(
        "NOT_ORGANIZATION_ADMIN",
        "Only a current organization administrator can name the head.",
      );
    }
    const { current } = await currentVendorPeriod(tx, input);
    await assertAssignee(tx, input);
    await tx.departmentVendorHeadAssignment.updateMany({
      where: { departmentId: input.departmentId, status: { in: [...OPEN_STATUSES] } },
      data: { status: "REPLACED", endedAt: now },
    });
    const created = await tx.departmentVendorHeadAssignment.create({
      data: {
        departmentId: input.departmentId,
        operatorRelationshipId: current.relationship.id,
        assigneeUserId: input.assigneeUserId,
        assignedByUserId: input.actorUserId,
        status: "PENDING",
      },
      select: {
        id: true,
        departmentId: true,
        operatorRelationshipId: true,
        assigneeUserId: true,
        status: true,
        assigneeUser: { select: { displayName: true, email: true } },
      },
    });
    return {
      id: created.id,
      departmentId: created.departmentId,
      operatorRelationshipId: created.operatorRelationshipId,
      assigneeUserId: created.assigneeUserId,
      assigneeName: created.assigneeUser.displayName,
      assigneeEmail: created.assigneeUser.email,
      status: "PENDING",
    };
  });
}

async function answerAssignment(
  db: Db,
  input: { actorUserId: string; assignmentId: string; accept: boolean; now?: Date },
): Promise<void> {
  assertEnabled();
  const now = input.now ?? new Date();
  await runInTransaction(db, async (tx) => {
    const assignment = await tx.departmentVendorHeadAssignment.findUnique({
      where: { id: input.assignmentId },
      select: {
        id: true,
        departmentId: true,
        operatorRelationshipId: true,
        assigneeUserId: true,
        status: true,
        operatorRelationship: { select: { organizationId: true } },
      },
    });
    if (!assignment) throw new VendorHeadError("NOT_FOUND", "That assignment was not found.");
    await lockDepartment(tx, assignment.departmentId);
    if (assignment.assigneeUserId !== input.actorUserId) {
      throw new VendorHeadError("NOT_ASSIGNEE", "Only the named person can answer this assignment.");
    }
    if (assignment.status !== "PENDING") {
      throw new VendorHeadError("NOT_PENDING", "This assignment is no longer waiting for an answer.");
    }
    const { current } = await currentVendorPeriod(tx, {
      departmentId: assignment.departmentId,
      organizationId: assignment.operatorRelationship.organizationId,
      now,
    });
    if (current.relationship.id !== assignment.operatorRelationshipId) {
      throw new VendorHeadError("PERIOD_ENDED", "This assignment belongs to an operator period that has ended.");
    }
    await tx.departmentVendorHeadAssignment.update({
      where: { id: assignment.id },
      data: input.accept
        ? { status: "ACCEPTED", acceptedAt: now }
        : { status: "DECLINED", declinedAt: now },
    });
  });
}

export async function acceptVendorHead(
  db: Db,
  input: { actorUserId: string; assignmentId: string; now?: Date },
): Promise<{ opened: boolean; reason: string | null }> {
  const pending = await db.departmentVendorHeadAssignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      departmentId: true,
      assigneeUserId: true,
      assignedByUserId: true,
      status: true,
      department: { select: { facilityId: true } },
      operatorRelationship: { select: { organizationId: true } },
    },
  });
  const entry =
    pending?.status === "PENDING"
      ? await ensureVendorPartnerAccess(db, {
          facilityId: pending.department.facilityId,
          organizationId: pending.operatorRelationship.organizationId,
          departmentId: pending.departmentId,
          userId: pending.assigneeUserId,
          partnerRole: "PARTNER_MANAGER",
          actorOrgAdminUserId: pending.assignedByUserId,
        })
      : { opened: false, reason: null };
  await answerAssignment(db, { ...input, accept: true });
  return entry;
}

export async function declineVendorHead(
  db: Db,
  input: { actorUserId: string; assignmentId: string; now?: Date },
): Promise<void> {
  await answerAssignment(db, { ...input, accept: false });
}

export async function listAssignableVendorMembers(
  db: Db,
  organizationId: string,
): Promise<Array<{ userId: string; displayName: string; email: string }>> {
  const members = await getOrganizationMembers(db, { organizationId });
  const active = await db.user.findMany({
    where: { id: { in: members.map((member) => member.user.id) }, isActive: true },
    select: { id: true },
  });
  const activeIds = new Set(active.map((user) => user.id));
  return members
    .filter((member) => activeIds.has(member.user.id))
    .map((member) => ({
      userId: member.user.id,
      displayName: member.user.displayName,
      email: member.user.email,
    }));
}

/** Accepted head for the operator period in force. Empty while enforcement is off. */
export async function loadAcceptedVendorHeads(
  db: Db,
  input: { departmentIds: readonly string[] },
): Promise<Map<string, { operatorRelationshipId: string; assigneeUserId: string }>> {
  const map = new Map<string, { operatorRelationshipId: string; assigneeUserId: string }>();
  if (!isContractedDepartmentAuthorityEnabled() || input.departmentIds.length === 0) return map;
  const rows = await db.departmentVendorHeadAssignment.findMany({
    where: { departmentId: { in: [...input.departmentIds] }, status: "ACCEPTED" },
    select: { departmentId: true, operatorRelationshipId: true, assigneeUserId: true },
  });
  for (const row of rows) {
    map.set(row.departmentId, {
      operatorRelationshipId: row.operatorRelationshipId,
      assigneeUserId: row.assigneeUserId,
    });
  }
  return map;
}

export function vendorHeadAcceptedForPeriod(
  accepted: { operatorRelationshipId: string; assigneeUserId: string } | undefined,
  operatorPeriodId: string | null,
): boolean {
  return Boolean(accepted && operatorPeriodId && accepted.operatorRelationshipId === operatorPeriodId);
}

export function vendorAccountIsHead(input: {
  sessionKind: "internal" | "vendor" | "harbor";
  sessionUserId: string;
  vendorHeadAccepted: boolean;
  assigneeUserId: string | null;
}): boolean {
  return (
    input.sessionKind === "vendor" &&
    input.vendorHeadAccepted &&
    input.assigneeUserId === input.sessionUserId
  );
}
