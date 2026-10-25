"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { getPartnerFacilitySession } from "@/lib/auth";
import { operatorPeriodIdForCreate } from "@/lib/department-authority/operator-period";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { departmentProductOffersMenus } from "@/lib/department-products/registry";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { normalizeMenuName } from "@/lib/menu-authority";
import {
  loadDepartmentMenuLocations,
  loadEligibleMenuOperationalCycles,
  loadMenuApplicability,
  replaceMenuApplicability,
} from "@/lib/menu-applicability-db";
import {
  locationTargetFromActionable,
  menuLocationTargetKey,
  resolveMenuPeriodKeys,
} from "@/lib/menu-applicability";
import { DEFAULT_MENU_PERIODS } from "@/lib/menu-cycle";
import { assertPrismaMenuReady } from "@/lib/menu-db";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export type PartnerMenuResult = { ok: boolean; message: string } | null;

async function setupContext() {
  if (!isContractedDepartmentAuthorityEnabled()) {
    return { ok: false as const, message: "Department setup is not available." };
  }
  const session = await getPartnerFacilitySession();
  if (!session) return { ok: false as const, message: "Sign in to the vendor account first." };
  const context = await requirePartnerOperationalContext();
  const access = await resolveDepartmentAccess(prisma, session, {
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  });
  if (
    !access ||
    !partnerMaySetUpDepartment({
      mode: access.mode,
      isHead: access.isHead,
      effectiveRole: context.effectiveRole,
    })
  ) {
    return { ok: false as const, message: "Only the Department head or a Partner Manager can write menus." };
  }
  const department = await prisma.department.findFirst({
    where: { id: context.activeDepartmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true, key: true },
  });
  if (!department || !departmentProductOffersMenus(department.key)) {
    return { ok: false as const, message: "This Department does not use menus." };
  }
  return {
    ok: true as const,
    session,
    facilityId: session.facilityId,
    departmentId: department.id,
  };
}

function revalidate() {
  revalidatePath("/partner/menus");
}

export async function addPartnerMenuAction(
  _previous: PartnerMenuResult,
  formData: FormData,
): Promise<PartnerMenuResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const name = normalizeMenuName(String(formData.get("name") ?? ""));
  if (!name) return { ok: false, message: "Menu name is required." };
  assertPrismaMenuReady(prisma);
  try {
    await prisma.$transaction(async (tx) => {
      const menu = await tx.menu.create({
        data: {
          facilityId: gate.facilityId,
          departmentId: gate.departmentId,
          name,
          status: "ACTIVE",
          operatorPeriodId: await operatorPeriodIdForCreate(tx, {
            facilityId: gate.facilityId,
            departmentId: gate.departmentId,
          }),
        },
      });
      await tx.menuCycleSettings.create({
        data: {
          menuId: menu.id,
          facilityId: gate.facilityId,
          cycleLengthWeeks: 3,
          weekStartsOn: "SUNDAY",
          cycleAnchorDate: new Date(new Date().toDateString()),
          periodConfigJson: DEFAULT_MENU_PERIODS as unknown as Prisma.InputJsonValue,
        },
      });
    });
    revalidate();
    return { ok: true, message: `Menu “${name}” created.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not create the menu." };
  }
}

export async function assignPartnerMenuAction(
  _previous: PartnerMenuResult,
  formData: FormData,
): Promise<PartnerMenuResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const menuId = String(formData.get("menuId") ?? "");
  const locationKey = String(formData.get("locationKey") ?? "");
  const cycleStableKey = String(formData.get("cycleStableKey") ?? "").trim();
  const menuPeriodKey = String(formData.get("menuPeriodKey") ?? "").trim().toUpperCase();
  const menu = await prisma.menu.findFirst({
    where: { id: menuId, facilityId: gate.facilityId, departmentId: gate.departmentId },
    select: { id: true },
  });
  if (!menu) return { ok: false, message: "Choose a menu in this Department." };

  const [existing, departmentLocations, eligible, settings] = await Promise.all([
    loadMenuApplicability(prisma, menu.id),
    loadDepartmentMenuLocations({ facilityId: gate.facilityId, departmentId: gate.departmentId }),
    loadEligibleMenuOperationalCycles({ facilityId: gate.facilityId, departmentId: gate.departmentId }),
    prisma.menuCycleSettings.findFirst({
      where: { menuId: menu.id },
      select: { periodConfigJson: true },
    }),
  ]);
  if (!departmentLocations) return { ok: false, message: "This Department has no locations to attach." };
  const location = departmentLocations.locations
    .map(locationTargetFromActionable)
    .find((row) => menuLocationTargetKey(row) === locationKey);
  if (!location) return { ok: false, message: "Choose a location this Department is responsible for." };
  if (!eligible.some((row) => row.stableKey === cycleStableKey)) {
    return { ok: false, message: "Choose a published cycle for this Department." };
  }

  try {
    await replaceMenuApplicability({
      menuId: menu.id,
      locations: [location],
      cycles: [{ cycleStableKey, menuPeriodKey }],
      existing,
      actionable: departmentLocations.locations,
      eligible,
      periodKeys: resolveMenuPeriodKeys(settings?.periodConfigJson),
    });
    revalidate();
    return { ok: true, message: "Menu attached to that location and cycle." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not attach the menu." };
  }
}
