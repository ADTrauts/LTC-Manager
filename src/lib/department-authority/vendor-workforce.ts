import type { Prisma, PrismaClient } from "@prisma/client";

import type { PartnerFacilitySession } from "@/lib/auth";
import { employeeBelongsToDepartmentWhere } from "@/lib/employee-membership/department";
import { isValidPinFormat, pinDigestForFacility } from "@/lib/pin";

import { resolveDepartmentAccess } from "./resolve";
import { operationPeriodWhere, operatorPeriodIdForCreate, withOperatorPeriod } from "./operator-period";
import { VendorHeadError } from "./vendor-heads";

type Db = PrismaClient | Prisma.TransactionClient;

/** The accepted vendor head may add a PIN workforce record. Anyone else is refused. */
export async function assertVendorHeadCreatesWorkforce(
  db: Db,
  session: PartnerFacilitySession,
  departmentId: string,
): Promise<void> {
  const access = await resolveDepartmentAccess(db, session, {
    facilityId: session.facilityId,
    departmentId,
  });
  if (!access || access.mode !== "MANAGE" || !access.isHead) {
    throw new VendorHeadError(
      "NOT_HEAD",
      "Only the head who accepted this Department can add its staff.",
    );
  }
}

/**
 * A PIN-only workforce record in the vendor's Department. No login account.
 * The person signs in with the PIN at the facility.
 */
export async function createVendorPinWorkforce(
  db: Db,
  input: {
    session: PartnerFacilitySession;
    departmentId: string;
    firstName: string;
    lastName: string;
    pin: string;
  },
): Promise<{ employeeId: string }> {
  await assertVendorHeadCreatesWorkforce(db, input.session, input.departmentId);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    throw new VendorHeadError("NOT_FOUND", "Enter a first and last name.");
  }
  if (!isValidPinFormat(input.pin)) {
    throw new VendorHeadError("NOT_FOUND", "Enter a 6-digit PIN.");
  }
  const department = await db.department.findFirst({
    where: { id: input.departmentId, facilityId: input.session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) throw new VendorHeadError("NOT_FOUND", "Department not found.");

  const created = await db.employee.create({
    data: {
      facilityId: input.session.facilityId,
      firstName,
      lastName,
      roleType: "STAFF",
      status: "ACTIVE",
      pinDigest: pinDigestForFacility(input.session.facilityId, input.pin),
      primaryDepartmentId: department.id,
      operatorPeriodId: await operatorPeriodIdForCreate(db, {
        facilityId: input.session.facilityId,
        departmentId: department.id,
      }),
    },
    select: { id: true },
  });
  return { employeeId: created.id };
}

export async function listVendorDepartmentPeople(
  db: Db,
  input: { facilityId: string; departmentId: string },
): Promise<Array<{ id: string; name: string; hasPin: boolean; hasAccount: boolean }>> {
  const rows = await db.employee.findMany({
    where: withOperatorPeriod(
      {
        facilityId: input.facilityId,
        status: { in: ["ACTIVE", "OFF"] },
        ...employeeBelongsToDepartmentWhere(input.departmentId),
      } satisfies Prisma.EmployeeWhereInput,
      await operationPeriodWhere(db, { facilityId: input.facilityId, departmentId: input.departmentId }),
    ),
    select: { id: true, firstName: true, lastName: true, pinDigest: true, userId: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: `${row.firstName} ${row.lastName}`,
    hasPin: Boolean(row.pinDigest),
    hasAccount: Boolean(row.userId),
  }));
}
