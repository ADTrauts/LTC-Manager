/**
 * Projection-visible SPACE refs → one RLS batch → Dashboard view model.
 */

import type { AppJwtPayload } from "@/lib/auth";
import { isProjectionLocationsEnabled } from "@/lib/feature-flags";
import { collectActionableLandingSpaces, loadLocationsView } from "@/lib/locations";
import { loadRuntimeLocationStates } from "@/lib/runtime-location-state";

import { presentDashboardWorkspace } from "./from-runtime-state";
import type { DashboardWorkspaceViewModel } from "./types";

export async function loadDashboardRuntime(
  session: AppJwtPayload,
): Promise<DashboardWorkspaceViewModel> {
  if (!session.facilityId || !isProjectionLocationsEnabled()) {
    return presentDashboardWorkspace([]);
  }

  const locations = await loadLocationsView(session);
  if (!locations.view) {
    return presentDashboardWorkspace([]);
  }

  const collected = collectActionableLandingSpaces(locations.view);
  if (collected.refs.length === 0) {
    return presentDashboardWorkspace([]);
  }

  const loaded = await loadRuntimeLocationStates({
    facilityId: session.facilityId,
    spaceRefs: collected.refs,
  });
  return presentDashboardWorkspace(loaded.states);
}
