import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";

import { KioskUnitAccessBanner } from "@/components/kiosk-unit-access-banner";
import { LeftSidebar } from "@/components/left-sidebar";
import { ShellZoneIndicator } from "@/components/shell-zone-indicator";
import { SignOutControls } from "@/components/sign-out-controls";
import { DepartmentScopeSwitcher } from "@/components/department-scope-switcher";
import { TopNav } from "@/components/top-nav";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { filterNavItemsForDepartmentScope } from "@/lib/department-nav";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { getFacilityForSession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { getNavItemsForRole } from "@/lib/route-permissions";
import { getSidebarUnitsForSession } from "@/lib/units";

type AppShellProps = {
  children: React.ReactNode;
};

export async function AppShell({ children }: AppShellProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [units, facility] = await Promise.all([
    getSidebarUnitsForSession(session),
    getFacilityForSession(),
  ]);
  const cookieStore = await cookies();
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
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const [rawNavItems, scopeDepartments] = await Promise.all([
    getNavItemsForRole(session.role),
    prisma.department.findMany({
      where: { facilityId: session.facilityId, isActive: true, showInEmployeeApp: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const navItems = filterNavItemsForDepartmentScope(rawNavItems, {
    showAllDepartmentNav: deptNav.showAllDepartmentNav,
    activeOperationalDepartmentKey: deptNav.activeOperationalDepartmentKey,
  });

  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-50"
      style={
        {
          "--brand-accent": facility?.brandColor ?? "#18181b",
        } as CSSProperties
      }
    >
      <header className="app-accent-divider shrink-0 border-b bg-white" role="banner">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 py-3 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-4 lg:px-6">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                LTC Manager
              </span>
              <p className="truncate text-sm font-medium text-zinc-800">
                {facility?.displayName ?? "Facility"}
              </p>
              <p className="truncate text-xs text-zinc-500">{sessionLabel}</p>
            </div>
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
          </div>
          <div className="col-start-2 row-start-1 justify-self-end self-start lg:col-start-3 lg:self-center">
            <SignOutControls showUnbind={showGmUnbind} showChangePassword={authKind === "user"} />
          </div>
          <nav
            className="col-span-2 min-w-0 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] lg:col-span-1 lg:col-start-2 lg:row-start-1 [&::-webkit-scrollbar]:h-1.5"
            aria-label="Application zones"
          >
            <TopNav items={navItems} />
          </nav>
        </div>
      </header>

      {kioskBannerUnitName ? <KioskUnitAccessBanner unitName={kioskBannerUnitName} /> : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <LeftSidebar
          units={units}
          lockedUnitId={lockedUnitId}
          showOperationsCenterLink={showOperationsCenterLink}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden">
          <ShellZoneIndicator />
          <main className="min-h-0 flex-1 p-4 lg:overflow-y-auto lg:p-6">{children}</main>
        </div>
      </div>
      <footer className="app-accent-divider shrink-0 border-t bg-white px-4 py-2 text-xs text-zinc-500 lg:px-6">
        {facility?.managementCompanyName
          ? `Operated by ${facility.managementCompanyName}.`
          : "Nutrition operations workspace."}
      </footer>
    </div>
  );
}
