import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { LocationsHierarchyBrowser } from "@/components/locations-hierarchy-browser";
import { UnitsManager } from "@/components/units-manager";
import { getSession } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/access";
import {
  resolveFacilityVocabulary,
} from "@/lib/facility-builder/facility-vocabulary";
import { isProjectionLocationsEnabled } from "@/lib/feature-flags";
import {
  loadLocationsView,
  loadUnitsPageData,
} from "@/lib/locations";
import { prisma } from "@/lib/prisma";

function lensSummaryLabel(view: {
  lensMode: "DEPARTMENT" | "FACILITY";
  departmentKey: string | null;
  departmentSnapshots: { label: string }[];
}): string | null {
  if (view.lensMode === "FACILITY") return "Facility Overview";
  const label = view.departmentSnapshots[0]?.label;
  if (label) return label;
  if (view.departmentKey) return view.departmentKey;
  return null;
}

export default async function UnitsPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const canManageLogAssignments = hasAtLeastRole(session.role, "MANAGER");
  const canConfigureFacility = hasAtLeastRole(session.role, "MANAGER");

  // Flag off — preserve complete legacy Units management page for rollback.
  if (!isProjectionLocationsEnabled()) {
    const data = await loadUnitsPageData(session, {
      includeTemplates: canManageLogAssignments,
    });

    return (
      <section className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Units
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Configure each location: type-specific details, sidebar order, and
            which compliance logs apply. Log templates are built under Logs;
            managers can attach them to a unit here or on the Logs → Assignments
            tab.
          </p>
        </header>
        <UnitsManager
          units={data.units}
          parentOptions={data.parentOptions}
          templates={canManageLogAssignments ? data.templates : []}
          logAssignments={data.logAssignments}
          canManageLogAssignments={canManageLogAssignments}
        />
      </section>
    );
  }

  const [loaded, facility] = await Promise.all([
    loadLocationsView(session),
    prisma.facility.findUnique({
      where: { id: session.facilityId },
      select: {
        vocabularyProfile: true,
        vocabularyLevel1Label: true,
        vocabularyLevel2Label: true,
        vocabularyLevel3Label: true,
      },
    }),
  ]);

  const vocabulary = resolveFacilityVocabulary(facility);
  const view = loaded.view ?? {
    facilityId: session.facilityId,
    purpose: "LOCATIONS" as const,
    lensMode: "DEPARTMENT" as const,
    lensKey: "fail-closed",
    departmentKey: null,
    revision: {
      hierarchyRevision: "none",
      assignmentRevision: "none",
      profileRevision: "none",
      bindingRevision: "none",
      policyRevision: "none",
      experienceRegistryVersion: 0,
      accessClassRevision: "none",
    },
    departmentSnapshots: [],
    projectedUnitIds: [],
    diagnostics: [],
  };

  return (
    <LocationsHierarchyBrowser
      view={view}
      vocabulary={vocabulary}
      projectionError={loaded.error}
      canConfigureFacility={canConfigureFacility}
      lensSummary={lensSummaryLabel(view)}
    />
  );
}
