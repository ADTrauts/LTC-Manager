"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { EmployeeStatus } from "@prisma/client";

import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import { assertFacilityAdministratorAction } from "@/lib/facility-admin-guard";
import { requireFacilitySession } from "@/lib/facility-context";
import { canManageDepartmentHeadSettings } from "@/lib/dept-settings-access";
import { prisma } from "@/lib/prisma";

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateDepartmentRelatedViews(departmentId?: string) {
  revalidatePath("/admin/departments");
  if (departmentId) {
    revalidatePath(`/admin/departments/${departmentId}`);
  }
  revalidatePath("/department/settings");
  revalidatePath("/employees");
  revalidatePath("/employees", "layout");
}

const departmentHeadSchema = z.object({
  departmentId: z.string().cuid(),
  headEmployeeId: z.string().cuid().optional(),
});

export async function setDepartmentHeadAction(formData: FormData) {
  const session = await requireFacilitySession();

  const headRaw = toOptional(formData.get("headEmployeeId"));
  const parsed = departmentHeadSchema.parse({
    departmentId: formData.get("departmentId"),
    headEmployeeId: headRaw,
  });

  if (!(await canManageDepartmentHeadSettings(session, parsed.departmentId))) {
    throw new Error("Insufficient permissions.");
  }
  const department = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!department) {
    throw new Error("Department not found.");
  }

  if (parsed.headEmployeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: parsed.headEmployeeId, facilityId: session.facilityId },
      select: {
        id: true,
        status: true,
        primaryDepartmentId: true,
        employeeDepartments: { select: { departmentId: true } },
      },
    });
    if (!employee) {
      throw new Error("Employee not found.");
    }
    if (employee.status === EmployeeStatus.TERMINATED) {
      throw new Error("Cannot assign a terminated employee as department head.");
    }
    if (!employeeBelongsToDepartment(employee, parsed.departmentId)) {
      throw new Error("Department Manager must belong to this Department.");
    }
  }

  await prisma.department.update({
    where: { id: parsed.departmentId },
    data: { headEmployeeId: parsed.headEmployeeId ?? null },
  });

  revalidateDepartmentRelatedViews(parsed.departmentId);
}

const toggleShowSchema = z.object({
  departmentId: z.string().cuid(),
  showInEmployeeApp: z.enum(["on", "off"]),
});

export async function setDepartmentShowInEmployeeAppAction(formData: FormData) {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);

  const parsed = toggleShowSchema.parse({
    departmentId: formData.get("departmentId"),
    showInEmployeeApp: formData.get("showInEmployeeApp"),
  });
  const show = parsed.showInEmployeeApp === "on";

  const department = await prisma.department.findFirst({
    where: { id: parsed.departmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) {
    throw new Error("Department not found.");
  }

  if (!show) {
    const inUse = await prisma.employee.count({
      where: {
        facilityId: session.facilityId,
        OR: [
          { primaryDepartmentId: parsed.departmentId },
          { employeeDepartments: { some: { departmentId: parsed.departmentId } } },
        ],
      },
    });
    if (inUse > 0) {
      throw new Error(
        "Cannot hide this department while employees are assigned to it. Reassign primary department (and floater memberships) first.",
      );
    }
  }

  await prisma.department.update({
    where: { id: parsed.departmentId },
    data: {
      showInEmployeeApp: show,
    },
  });

  revalidateDepartmentRelatedViews(parsed.departmentId);
}
