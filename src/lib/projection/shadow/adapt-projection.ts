/**
 * Wave 15E — adapt ProjectionSnapshot → ShadowEligibilityView.
 */

import type { ProjectionSnapshot } from "../types";

import type { ShadowEligibilityView } from "./types";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function adaptProjectionSnapshotToShadowView(
  snapshot: ProjectionSnapshot,
): ShadowEligibilityView {
  const lensKey =
    snapshot.context.request.lens.mode === "FACILITY"
      ? "facility"
      : `department:${snapshot.context.request.lens.departmentKey}`;

  const departmentKeys =
    snapshot.context.request.lens.mode === "FACILITY"
      ? sortedUnique(
          (snapshot.facilityOverview?.departmentSnapshots ?? []).flatMap(
            (child) =>
              child.context.request.lens.mode === "DEPARTMENT"
                ? [child.context.request.lens.departmentKey]
                : [],
          ),
        )
      : snapshot.context.request.lens.mode === "DEPARTMENT"
        ? [snapshot.context.request.lens.departmentKey]
        : [];

  // Facility overview: compare composed department children as a labeled union.
  const departmentSnapshots =
    snapshot.facilityOverview?.departmentSnapshots ?? [snapshot];

  const locationIds: string[] = [];
  const actionableLocationIds: string[] = [];
  const roomIds: string[] = [];
  const plantCovered: string[] = [];
  let plantApplied = false;

  for (const child of departmentSnapshots) {
    locationIds.push(...Object.keys(child.locations.byId));
    actionableLocationIds.push(...child.locations.actionableIds);
    for (const id of child.locations.actionableIds) {
      const node = child.locations.byId[id];
      if (node?.reference.kind === "SPACE") {
        roomIds.push(node.reference.spaceId);
      }
    }

    if (child.plantPolicy?.applied) {
      plantApplied = true;
      plantCovered.push(...child.plantPolicy.coveredLocationIds);
    }
  }

  const revision = snapshot.context.identity.revision;

  return {
    source: "PROJECTION",
    facilityId: snapshot.context.identity.facilityId,
    lensKey,
    departmentKeys,
    locationIds: sortedUnique(locationIds),
    actionableLocationIds: sortedUnique(actionableLocationIds),
    roomIds: sortedUnique(roomIds),
    plantApplied,
    plantCoveredLocationIds: sortedUnique(plantCovered),
    revisionTokens: [
      revision.hierarchyRevision,
      revision.assignmentRevision,
      revision.policyRevision,
      revision.accessClassRevision,
    ].sort((a, b) => a.localeCompare(b)),
  };
}
