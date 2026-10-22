"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  DepartmentAccessError,
  DepartmentStaffManagerError,
  requireDepartmentManage,
  resolveDepartmentAccess,
  setDepartmentStaffManager,
} from "@/lib/department-authority";
import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

export type StaffManagerActionState = { ok: boolean; message: string | null };

const schema = z.object({
  departmentId: z.string().cuid(),
  employeeId: z.string().cuid(),
  allowed: z.enum(["on", "off"]),
});

export async function setDepartmentStaffManagerAction(
  _previous: StaffManagerActionState,
  formData: FormData,
): Promise<StaffManagerActionState> {
  const session = await requireFacilitySession();
  const parsed = schema.safeParse({
    departmentId: formData.get("departmentId"),
    employeeId: formData.get("employeeId"),
    allowed: formData.get("allowed"),
  });
  if (!parsed.success) return { ok: false, message: "Choose a manager." };
  const { departmentId, employeeId } = parsed.data;
  const allowed = parsed.data.allowed === "on";

  const access = (await isCustomerDepartmentAccessAllowed(prisma, session, departmentId))
    ? await resolveDepartmentAccess(prisma, session, { facilityId: session.facilityId, departmentId })
    : null;
  if (!access) return { ok: false, message: "Department not found." };
  try {
    requireDepartmentManage(access);
    if (!access.isHead) {
      return { ok: false, message: "Only the Department head chooses these managers." };
    }
    await setDepartmentStaffManager(prisma, {
      facilityId: session.facilityId,
      departmentId,
      employeeId,
      allowed,
      grantedByEmployeeId: await getOperationalEmployeeIdForSession(session),
    });
  } catch (error) {
    if (error instanceof DepartmentAccessError || error instanceof DepartmentStaffManagerError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  revalidatePath(`/department/settings/${departmentId}`);
  return { ok: true, message: allowed ? "Allowed to add staff and set roles." : "No longer allowed." };
}
