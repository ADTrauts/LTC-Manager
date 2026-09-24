import { notFound, redirect } from "next/navigation";

import { AreasPanel } from "@/app/(protected)/admin/departments/[departmentId]/areas-panel";
import { ArchetypesPanel } from "@/app/(protected)/admin/departments/[departmentId]/archetypes-panel";
import { CyclesPanel } from "@/app/(protected)/admin/departments/[departmentId]/cycles-panel";
import { DiagnosticsPanel } from "@/app/(protected)/admin/departments/[departmentId]/diagnostics-panel";
import { DepartmentAdminLocalNav } from "@/app/(protected)/admin/departments/[departmentId]/local-nav";
import { LocationsPanel } from "@/app/(protected)/admin/departments/[departmentId]/locations-panel";
import {
  OverviewPanel,
  type OverviewDepartmentSettings,
} from "@/app/(protected)/admin/departments/[departmentId]/overview-panel";
import { CoveragePanel } from "@/app/(protected)/admin/departments/[departmentId]/coverage-panel";
import { TeamsPanel } from "@/app/(protected)/admin/departments/[departmentId]/teams-panel";
import { RoomsPanel } from "@/app/(protected)/admin/departments/[departmentId]/rooms-panel";
import { SettingsPanel } from "@/app/(protected)/admin/departments/[departmentId]/settings-panel";
import { VersionsPanel } from "@/app/(protected)/admin/departments/[departmentId]/versions-panel";
import { DepartmentBuildContextBar } from "@/components/build/DepartmentBuildContextBar";
import { TargetLogsSection } from "@/components/canonical-logs/target-logs-section";
import {
  checkPatternAuthoringAccess,
  departmentAdminTabsForFlags,
  resolveDepartmentAdminTab,
  type DepartmentAdminTabId,
} from "@/lib/department-administration";
import { loadDepartmentAdminView } from "@/lib/department-administration/load-department-admin";
import { loadDepartmentLocationPrograms } from "@/lib/department-administration/load-effective-location-program";
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

  // Primary tabs: Overview | Locations | Teams | Coverage | Operational Cycles.
  const availableTabs = departmentAdminTabsForFlags({
    profilesEnabled,
    locationsEnabled: true,
  });
  const availableTabIds = availableTabs.map((tab) => tab.id);

  const requestedTab = query.tab;
  const legacyAllowed: DepartmentAdminTabId[] = profilesEnabled
    ? ["areas", "archetypes", "rooms", "diagnostics", "versions", "settings"]
    : [];
  // Room Types is never a primary tab; always redirect into Locations.
  const tab = resolveDepartmentAdminTab(requestedTab, {
    availableTabIds: [...availableTabIds, ...legacyAllowed],
    fallback: "overview",
    redirectLegacy: requestedTab === "room-types" || !profilesEnabled,
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

  const primaryActive =
    availableTabIds.includes(tab as (typeof availableTabIds)[number])
      ? (tab as (typeof availableTabIds)[number])
      : tab === "rooms" || tab === "areas" || tab === "archetypes" || tab === "room-types"
        ? "locations"
        : "overview";

  const contentMaxWidth =
    tab === "overview"
      ? "max-w-4xl"
      : tab === "locations" || tab === "teams" || tab === "coverage"
        ? "max-w-5xl"
        : tab === "cycles"
          ? "max-w-6xl"
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

  const canAuthorPatterns =
    checkPatternAuthoringAccess({
      role: session.role,
      authMethod: session.authMethod ?? "PASSWORD",
      sessionFacilityId: session.facilityId,
      targetFacilityId: view.facilityId,
    }) === null;

  const locationPrograms =
    tab === "locations"
      ? await loadDepartmentLocationPrograms({
          facilityId: view.facilityId,
          department: view.department,
          locations: view.locations,
          profile: view.workingProfile,
          bindings: view.roomBindings,
          exceptions: view.roomExceptions,
        })
      : {};

  return (
    <div className="space-y-3" data-testid="department-builder">
      <DepartmentBuildContextBar
        departmentId={view.department.id}
        departmentName={view.department.name}
        locationCount={view.locationCoverage.total}
        profileId={profileId}
        activeTab={primaryActive}
        context={contextSummary}
      />

      <DepartmentAdminLocalNav
        departmentId={view.department.id}
        activeTab={primaryActive}
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
            canAuthorPatterns={canAuthorPatterns}
            programs={locationPrograms}
          />
        ) : null}
        {tab === "teams" ? (
          <TeamsPanel
            session={session}
            facilityId={session.facilityId}
            departmentId={view.department.id}
            departmentName={view.department.name}
            selectedTeamId={query.team?.trim() || null}
          />
        ) : null}
        {tab === "coverage" ? (
          <CoveragePanel
            session={session}
            facilityId={session.facilityId}
            departmentId={view.department.id}
            departmentName={view.department.name}
            departmentKey={view.department.key}
            selectedExpectationId={query.expectation?.trim() || null}
          />
        ) : null}
        {tab === "areas" ? <AreasPanel view={view} /> : null}
        {tab === "archetypes" ? <ArchetypesPanel view={view} /> : null}
        {tab === "rooms" ? <RoomsPanel view={view} /> : null}
        {tab === "diagnostics" ? <DiagnosticsPanel view={view} /> : null}
        {tab === "versions" ? <VersionsPanel view={view} /> : null}
        {tab === "cycles" ? (
          <CyclesPanel
            session={session}
            facilityId={session.facilityId}
            departmentId={view.department.id}
            departmentName={view.department.name}
            departmentKey={view.department.key}
          />
        ) : null}
        {tab === "settings" ? <SettingsPanel view={view} /> : null}
      </div>
    </div>
  );
}
