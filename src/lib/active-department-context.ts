import type { AppJwtPayload } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import type { NextRequest } from "next/server";

export type ActiveDepartmentNavResolution = {
  showAllDepartmentNav: boolean;
  activeDepartmentId: string | null;
  activeOperationalDepartmentKey: OperationalDepartmentKey | null;
};

function isOperationalKey(k: string): k is OperationalDepartmentKey {
  return k === "DIETARY" || k === "EVS" || k === "PLANT";
}

async function userMaySelectDepartment(
  session: AppJwtPayload,
  departmentId: string,
  facilityId: string,
  isFacilityAdmin: boolean,
): Promise<boolean> {
  const dept = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true, showInEmployeeApp: true },
    select: { id: true },
  });
  if (!dept) return false;
  if (isFacilityAdmin) return true;
  const empId = await getOperationalEmployeeIdForSession(session);
  if (!empId) return false;
  const employee = await prisma.employee.findFirst({
    where: { id: empId, facilityId },
    select: {
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!employee) return false;
  if (employee.primaryDepartmentId === departmentId) return true;
  return employee.employeeDepartments.some((r) => r.departmentId === departmentId);
}

/** Core resolver; `rawCookie` from `NextRequest` or `cookies().get(...)`. */
async function resolveNavWithRawCookie(
  session: AppJwtPayload,
  rawCookie: string | undefined,
): Promise<ActiveDepartmentNavResolution> {
  const facilityId = session.facilityId;
  const isFacilityAdmin = isFacilityAdministratorRole(session.role);

  const trimmed = rawCookie?.trim();

  if (isFacilityAdmin && (trimmed === undefined || trimmed === "")) {
    return {
      showAllDepartmentNav: true,
      activeDepartmentId: null,
      activeOperationalDepartmentKey: null,
    };
  }

  let departmentId: string | null = null;
  if (trimmed) {
    const ok = await userMaySelectDepartment(session, trimmed, facilityId, isFacilityAdmin);
    departmentId = ok ? trimmed : null;
  }

  if (!departmentId && session.primaryDepartmentId) {
    const ok = await userMaySelectDepartment(
      session,
      session.primaryDepartmentId,
      facilityId,
      isFacilityAdmin,
    );
    departmentId = ok ? session.primaryDepartmentId : null;
  }

  if (!departmentId) {
    const empId = await getOperationalEmployeeIdForSession(session);
    if (empId) {
      const employee = await prisma.employee.findFirst({
        where: { id: empId, facilityId },
        select: { primaryDepartmentId: true },
      });
      const pid = employee?.primaryDepartmentId;
      if (pid) {
        const ok = await userMaySelectDepartment(session, pid, facilityId, isFacilityAdmin);
        if (ok) departmentId = pid;
      }
    }
  }

  if (!departmentId) {
    return {
      showAllDepartmentNav: isFacilityAdmin,
      activeDepartmentId: null,
      activeOperationalDepartmentKey: null,
    };
  }

  const row = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { key: true },
  });
  const key = row?.key && isOperationalKey(row.key) ? row.key : null;

  return {
    showAllDepartmentNav: false,
    activeDepartmentId: departmentId,
    activeOperationalDepartmentKey: key,
  };
}

export async function resolveActiveDepartmentForNav(
  request: NextRequest,
  session: AppJwtPayload,
): Promise<ActiveDepartmentNavResolution> {
  const raw = request.cookies.get(ACTIVE_DEPARTMENT_COOKIE)?.value;
  return resolveNavWithRawCookie(session, raw);
}

export async function resolveActiveDepartmentForShell(
  session: AppJwtPayload,
  cookieStore: { get: (name: string) => { value: string } | undefined },
): Promise<ActiveDepartmentNavResolution> {
  const raw = cookieStore.get(ACTIVE_DEPARTMENT_COOKIE)?.value;
  return resolveNavWithRawCookie(session, raw);
}

/** Validates a deliberate department picker choice (cookie / API body). */
export async function validateActiveDepartmentPick(session: AppJwtPayload, pick: string): Promise<boolean> {
  const trimmed = pick.trim();
  if (trimmed === "") {
    return true;
  }
  return userMaySelectDepartment(
    session,
    trimmed,
    session.facilityId,
    isFacilityAdministratorRole(session.role),
  );
}
