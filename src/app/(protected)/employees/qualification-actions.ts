"use server";

import { revalidatePath } from "next/cache";

import { requireAtLeastRole } from "@/lib/access";
import { requirePasswordSession } from "@/lib/credential-policy";
import { assertCanChangeDepartmentPeople } from "@/lib/department-authority/changes";
import { replaceEmployeeOperationalQualifications } from "@/lib/employee-operational-qualifications/replace";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

export async function setEmployeeOperationalQualificationsAction(formData: FormData) {
  const session = await requireFacilitySession();
  requirePasswordSession(session);
  requireAtLeastRole(session.role, "MANAGER");

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  if (!employeeId || !departmentId) throw new Error("Choose an employee and a department.");

  await assertCanChangeDepartmentPeople(prisma, session, departmentId);

  const roleKeys = formData
    .getAll("roleKey")
    .filter((value): value is string => typeof value === "string");

  await replaceEmployeeOperationalQualifications(prisma, {
    facilityId: session.facilityId,
    employeeId,
    departmentId,
    roleKeys,
  });

  revalidatePath("/employees");
}
