import { notFound, redirect } from "next/navigation";

import { DepartmentAdminLocalNav } from "@/app/(protected)/admin/departments/[departmentId]/local-nav";
import { LocationsPanel } from "@/app/(protected)/admin/departments/[departmentId]/locations-panel";
import {
  OverviewPanel,
  type OverviewDepartmentSettings,
} from "@/app/(protected)/admin/departments/[departmentId]/overview-panel";
import { TeamsPanel } from "@/app/(protected)/admin/departments/[departmentId]/teams-panel";
import { DepartmentBuildContextBar } from "@/components/build/DepartmentBuildContextBar";
import { TargetLogsSection } from "@/components/canonical-logs/target-logs-section";
import {
  DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT,
  departmentAdminHref,
  departmentAdminTabsForFlags,
  isDepartmentAdminRetiredTabId,
  resolveDepartmentAdminTab,
} from "@/lib/department-administration";
import { loadDepartmentAdminView } from "@/lib/department-administration/load-department-admin";
import { loadDepartmentLocationRoomInspects } from "@/lib/department-administration/load-location-room-inspect";
import { resolveTeamAuthority } from "@/lib/department-teams";
import { loadDepartmentBuilderContextSummary } from "@/lib/department-administration/builder-context-summary";
import { getSession } from "@/lib/auth";
import { loadTargetLogsBuildContext } from "@/lib/canonical-logs/load-target-build-context";
import {
  isCanonicalLogsEnabled,
  isDepartmentOperationalProfilesEnabled,
} from "@/lib/feature-flags";
import { formatCycleOverviewSummary } from "@/lib/operational-cycles/cycle-ui";

type PageProps = {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{
    tab?: string;
    profile?: string;
    roomType?: string;
    team?: string;
    expectation?: string;
  }>;
};

export default async function DepartmentBuilderPage({
  params,
  searchParams,
}: PageProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const profilesEnabled = isDepartmentOperationalProfilesEnabled();
  const { departmentId } = await params;
  const query = await searchParams;

  // Primary tabs: Overview | Locations | Teams. Coverage / Cycles author on Teams.
  const availableTabs = departmentAdminTabsForFlags({
    profilesEnabled,
    locationsEnabled: true,
  });
  const primaryTabIds = availableTabs.map((tab) => tab.id);

  const requestedTab = query.tab;
  if (requestedTab && isDepartmentAdminRetiredTabId(requestedTab)) {
    const dest = DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT[requestedTab];
    const href = departmentAdminHref(departmentId, dest);
    const team = query.team?.trim();
    redirect(
      team && dest === "teams" ? `${href}&team=${encodeURIComponent(team)}` : href,
    );
  }
  const tab = resolveDepartmentAdminTab(requestedTab, {
    availableTabIds: primaryTabIds,
    fallback: "overview",
  });

  const view = await loadDepartmentAdminView({
    facilityId: session.facilityId,
    departmentId,
    requestedProfileId: query.profile ?? null,
  });

  if (!view) {
    notFound();
  }

  const contextSummary = await loadDepartmentBuilderContextSummary(session, view.department.id);
  if (!contextSummary) {
    notFound();
  }

  const profileId = view.workingProfileMeta?.id ?? null;
  const settings: OverviewDepartmentSettings = {
    showInEmployeeApp: contextSummary.showInEmployeeApp,
    headEmployeeId: contextSummary.headEmployeeId,
    headLabel: contextSummary.headDisplayName,
    assignedEmployeeCount: contextSummary.assignedEmployeeCount,
    canEditHead: contextSummary.canEditHead,
    canEditVisibility: contextSummary.canEditVisibility,
    employees: contextSummary.employees,
    publishedCycleCount: contextSummary.currentCycleCount,
    activeTeamCount: contextSummary.activeTeamCount,
    cycleSummary: formatCycleOverviewSummary({
      currentCount: contextSummary.currentCycleCount,
      draftCount: contextSummary.draftState === "changes" ? contextSummary.draftCount : 0,
      scheduledCount: contextSummary.scheduledCount,
      scheduledEffectiveFrom: contextSummary.scheduledEffectiveFrom,
    }),
  };

  const contentMaxWidth =
    tab === "overview"
      ? "max-w-4xl"
      : tab === "teams"
        ? "max-w-6xl"
        : tab === "locations"
          ? "max-w-5xl"
          : "max-w-5xl";

  const canonicalLogsEnabled = isCanonicalLogsEnabled();
  const departmentLogsCtx =
    canonicalLogsEnabled && tab === "overview"
      ? await loadTargetLogsBuildContext({
          facilityId: session.facilityId,
          targetKind: "DEPARTMENT",
          targetId: view.department.id,
          departmentId: view.department.id,
        })
      : null;

  const locationInspects =
    tab === "locations"
      ? await loadDepartmentLocationRoomInspects({
          facilityId: view.facilityId,
          department: view.department,
          locations: view.locations,
        })
      : {};
  const locationAuthority =
    tab === "locations"
      ? await resolveTeamAuthority(session, session.facilityId, view.department.id)
      : null;

  return (
    <div className="space-y-3" data-testid="department-builder">
      <DepartmentBuildContextBar
        departmentId={view.department.id}
        departmentName={view.department.name}
        locationCount={view.locationCoverage.total}
        profileId={profileId}
        activeTab={tab}
        context={contextSummary}
      />

      <DepartmentAdminLocalNav
        departmentId={view.department.id}
        activeTab={tab}
        profileId={profileId}
        tabs={availableTabs}
      />

      <div className={`min-w-0 ${contentMaxWidth}`.trim()}>
        {tab === "overview" ? (
          <OverviewPanel
            department={view.department}
            locationCoverage={view.locationCoverage}
            settings={settings}
            view={view}
            profilesEnabled={profilesEnabled}
            logsSection={
              departmentLogsCtx ? (
                <TargetLogsSection
                  targetTitle={view.department.name}
                  attachments={departmentLogsCtx.attachments}
                  addHref={departmentLogsCtx.addHref}
                  runHref={`/staffing/logs/targets/department/${view.department.id}`}
                  departmentName={view.department.name}
                />
              ) : null
            }
          />
        ) : null}
        {tab === "locations" ? (
          <LocationsPanel
            view={view}
            inspects={locationInspects}
            canManage={Boolean(locationAuthority?.canManage)}
          />
        ) : null}
        {tab === "teams" ? (
          <TeamsPanel
            session={session}
            facilityId={session.facilityId}
            departmentId={view.department.id}
            departmentName={view.department.name}
            departmentKey={view.department.key}
            selectedTeamId={query.team?.trim() || null}
          />
        ) : null}
      </div>
    </div>
  );
}
