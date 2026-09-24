import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { KioskUnitAccessBanner } from "@/components/kiosk-unit-access-banner";
import { FacilitySwitcher } from "@/components/facility-switcher";
import { ProductModeBanner } from "@/components/product-mode-banner";
import { ShellBrandBlock } from "@/components/shell-brand-block";
import { ShellModeCue } from "@/components/shell-mode-cue";
import { ShellModeFrame } from "@/components/shell-mode-frame";
import { ShellSidebar } from "@/components/shell-sidebar";
import { ShellZoneIndicator } from "@/components/shell-zone-indicator";
import { AccountMenu } from "@/components/sign-out-controls";
import { ActiveDepartmentRouteSync } from "@/components/active-department-route-sync";
import { DepartmentScopeSwitcher } from "@/components/department-scope-switcher";
import { ShellOfflineIndicator } from "@/components/offline/shell-offline-indicator";
import { ResponsiveShellNav } from "@/components/responsive-shell-nav";
import { TopNav } from "@/components/top-nav";
import { HarborWorkSessionShell } from "@/components/harbor-console/harbor-work-session-shell";
import { hasAtLeastRole } from "@/lib/access";
import { getSession, sessionUserIdForFk } from "@/lib/auth";
import { getHarborSession } from "@/lib/harbor-console/auth";
import {
  resolveActiveDepartmentForShell,
  resolveSelectableDepartmentsForSession,
} from "@/lib/active-department-context";
import { buildSidebarNavItems } from "@/lib/build-hub";
import { rewriteDepartmentBuilderNavHref } from "@/lib/department-administration";
import { filterNavItemsForDepartmentScope } from "@/lib/department-nav";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { loadFacilityAccessContext } from "@/lib/facility-access";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { getFacilityForSession } from "@/lib/facility-context";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { roleMayAccessRoute } from "@/lib/route-registry";
import {
  isDietaryOperationalEvidenceEnabled,
  isDietaryWorkPlansEnabled,
  isCanonicalLogsEnabled,
  isProjectionSidebarEnabled,
  isTodaysWorkEnabled,
} from "@/lib/feature-flags";
import { applyMaintenanceNavRewrite } from "@/lib/asset-operations/maintenance-nav";
import { applyCanonicalLogsNavRewrite } from "@/lib/canonical-logs/run-nav";
import { loadSidebarProjection } from "@/lib/locations";
import { prisma } from "@/lib/prisma";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import { groupNavItemsByMode } from "@/lib/product-mode";
import { platformNavItemsForRole } from "@/lib/route-registry";
import { getSidebarUnitsForSession } from "@/lib/units";
import { shellClasses } from "@/lib/design-system";

type AppShellProps = {
  children: React.ReactNode;
};

/**
 * Application shell.
 *
 * Desktop (lg+): persistent left rail + full top nav.
 * Compact (&lt;lg): rails off-canvas via ResponsiveShellNav drawers; main owns full width.
 */
export async function AppShell({ children }: AppShellProps) {
  const session = await getSession();
  if (!session) {
    const harbor = await getHarborSession();
    if (harbor) {
      redirect("/console");
    }
    redirect("/login");
  }

  if (session.authKind === "harbor_staff") {
    const cookieStore = await cookies();
    const [facility, deptNav, departments] = await Promise.all([
      getFacilityForSession(),
      resolveActiveDepartmentForShell(session, cookieStore),
      resolveSelectableDepartmentsForSession(session),
    ]);
    return (
      <HarborWorkSessionShell
        facilityId={session.facilityId}
        facilityName={facility?.displayName ?? "Facility"}
        staffName={session.name}
        departments={departments}
        selectedDepartmentId={deptNav.activeDepartmentId}
      >
        {children}
      </HarborWorkSessionShell>
    );
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const emailUserId = sessionUserIdForFk(session);
  const projectionSidebar = isProjectionSidebarEnabled();
  const memo = projectionSidebar ? createProjectionRuntimeRequestScope() : undefined;

  const [legacyUnits, sidebarProjection, facility, facilityAccess] =
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
  const showGmUnbind =
    authKind === "user" && hasAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  const navFeatureFlags = {
    todaysWorkEnabled: isTodaysWorkEnabled(),
    dietaryOperationalEvidenceEnabled: isDietaryOperationalEvidenceEnabled(),
    dietaryWorkPlansEnabled: isDietaryWorkPlansEnabled(),
    canonicalLogsEnabled: isCanonicalLogsEnabled(),
  };
  const rawNavItems = platformNavItemsForRole(session.role, navFeatureFlags);

  const menuShowBuild = roleMayAccessRoute("/build", session.role, navFeatureFlags);
  const menuShowAdmin = roleMayAccessRoute("/admin", session.role, navFeatureFlags);
  const menuRunHomeHref = resolveDefaultHomePath({
    authKind,
    role: session.role,
    activeUnitId: session.activeUnitId,
    lockedUnitId,
  });
  const scopeDepartments = await resolveSelectableDepartmentsForSession(session);
  const shellSelectedDepartmentId =
    deptNav.showAllDepartmentNav && isFacilityAdministratorRole(session.role)
      ? null
      : deptNav.activeDepartmentId;

  const navItemsRaw = filterNavItemsForDepartmentScope(rawNavItems, {
    showAllDepartmentNav: deptNav.showAllDepartmentNav,
    activeOperationalDepartmentKey: deptNav.activeOperationalDepartmentKey,
  });
  const navItems = applyMaintenanceNavRewrite(
    applyCanonicalLogsNavRewrite(navItemsRaw, isCanonicalLogsEnabled(), {
      canViewLogBook: hasAtLeastRole(session.role, "SUPERVISOR"),
    }),
    { canViewAssets: hasAtLeastRole(session.role, "SUPERVISOR") },
  );
  const buildGroup = groupNavItemsByMode(navItems).find((group) => group.mode === "BUILD");
  const buildNavItems = rewriteDepartmentBuilderNavHref(
    buildSidebarNavItems(buildGroup?.items ?? []),
    deptNav.activeDepartmentId,
  );

  const sidebarUnits = projectionSidebar ? [] : legacyUnits;
  const projectionSections = projectionSidebar
    ? (sidebarProjection.view?.sections ?? [])
    : undefined;
  const projectionUnavailable = Boolean(projectionSidebar && sidebarProjection.error);

  return (
    <ShellModeFrame brandColor={facility?.brandColor ?? "#0f766e"}>
      <header
        className="shell-header shrink-0 border-b border-zinc-200 bg-white"
        role="banner"
        data-shell-region="header"
      >
        <div
          className={`mx-auto flex w-full min-w-0 ${shellClasses.maxWidth} flex-nowrap items-center gap-1.5 overflow-x-clip px-3 py-1.5 sm:gap-2 sm:px-4 sm:py-2 lg:gap-3 lg:overflow-visible lg:px-6`}
        >
          <ResponsiveShellNav
            navItems={navItems}
            buildNavItems={buildNavItems}
            units={sidebarUnits}
            projectionSections={projectionSections}
            projectionUnavailable={projectionUnavailable}
            lockedUnitId={lockedUnitId}
          />
          <ShellBrandBlock facilityName={facility?.displayName ?? "Facility"} />
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
            <>
              <ActiveDepartmentRouteSync
                selectedDepartmentId={shellSelectedDepartmentId}
                selectableDepartmentIds={scopeDepartments.map((d) => d.id)}
              />
              <DepartmentScopeSwitcher
                departments={scopeDepartments}
                selectedDepartmentId={shellSelectedDepartmentId}
                isFacilityAdministrator={isFacilityAdministratorRole(session.role)}
              />
            </>
          ) : null}
          <TopNav items={navItems} />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ShellModeCue />
            <ShellOfflineIndicator />
            <AccountMenu
              showUnbind={showGmUnbind}
              showChangePassword={authKind === "user"}
              menuLabel={session.name}
              runHomeHref={menuRunHomeHref}
              showBuild={menuShowBuild}
              showAdmin={menuShowAdmin}
            />
          </div>
        </div>
      </header>

      <ProductModeBanner />

      {kioskBannerUnitName ? <KioskUnitAccessBanner unitName={kioskBannerUnitName} /> : null}

      {/*
        Body: never stack the rail above content on compact widths.
        Desktop (lg+): row with persistent rail. Compact: content full width; nav is drawers.
      */}
      <div
        className={`mx-auto flex min-h-0 w-full min-w-0 ${shellClasses.maxWidth} flex-1 overflow-hidden`}
      >
        <ShellSidebar
          units={sidebarUnits}
          projectionSections={projectionSections}
          projectionUnavailable={projectionUnavailable}
          lockedUnitId={lockedUnitId}
          buildNavItems={buildNavItems}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ShellZoneIndicator />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
      <footer className="hidden shrink-0 border-t border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-500 xl:block xl:px-6">
        {facility?.managementCompanyName
          ? `Operated by ${facility.managementCompanyName}.`
          : "Nutrition operations workspace."}
      </footer>
    </ShellModeFrame>
  );
}
