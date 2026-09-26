/**
 * Run Locations — exception-first cards from Runtime Location State answers.
 * Do not copy the frozen hierarchy / OT / dump. See
 * docs/department-administration/14_RUN_SURFACE_REFERENCE_FREEZE.md
 */
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { ExceptionFirstLocationsBoard } from "@/components/exception-first-locations-board";
import { UnitsManager } from "@/components/units-manager";
import { getSession } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/access";
import { isProjectionLocationsEnabled } from "@/lib/feature-flags";
import {
  collectActionableLandingSpaces,
  loadLocationsView,
  loadUnitsPageData,
  presentExceptionFirstLocationBoard,
} from "@/lib/locations";
import { loadRuntimeLocationStates } from "@/lib/runtime-location-state";

function lensSummaryLabel(view: {
  lensMode: "DEPARTMENT" | "FACILITY";
  departmentKey: string | null;
  departmentSnapshots: readonly { label: string }[];
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
          departments={data.departments}
          templates={canManageLogAssignments ? data.templates : []}
          logAssignments={data.logAssignments}
          canManageLogAssignments={canManageLogAssignments}
        />
      </section>
    );
  }

  const loaded = await loadLocationsView(session);
  const collected =
    loaded.view && !loaded.error
      ? collectActionableLandingSpaces(loaded.view)
      : { refs: [], ancestry: [] };
  const runtime =
    collected.refs.length > 0
      ? await loadRuntimeLocationStates({
          facilityId: session.facilityId,
          spaceRefs: collected.refs,
        })
      : { states: [] };
  const board = presentExceptionFirstLocationBoard({
    states: runtime.states,
  });

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
    <ExceptionFirstLocationsBoard
      board={board}
      projectionError={loaded.error}
      canConfigureFacility={canConfigureFacility}
      lensSummary={lensSummaryLabel(view)}
      departmentLabel={
        view.departmentSnapshots.length === 1
          ? view.departmentSnapshots[0]!.label
          : null
      }
    />
  );
}
