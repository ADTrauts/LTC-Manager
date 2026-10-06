import type { AppJwtPayload } from "@/lib/auth";
import { parseOperationalDepartmentKey } from "@/lib/department-admission";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import {
  departmentProductReleaseStatus,
  hasInternalDepartmentProductAccess,
} from "@/lib/department-products/eligibility";
import {
  isDepartmentRowCustomerOperable,
  loadCustomerOperableDepartments,
  loadFacilityDepartmentAccessContext,
  type FacilityDepartmentAccessRow,
} from "@/lib/department-products/load-facility-catalog";
import { resolveMembershipPrimaryOperationalDepartmentId } from "@/lib/active-department-scope";
import { employeeBelongsToDepartment, resolveDepartmentMembershipIds } from "@/lib/employee-membership";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import type { NextRequest } from "next/server";

export type ActiveDepartmentNavResolution = {
  showAllDepartmentNav: boolean;
  activeDepartmentId: string | null;
  activeOperationalDepartmentKey: string | null;
};

type AccessContext = Awaited<ReturnType<typeof loadFacilityDepartmentAccessContext>>;

function departmentHasInternalAccess(session: AppJwtPayload, productKey: string): boolean {
  return hasInternalDepartmentProductAccess({
    authKind: session.authKind,
    productKey,
  });
}

function departmentIsProductEligible(
  session: AppJwtPayload,
  department: Pick<FacilityDepartmentAccessRow, "key" | "isActive">,
  context: AccessContext,
): boolean {
  if (departmentHasInternalAccess(session, department.key)) {
    return department.isActive;
  }
  const entitlement = context.entitlements.find((row) => row.departmentKey === department.key);
  return isDepartmentRowCustomerOperable({
    key: department.key,
    isActive: department.isActive,
    entitlementStatus: entitlement?.status ?? null,
    billingStatus: context.billingStatus,
    entitlementsEnforced: context.entitlementsEnforced,
  });
}

async function userMaySelectDepartment(
  session: AppJwtPayload,
  departmentId: string,
  facilityId: string,
  isFacilityAdmin: boolean,
  context?: AccessContext,
): Promise<boolean> {
  const dept = await prisma.department.findFirst({
    where: {
      id: departmentId,
      facilityId,
      isActive: true,
      ...(session.authKind === "harbor_staff" ? {} : { showInEmployeeApp: true }),
    },
    select: { id: true, key: true, isActive: true },
  });
  if (!dept) return false;

  const access = context ?? (await loadFacilityDepartmentAccessContext(prisma, facilityId));
  if (!departmentIsProductEligible(session, dept, access)) {
    return false;
  }
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
  const context = await loadFacilityDepartmentAccessContext(prisma, facilityId);

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
    const ok = await userMaySelectDepartment(
      session,
      trimmed,
      facilityId,
      isFacilityAdmin,
      context,
    );
    departmentId = ok ? trimmed : null;
  }

  if (!departmentId && session.primaryDepartmentId) {
    const ok = await userMaySelectDepartment(
      session,
      session.primaryDepartmentId,
      facilityId,
      isFacilityAdmin,
      context,
    );
    departmentId = ok ? session.primaryDepartmentId : null;
  }

  if (!departmentId) {
    const empId = await getOperationalEmployeeIdForSession(session);
    if (empId) {
      const employee = await prisma.employee.findFirst({
        where: { id: empId, facilityId },
        select: {
          primaryDepartmentId: true,
          employeeDepartments: { select: { departmentId: true } },
        },
      });
      const pid = employee?.primaryDepartmentId;
      if (pid) {
        const ok = await userMaySelectDepartment(session, pid, facilityId, isFacilityAdmin, context);
        if (ok) departmentId = pid;
      }
      if (!departmentId && employee) {
        const membershipPrimary = resolveMembershipPrimaryOperationalDepartmentId({
          selectableDepartmentId: null,
          sessionPrimaryDepartmentId: session.primaryDepartmentId,
          employeePrimaryDepartmentId: employee.primaryDepartmentId,
          memberDepartmentIds: resolveDepartmentMembershipIds(employee),
        });
        if (membershipPrimary) {
          const installed = await prisma.department.findFirst({
            where: { id: membershipPrimary, facilityId, isActive: true },
            select: { id: true },
          });
          if (installed) departmentId = installed.id;
        }
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
  const key = parseOperationalDepartmentKey(row?.key);

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
 * Customer department contexts for the authenticated user.
 *
 * This is the released + entitled + installed + active set, then intersected
 * with membership for non-administrators. Harbor staff see installed active
 * departments including DEVELOPMENT products (Console work session).
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

  const facilityDepartments = await loadCustomerOperableDepartments(prisma, facilityId);
  const visible = facilityDepartments.filter((dept) => dept.showInEmployeeApp);

  if (isFacilityAdministratorRole(session.role)) {
    return visible.map((dept) => ({ id: dept.id, name: dept.name }));
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

  return visible
    .filter((dept) => memberIds.has(dept.id))
    .map((dept) => ({ id: dept.id, name: dept.name }));
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

export async function assertCustomerDepartmentContext(input: {
  session: AppJwtPayload;
  departmentId: string;
}): Promise<{
  allowed: boolean;
  reason: "operable" | "development" | "not_entitled" | "not_installed" | "internal";
  departmentKey: string | null;
}> {
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.session.facilityId },
    select: { id: true, key: true, isActive: true },
  });
  if (!department) {
    return { allowed: false, reason: "not_installed", departmentKey: null };
  }
  if (departmentHasInternalAccess(input.session, department.key)) {
    return { allowed: true, reason: "internal", departmentKey: department.key };
  }
  const context = await loadFacilityDepartmentAccessContext(prisma, input.session.facilityId);
  const entitlement = context.entitlements.find((row) => row.departmentKey === department.key);
  const operable = isDepartmentRowCustomerOperable({
    key: department.key,
    isActive: department.isActive,
    entitlementStatus: entitlement?.status ?? null,
    billingStatus: context.billingStatus,
    entitlementsEnforced: context.entitlementsEnforced,
  });
  if (operable) {
    return { allowed: true, reason: "operable", departmentKey: department.key };
  }
  const status = departmentProductReleaseStatus(department.key);
  if (status === "DEVELOPMENT") {
    return { allowed: false, reason: "development", departmentKey: department.key };
  }
  if (status === "AVAILABLE") {
    return { allowed: false, reason: "not_entitled", departmentKey: department.key };
  }
  return { allowed: false, reason: "not_installed", departmentKey: department.key };
}
