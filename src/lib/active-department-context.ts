import type { AppJwtPayload } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { employeeBelongsToDepartment, resolveDepartmentMembershipIds } from "@/lib/employee-membership";
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
    where: {
      id: departmentId,
      facilityId,
      isActive: true,
      ...(session.authKind === "harbor_staff" ? {} : { showInEmployeeApp: true }),
    },
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
  return employeeBelongsToDepartment(employee, departmentId);
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

export type SelectableDepartment = { id: string; name: string };

/**
 * The department contexts actually available to the authenticated user — the basis for the
 * progressive department control (compact when there is a single context, a selector when there are
 * several). This is presentation only: it never grants access. A Facility Administrator sees every
 * active, employee-app-visible department; everyone else sees only the departments they are a member
 * of (primary + secondary), intersected with the facility's active, employee-app-visible set.
 */
export async function resolveSelectableDepartmentsForSession(
  session: AppJwtPayload,
): Promise<SelectableDepartment[]> {
  const facilityId = session.facilityId;
  if (session.authKind === "harbor_staff") {
    return prisma.department.findMany({
      where: { facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
  }

  const facilityDepartments = await prisma.department.findMany({
    where: { facilityId, isActive: true, showInEmployeeApp: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  if (isFacilityAdministratorRole(session.role)) {
    return facilityDepartments;
  }

  const empId = await getOperationalEmployeeIdForSession(session);
  if (!empId) return [];
  const employee = await prisma.employee.findFirst({
    where: { id: empId, facilityId },
    select: {
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!employee) return [];

  const memberIds = new Set(resolveDepartmentMembershipIds(employee));

  return facilityDepartments.filter((dept) => memberIds.has(dept.id));
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
