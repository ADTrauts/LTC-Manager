/**
 * Run Locations — exception-first cards from Runtime Location State answers.
 * Do not copy the frozen hierarchy / OT / dump. See
 * docs/department-administration/14_RUN_SURFACE_REFERENCE_FREEZE.md
 */
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { ExceptionFirstLocationsBoard } from "@/components/exception-first-locations-board";
import { RoundsScreen } from "@/components/locations/rounds-screen";
import { getSession } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/access";
import {
  collectActionableLandingSpaces,
  loadLocationsView,
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

export default async function UnitsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string | string[] | undefined }>;
}) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const query = searchParams ? await searchParams : {};
  if (query.view === "rounds") {
    return <RoundsScreen />;
  }

  const canConfigureFacility = hasAtLeastRole(session.role, "MANAGER");

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
    spaceOrder: collected.refs.map((ref) => ref.spaceId),
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
