import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { KioskUnitAccessBanner } from "@/components/kiosk-unit-access-banner";
import { ProductModeBanner } from "@/components/product-mode-banner";
import { ShellBrandBlock } from "@/components/shell-brand-block";
import { WorkspaceSelector } from "@/components/shell/workspace-selector";
import { ShellModeNav } from "@/components/shell/shell-mode-nav";
import { WorkspaceShellHeader } from "@/components/shell/workspace-shell-header";
import { WorkspaceShellRail } from "@/components/shell/workspace-shell-rail";
import { ShellModeCue } from "@/components/shell-mode-cue";
import { ShellModeFrame } from "@/components/shell-mode-frame";
import { ShellSidebar } from "@/components/shell-sidebar";
import { ShellZoneIndicator } from "@/components/shell-zone-indicator";
import { AccountMenu } from "@/components/sign-out-controls";
import { ActiveDepartmentRouteSync } from "@/components/active-department-route-sync";
import { DepartmentScopeSwitcher } from "@/components/department-scope-switcher";
import { ShellOfflineIndicator } from "@/components/offline/shell-offline-indicator";
import { ResponsiveShellNav } from "@/components/responsive-shell-nav";
import { HarborWorkSessionShell } from "@/components/harbor-console/harbor-work-session-shell";
import { hasAtLeastRole } from "@/lib/access";
import {
  loadWorkspaceSelectorModel,
  presentCurrentContextFromSession,
} from "@/lib/available-contexts";
import {
  getAppSession,
  isAccountSession,
  getSession,
  isOrganizationScopedSession,
} from "@/lib/auth";
import { getHarborSession } from "@/lib/harbor-console/auth";
import {
  resolveActiveDepartmentForShell,
  resolveSelectableDepartmentsForSession,
} from "@/lib/active-department-context";
import { buildSidebarNavItems } from "@/lib/build-hub";
import { rewriteDepartmentBuilderNavHref } from "@/lib/department-administration";
import { filterNavItemsForDepartmentScope } from "@/lib/department-nav";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
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
import { departmentUsesCanonicalRecords } from "@/lib/canonical-logs/record-engine-store";
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
 * Desktop (xl+): global bar owns Vssyl, Workspace, Mode, and identity.
 * Compact (&lt;xl): Menu / brand / Workspace / avatar; Mode and Department live in Menu.
 * The rail owns Workspace/Mode destinations only.
 */
export async function AppShell({ children }: AppShellProps) {
  const anySession = await getAppSession();
  if (!anySession) {
    const harbor = await getHarborSession();
    if (harbor) {
      redirect("/console");
    }
    redirect("/login");
  }
  if (isAccountSession(anySession)) {
    redirect("/access");
  }
  if (isOrganizationScopedSession(anySession)) {
    redirect(`/organization/${anySession.organizationId}`);
  }

  const session = await getSession();
  if (!session) {
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
  const projectionSidebar = isProjectionSidebarEnabled();
  const memo = projectionSidebar ? createProjectionRuntimeRequestScope() : undefined;

  const [legacyUnits, sidebarProjection, facility, workspaceSelector] =
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
      loadWorkspaceSelectorModel(session),
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
  const canonicalForDepartment = deptNav.activeDepartmentId
    ? await departmentUsesCanonicalRecords({
        facilityId: session.facilityId,
        departmentId: deptNav.activeDepartmentId,
      })
    : false;
  const navItems = applyMaintenanceNavRewrite(
    applyCanonicalLogsNavRewrite(navItemsRaw, canonicalForDepartment, {
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

  const currentWorkspace =
    authKind === "user"
      ? presentCurrentContextFromSession(session, {
          facilityName: facility?.displayName,
        })
      : null;

  const workspaceSelectorNode = () =>
    workspaceSelector ? (
      <WorkspaceSelector
        current={currentWorkspace}
        currentContextKey={workspaceSelector.currentContextKey}
        items={workspaceSelector.items}
      />
    ) : null;

  const departmentSwitcherNode = () =>
    scopeDepartments.length > 0 ? (
      <DepartmentScopeSwitcher
        departments={scopeDepartments}
        selectedDepartmentId={shellSelectedDepartmentId}
        isFacilityAdministrator={isFacilityAdministratorRole(session.role)}
      />
    ) : null;

  const homeHref = menuRunHomeHref;
  const modeNavNode = () => (
    <ShellModeNav
      key="shell-mode-nav"
      runHomeHref={menuRunHomeHref}
      showBuild={menuShowBuild}
      showAdmin={menuShowAdmin}
    />
  );

  return (
    <ShellModeFrame brandColor={facility?.brandColor ?? "#0f766e"}>
      {scopeDepartments.length > 0 ? (
        <ActiveDepartmentRouteSync
          selectedDepartmentId={shellSelectedDepartmentId}
          selectableDepartmentIds={scopeDepartments.map((d) => d.id)}
        />
      ) : null}
      <WorkspaceShellHeader
        menu={
          <ResponsiveShellNav
            key="compact-shell-nav"
            navItems={navItems}
            buildNavItems={buildNavItems}
            units={sidebarUnits}
            projectionSections={projectionSections}
            projectionUnavailable={projectionUnavailable}
            lockedUnitId={lockedUnitId}
            department={departmentSwitcherNode()}
            modeNav={modeNavNode()}
          />
        }
        brand={<ShellBrandBlock key="shell-brand" href={homeHref} />}
        workspace={
          authKind === "user" ? (
            workspaceSelectorNode()
          ) : (
            <p className="truncate text-sm font-medium text-zinc-700">
              {facility?.displayName ?? "Facility"}
            </p>
          )
        }
        mode={
          <ShellModeCue
            runHomeHref={menuRunHomeHref}
            showBuild={menuShowBuild}
            showAdmin={menuShowAdmin}
          />
        }
        trailing={<ShellOfflineIndicator key="shell-offline" />}
        account={
          <AccountMenu
            key="account-menu"
            showUnbind={showGmUnbind}
            showMyAccess={authKind === "user"}
            menuLabel={session.name}
            compactTrigger
          />
        }
      />

      <ProductModeBanner />

      {kioskBannerUnitName ? <KioskUnitAccessBanner unitName={kioskBannerUnitName} /> : null}

      <div
        className={`mx-auto flex min-h-0 w-full min-w-0 ${shellClasses.maxWidth} flex-1 overflow-hidden`}
      >
        <WorkspaceShellRail
          department={departmentSwitcherNode()}
          destinations={
            <ShellSidebar
              navItems={navItems}
              buildNavItems={buildNavItems}
              units={sidebarUnits}
              projectionSections={projectionSections}
              projectionUnavailable={projectionUnavailable}
              lockedUnitId={lockedUnitId}
            />
          }
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ShellZoneIndicator />
          <main
            data-shell-main
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6"
          >
            {children}
          </main>
        </div>
      </div>
    </ShellModeFrame>
  );
}
