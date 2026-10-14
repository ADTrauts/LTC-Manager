import type { MenuStatus } from "@prisma/client";

import { requireAtLeastRole } from "@/lib/access";
import { assertCustomerDepartmentContext } from "@/lib/active-department-context";
import type { FacilitySession } from "@/lib/auth";
import { departmentProductOffersMenus } from "@/lib/department-products";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

export function resolveMenuListDepartmentScope(input: {
  showAllDepartmentNav: boolean;
  activeDepartmentId: string | null;
  requestedDepartmentId?: string | null;
}): string | null {
  if (input.showAllDepartmentNav) {
    const requested = input.requestedDepartmentId?.trim() ?? "";
    return requested.length > 0 ? requested : null;
  }
  return input.activeDepartmentId;
}

export function normalizeMenuName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function menuItemSlotWhere(input: {
  menuId: string;
  weekNumber: number;
  dayIndex: number;
  mealPeriodKey: string;
  category: string;
}) {
  return {
    menuId: input.menuId,
    weekNumber: input.weekNumber,
    dayIndex: input.dayIndex,
    mealPeriodKey: input.mealPeriodKey,
    category: input.category,
  };
}

export async function requireAuthorizedMenu(menuId: string) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const menu = await prisma.menu.findFirst({
    where: { id: menuId, facilityId: session.facilityId },
    include: {
      department: { select: { id: true, facilityId: true, key: true, name: true } },
    },
  });
  if (!menu || menu.department.facilityId !== session.facilityId) {
    throw new Error("Menu not found.");
  }

  const context = await assertCustomerDepartmentContext({
    session,
    departmentId: menu.departmentId,
  });
  if (!context.allowed) {
    throw new Error("Menu not found.");
  }

  return { session, menu };
}

export async function requireAuthorizedMenuDepartment(input: {
  session: FacilitySession;
  departmentId: string;
}) {
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.session.facilityId },
    select: { id: true, facilityId: true, key: true, name: true, isActive: true },
  });
  if (!department || department.facilityId !== input.session.facilityId) {
    throw new Error("Department not found.");
  }
  if (!department.isActive) {
    throw new Error("Department is not enabled.");
  }
  if (!departmentProductOffersMenus(department.key)) {
    throw new Error("This department's product does not offer Menus.");
  }

  const context = await assertCustomerDepartmentContext({
    session: input.session,
    departmentId: department.id,
  });
  if (!context.allowed) {
    throw new Error("Department not found.");
  }

  return department;
}

export function isMenuStatus(value: string): value is MenuStatus {
  return value === "ACTIVE" || value === "INACTIVE";
}
