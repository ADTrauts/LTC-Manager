import { notFound, redirect } from "next/navigation";

import { DepartmentMenusPanel } from "@/app/(protected)/admin/departments/[departmentId]/department-menus-panel";
import { DepartmentWorkPanel } from "@/app/(protected)/admin/departments/[departmentId]/department-work-panel";
import { DepartmentAdminLocalNav } from "@/app/(protected)/admin/departments/[departmentId]/local-nav";
import { LocationsPanel } from "@/app/(protected)/admin/departments/[departmentId]/locations-panel";
import { OperatingRhythmSection } from "@/app/(protected)/admin/departments/[departmentId]/operating-rhythm-section";
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
import { assertCustomerDepartmentContext } from "@/lib/active-department-context";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import {
  loadPlantStarterInstalledKeys,
  loadPlantStarterState,
} from "@/lib/department-products/plant-starter";
import { classifyPlantStarterPresence } from "@/lib/department-products/plant-starter-catalog";
import { loadTargetLogsBuildContext } from "@/lib/canonical-logs/load-target-build-context";
import {
  isCanonicalLogsEnabled,
  isDepartmentOperationalProfilesEnabled,
} from "@/lib/feature-flags";
import {
  presentOverviewGuidance,
  resolveOverviewProductIdentity,
} from "@/lib/department-administration/overview-guidance";
import {
  presentPlantGettingStarted,
} from "@/lib/department-administration/plant-getting-started";
import {
  canPurchaseDepartmentProducts,
  findCatalogItemForDepartmentKey,
  getDepartmentProduct,
  loadFacilityDepartmentCatalog,
} from "@/lib/department-products";
import { hasDietaryDomainCapabilities } from "@/lib/department-admission";
import { formatCycleOverviewSummary } from "@/lib/operational-cycles/cycle-ui";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ departmentId: string }>;
  searchParams: Promise<{
    tab?: string;
    profile?: string;
    roomType?: string;
    team?: string;
    expectation?: string;
    starter?: string;
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
  const access = await assertCustomerDepartmentContext({ session, departmentId });
  if (!access.allowed) {
    if (
      access.reason === "not_entitled" &&
      canPurchaseDepartmentProducts(session.role)
    ) {
      redirect("/admin/departments?marketplace=1");
    }
    redirect("/admin/departments");
  }

  const query = await searchParams;

  const requestedTab = query.tab;
  if (requestedTab && isDepartmentAdminRetiredTabId(requestedTab)) {
    const dest = DEPARTMENT_ADMIN_RETIRED_TAB_REDIRECT[requestedTab];
    const href = departmentAdminHref(departmentId, dest);
    const team = query.team?.trim();
    redirect(
      team && dest === "people" ? `${href}&team=${encodeURIComponent(team)}` : href,
    );
  }

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
  const product = getDepartmentProduct(view.department.key);
  const workEnabled =
    view.department.key === "PLANT" ||
    Boolean(product?.starters.workPresets) ||
    contextSummary.publishedWorkPlanCount > 0 ||
    contextSummary.draftWorkPlanCount > 0;
  const canonicalLogsEnabled = isCanonicalLogsEnabled();
  const availableTabs = departmentAdminTabsForFlags({
    profilesEnabled,
    locationsEnabled: true,
    workEnabled,
    recordsEnabled: canonicalLogsEnabled,
    menusEnabled: hasDietaryDomainCapabilities(view.department.key),
    maintenanceEnabled: view.department.key === "PLANT",
  });
  const tab = resolveDepartmentAdminTab(query.tab, {
    availableTabIds: availableTabs.map((item) => item.id),
    fallback: "overview",
  });
  if (tab === "maintenance") {
    redirect(`/build/departments/${view.department.id}/preventive-maintenance`);
  }
  const productIdentity = resolveOverviewProductIdentity(view.department.key);
  const catalog =
    tab === "overview"
      ? await loadFacilityDepartmentCatalog(prisma, session.facilityId)
      : [];
  const catalogItem = findCatalogItemForDepartmentKey(catalog, view.department.key);
  const plantFacts =
    tab === "overview" && view.department.key === "PLANT"
      ? {
          locationCount: view.locationCoverage.total,
          assetCount: await prisma.asset.count({
            where: { unit: { facilityId: session.facilityId } },
          }),
          peopleCount: contextSummary.assignedEmployeeCount,
          workPlanCount:
            contextSummary.publishedWorkPlanCount + contextSummary.draftWorkPlanCount,
          recordCount: contextSummary.placedLogCount,
          publishedPmPlanCount: await prisma.preventiveMaintenancePlan.count({
            where: {
              facilityId: session.facilityId,
              departmentId: view.department.id,
              status: "PUBLISHED",
            },
          }),
        }
      : null;
  const canInstallStarter =
    view.department.key === "PLANT" &&
    hasAtLeastRole(session.role, "MANAGER") &&
    session.authMethod !== "QUICK_PIN";
  const plantStarterPresence =
    tab === "overview" && view.department.key === "PLANT"
      ? classifyPlantStarterPresence(
          await loadPlantStarterInstalledKeys({
            facilityId: session.facilityId,
            departmentId: view.department.id,
          }),
        ).status
      : "none";
  const plantStarter = canInstallStarter
    ? await loadPlantStarterState({
        facilityId: session.facilityId,
        departmentId: view.department.id,
      })
    : null;
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
    productName: productIdentity.name,
    isVssylProduct: productIdentity.isVssylProduct,
    licensed: catalogItem ? catalogItem.licensed : null,
    guidanceRows: presentOverviewGuidance({
      departmentId: view.department.id,
      departmentKey: view.department.key,
      departmentName: view.department.name,
      locationCount: view.locationCoverage.total,
      currentRootLabels: contextSummary.currentRootLabels,
      draftRootCount: contextSummary.draftRootCount,
      scheduledCount: contextSummary.scheduledCount,
      scheduledEffectiveFrom: contextSummary.scheduledEffectiveFrom,
      memberCount: contextSummary.assignedEmployeeCount,
      publishedWorkPlanCount: contextSummary.publishedWorkPlanCount,
      draftWorkPlanCount: contextSummary.draftWorkPlanCount,
      placedLogCount: contextSummary.placedLogCount,
      publishedWorkOperationalTypeKeys: contextSummary.publishedWorkOperationalTypeKeys,
      classifiedOperationalTypeKeys: contextSummary.classifiedOperationalTypeKeys,
      mealTimingUpgradeRequired: contextSummary.mealTimingUpgradeRequired,
    }),
    plantGettingStarted: plantFacts
      ? presentPlantGettingStarted({
          departmentId: view.department.id,
          ...plantFacts,
          starterPresence: plantStarter?.presence ?? plantStarterPresence,
          canInstallStarter,
        })
      : null,
    plantCounts: plantFacts,
    plantStarter: plantStarter
      ? {
          facilityId: session.facilityId,
          items: plantStarter.items,
          defaultOpen: query.starter === "1",
        }
      : null,
  };

  const contentMaxWidth = tab === "overview" ? "max-w-4xl" : tab === "people" ? "max-w-6xl" : "max-w-5xl";

  const departmentLogsCtx =
    canonicalLogsEnabled && tab === "records"
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
          />
        ) : null}
        {tab === "locations" ? (
          <LocationsPanel
            view={view}
            inspects={locationInspects}
            canManage={Boolean(locationAuthority?.canManage)}
          />
        ) : null}
        {tab === "operating-rhythm" ? (
          <OperatingRhythmSection
            session={session}
            facilityId={session.facilityId}
            departmentId={view.department.id}
            departmentKey={view.department.key}
          />
        ) : null}
        {tab === "work" ? (
          <DepartmentWorkPanel
            departmentName={view.department.name}
            departmentKey={view.department.key}
            publishedCount={contextSummary.publishedWorkPlanCount}
            draftCount={contextSummary.draftWorkPlanCount}
            unmatchedLocationFunctions={settings.guidanceRows.some(
              (row) => row.id === "work" && row.description.includes("no bound room"),
            )}
            locationsHref={departmentAdminHref(view.department.id, "locations", profileId)}
            starterHref={canInstallStarter ? `/build/departments/${view.department.id}?starter=1` : null}
          />
        ) : null}
        {tab === "people" ? (
          <TeamsPanel
            session={session}
            facilityId={session.facilityId}
            departmentId={view.department.id}
            departmentName={view.department.name}
            departmentKey={view.department.key}
            selectedTeamId={query.team?.trim() || null}
          />
        ) : null}
        {tab === "records" && departmentLogsCtx ? (
          <section className="space-y-2" data-testid="department-records-panel">
            <h2 className="text-base font-semibold text-zinc-900">Records</h2>
            <p className="text-sm text-zinc-600">
              Readings, checklists, inspections, and acknowledgements required for this department.
              Recording a value happens in Run.
              {view.department.key === "PLANT" && canInstallStarter ? (
                <>
                  {" "}
                  <a
                    href={`/build/departments/${view.department.id}?starter=1`}
                    className="font-medium underline underline-offset-2"
                  >
                    Add starter configuration
                  </a>{" "}
                  or use the normal catalog.
                </>
              ) : null}
            </p>
            <TargetLogsSection
              targetTitle={view.department.name}
              attachments={departmentLogsCtx.attachments}
              addHref={departmentLogsCtx.addHref}
              runHref={`/staffing/logs/targets/department/${view.department.id}`}
              departmentName={view.department.name}
            />
          </section>
        ) : null}
        {tab === "menus" ? <DepartmentMenusPanel /> : null}
      </div>
    </div>
  );
}
