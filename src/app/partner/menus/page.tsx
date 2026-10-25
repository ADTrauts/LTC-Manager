import { redirect } from "next/navigation";

import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { departmentProductOffersMenus } from "@/lib/department-products/registry";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import {
  loadDepartmentMenuLocations,
  loadEligibleMenuOperationalCycles,
} from "@/lib/menu-applicability-db";
import { locationTargetFromActionable, menuLocationTargetKey } from "@/lib/menu-applicability";
import { DEFAULT_MENU_PERIODS } from "@/lib/menu-cycle";
import { listMenus } from "@/lib/menu-db";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

import { PartnerMenuForms } from "./forms";

export default async function PartnerMenusPage() {
  if (!isContractedDepartmentAuthorityEnabled()) redirect("/partner");
  const session = await getPartnerFacilitySession();
  if (!session) redirect("/login");
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
    redirect("/partner");
  }

  const department = await prisma.department.findFirst({
    where: { id: context.activeDepartmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true, key: true, name: true },
  });
  const offersMenus = departmentProductOffersMenus(department?.key);

  const [listed, locations, cycles] = offersMenus
    ? await Promise.all([
        listMenus(prisma, { facilityId: session.facilityId, departmentId: context.activeDepartmentId }),
        loadDepartmentMenuLocations({
          facilityId: session.facilityId,
          departmentId: context.activeDepartmentId,
        }),
        loadEligibleMenuOperationalCycles({
          facilityId: session.facilityId,
          departmentId: context.activeDepartmentId,
        }),
      ])
    : [null, null, [] as Awaited<ReturnType<typeof loadEligibleMenuOperationalCycles>>];

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="partner-menus-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Menus</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {offersMenus
            ? "Menus for this Department, attached to its locations and a published cycle."
            : "This Department does not use menus."}
        </p>
      </div>
      {offersMenus && listed ? (
        <>
          <PartnerMenuForms
            menus={listed.menus.map((menu) => ({ id: menu.id, name: menu.name }))}
            locations={(locations?.locations ?? []).map((location) => {
              const target = locationTargetFromActionable(location);
              return { key: menuLocationTargetKey(target), name: location.displayName };
            })}
            cycles={cycles.map((cycle) => ({ stableKey: cycle.stableKey, label: cycle.label }))}
            periods={DEFAULT_MENU_PERIODS.map((period) => ({ key: period.key, label: period.label }))}
          />
          <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
            <h2 className="text-sm font-semibold">Menus</h2>
            {listed.unavailableReason ? (
              <p className="mt-2 text-sm text-amber-800">{listed.unavailableReason}</p>
            ) : listed.menus.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No menus yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100 text-sm">
                {listed.menus.map((menu) => (
                  <li key={menu.id} className="py-2">
                    {menu.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
