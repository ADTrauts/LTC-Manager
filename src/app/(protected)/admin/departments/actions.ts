"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { EmployeeStatus } from "@prisma/client";

import { assertFacilityAdministratorAction } from "@/lib/facility-admin-guard";
import { requireFacilitySession } from "@/lib/facility-context";
import { canManageDepartmentHeadSettings } from "@/lib/dept-settings-access";
import { prisma } from "@/lib/prisma";

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateDepartmentRelatedViews() {
  revalidatePath("/admin/departments");
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
    select: { id: true, showInEmployeeApp: true },
  });
  if (!department) {
    throw new Error("Department not found.");
  }
  if (!department.showInEmployeeApp) {
    throw new Error("Enable this department for the employee app before assigning a head.");
  }

  if (parsed.headEmployeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: parsed.headEmployeeId, facilityId: session.facilityId },
      select: {
        id: true,
        status: true,
        primaryDepartmentId: true,
        employeeDepartments: {
          where: { departmentId: parsed.departmentId },
          select: { id: true },
        },
      },
    });
    if (!employee) {
      throw new Error("Employee not found.");
    }
    if (employee.status === EmployeeStatus.TERMINATED) {
      throw new Error("Cannot assign a terminated employee as department head.");
    }

    const onRoster =
      employee.primaryDepartmentId === parsed.departmentId ||
      employee.employeeDepartments.length > 0;

    if (!onRoster) {
      if (!employee.primaryDepartmentId) {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { primaryDepartmentId: parsed.departmentId },
        });
      } else {
        await prisma.employeeDepartment.upsert({
          where: {
            employeeId_departmentId: {
              employeeId: employee.id,
              departmentId: parsed.departmentId,
            },
          },
          create: { employeeId: employee.id, departmentId: parsed.departmentId },
          update: {},
        });
      }
    }
  }

  await prisma.department.update({
    where: { id: parsed.departmentId },
    data: { headEmployeeId: parsed.headEmployeeId ?? null },
  });

  revalidateDepartmentRelatedViews();
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
      ...(show ? {} : { headEmployeeId: null }),
    },
  });

  revalidateDepartmentRelatedViews();
}
