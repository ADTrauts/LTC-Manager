import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";

import { KioskUnitAccessBanner } from "@/components/kiosk-unit-access-banner";
import { LeftSidebar } from "@/components/left-sidebar";
import { FacilitySwitcher } from "@/components/facility-switcher";
import { ShellBrandBlock } from "@/components/shell-brand-block";
import { ShellZoneIndicator } from "@/components/shell-zone-indicator";
import { SignOutControls } from "@/components/sign-out-controls";
import { DepartmentScopeSwitcher } from "@/components/department-scope-switcher";
import { ShellOfflineIndicator } from "@/components/offline/shell-offline-indicator";
import { TopNav } from "@/components/top-nav";
import { hasAtLeastRole } from "@/lib/access";
import { getSession, sessionUserIdForFk } from "@/lib/auth";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { filterNavItemsForDepartmentScope } from "@/lib/department-nav";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { loadFacilityAccessContext } from "@/lib/facility-access";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { getFacilityForSession } from "@/lib/facility-context";
import {
  isDietaryOperationalEvidenceEnabled,
  isDietaryWorkPlansEnabled,
  isProjectionSidebarEnabled,
  isTodaysWorkEnabled,
} from "@/lib/feature-flags";
import { loadSidebarProjection } from "@/lib/locations";
import { prisma } from "@/lib/prisma";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import { platformNavItemsForRole } from "@/lib/route-registry";
import { loadUnitReadinessBatch } from "@/lib/readiness";
import type { ReadinessState } from "@/lib/readiness";
import { getSidebarUnitsForSession } from "@/lib/units";
import { shellClasses } from "@/lib/design-system";

type AppShellProps = {
  children: React.ReactNode;
};

function readinessMapForProjectedUnits(
  byUnitId: Map<string, { state: ReadinessState }>,
  projectedUnitIds: readonly string[],
): Record<string, { state: ReadinessState }> {
  const allowed = new Set(projectedUnitIds);
  const out: Record<string, { state: ReadinessState }> = {};
  for (const unitId of allowed) {
    const item = byUnitId.get(unitId);
    if (item) out[unitId] = { state: item.state };
  }
  return out;
}

export async function AppShell({ children }: AppShellProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const emailUserId = sessionUserIdForFk(session);
  const projectionSidebar = isProjectionSidebarEnabled();
  const memo = projectionSidebar ? createProjectionRuntimeRequestScope() : undefined;

  const [legacyUnits, sidebarProjection, facility, readinessResult, facilityAccess] =
    await Promise.all([
      projectionSidebar
        ? Promise.resolve([])
        : getSidebarUnitsForSession(session),
      projectionSidebar
        ? loadSidebarProjection(session, { memo })
        : Promise.resolve({
            enabled: false as const,
            view: null,
            projectedUnitIds: [] as const,
            error: null,
            usedLegacyEligibility: true,
            metrics: null,
          }),
      getFacilityForSession(),
      loadUnitReadinessBatch(session.facilityId, {
        activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
      }).catch(() => null),
      emailUserId && session.authKind === "user"
        ? loadFacilityAccessContext({
            userId: emailUserId,
            activeFacilityId: session.facilityId,
            role: session.role,
          })
        : Promise.resolve(null),
    ]);

  const deviceUnitId = cookieStore.get(DEVICE_UNIT_COOKIE)?.value;
  const lockedUnitId =
    session.authKind === "employee" &&
    typeof deviceUnitId === "string" &&
    deviceUnitId.length > 0 &&
    session.activeUnitId === deviceUnitId
      ? deviceUnitId
      : undefined;

  let kioskBannerUnitName: string | null = null;
  if (session.kioskUnitAccessWarning && session.activeUnitId) {
    const u = await prisma.unit.findFirst({
      where: { id: session.activeUnitId, facilityId: session.facilityId, isActive: true },
      select: { name: true },
    });
    kioskBannerUnitName = u?.name ?? "this unit";
  }

  const authKind = session.authKind ?? "user";
  const sessionLabel =
    authKind === "employee"
      ? `Staff PIN session · ${session.name} (${session.role})`
      : `Signed in as ${session.name} (${session.role})`;
  const showGmUnbind =
    authKind === "user" && hasAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  const showOperationsCenterLink =
    authKind === "user" && hasAtLeastRole(session.role, "SUPERVISOR");
  const rawNavItems = platformNavItemsForRole(session.role, {
    todaysWorkEnabled: isTodaysWorkEnabled(),
    dietaryOperationalEvidenceEnabled: isDietaryOperationalEvidenceEnabled(),
    dietaryWorkPlansEnabled: isDietaryWorkPlansEnabled(),
  });
  const scopeDepartments = await prisma.department.findMany({
    where: { facilityId: session.facilityId, isActive: true, showInEmployeeApp: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  const navItems = filterNavItemsForDepartmentScope(rawNavItems, {
    showAllDepartmentNav: deptNav.showAllDepartmentNav,
    activeOperationalDepartmentKey: deptNav.activeOperationalDepartmentKey,
  });

  const projectedUnitIds = sidebarProjection.projectedUnitIds;
  const readinessByUnitId = readinessResult
    ? projectionSidebar
      ? readinessMapForProjectedUnits(
          readinessResult.byUnitId as Map<string, { state: ReadinessState }>,
          projectedUnitIds,
        )
      : Object.fromEntries(
          [...readinessResult.byUnitId.entries()].map(([unitId, item]) => [
            unitId,
            { state: item.state as ReadinessState },
          ]),
        )
    : {};

  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-50"
      style={
        {
          "--brand-accent": facility?.brandColor ?? "#18181b",
        } as CSSProperties
      }
    >
      <header className="shrink-0 border-b border-zinc-200 bg-white" role="banner">
        <div
          className={`mx-auto flex w-full ${shellClasses.maxWidth} flex-nowrap items-center gap-2 px-3 py-1.5 sm:gap-2.5 sm:px-4 sm:py-2 lg:gap-3 lg:px-6`}
        >
          <ShellBrandBlock
            facilityName={facility?.displayName ?? "Facility"}
            sessionLabel={sessionLabel}
          />
          {authKind === "user" &&
          facilityAccess &&
          facilityAccess.accessibleFacilities.length > 1 ? (
            <FacilitySwitcher
              facilities={facilityAccess.accessibleFacilities.map((f) => ({
                facilityId: f.facilityId,
                facilityName: f.facilityName,
              }))}
              activeFacilityId={facilityAccess.activeFacilityId}
            />
          ) : null}
          {scopeDepartments.length > 0 ? (
            <DepartmentScopeSwitcher
              departments={scopeDepartments}
              selectedDepartmentId={
                deptNav.showAllDepartmentNav && isFacilityAdministratorRole(session.role)
                  ? null
                  : deptNav.activeDepartmentId
              }
              isFacilityAdministrator={isFacilityAdministratorRole(session.role)}
            />
          ) : null}
          <TopNav items={navItems} />
          <div className="flex shrink-0 items-center gap-2">
            <ShellOfflineIndicator />
            <SignOutControls showUnbind={showGmUnbind} showChangePassword={authKind === "user"} />
          </div>
        </div>
      </header>

      {kioskBannerUnitName ? <KioskUnitAccessBanner unitName={kioskBannerUnitName} /> : null}

      <div className={`mx-auto flex min-h-0 w-full ${shellClasses.maxWidth} flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden`}>
        <LeftSidebar
          units={projectionSidebar ? [] : legacyUnits}
          projectionSections={
            projectionSidebar ? (sidebarProjection.view?.sections ?? []) : undefined
          }
          projectionUnavailable={Boolean(projectionSidebar && sidebarProjection.error)}
          lockedUnitId={lockedUnitId}
          showOperationsCenterLink={showOperationsCenterLink}
          readinessByUnitId={readinessByUnitId}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden">
          <ShellZoneIndicator />
          <main className="min-h-0 flex-1 p-4 lg:overflow-y-auto lg:p-6">{children}</main>
        </div>
      </div>
      <footer className="shrink-0 border-t border-zinc-200 bg-white px-4 py-2.5 text-xs text-zinc-500 lg:px-6">
        {facility?.managementCompanyName
          ? `Operated by ${facility.managementCompanyName}.`
          : "Nutrition operations workspace."}
      </footer>
    </div>
  );
}
