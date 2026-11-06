/**
 * Wave 15E — adapt ProjectionSnapshot → ShadowEligibilityView.
 */

import type { ProjectionSnapshot } from "../types";

import type {
  ShadowAreaView,
  ShadowEligibilityView,
  ShadowExperienceView,
  ShadowQueryScopeView,
} from "./types";

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

  const areas: ShadowAreaView[] = [];
  const experiences: ShadowExperienceView[] = [];
  const queryScopes: ShadowQueryScopeView[] = [];
  const locationIds: string[] = [];
  const actionableLocationIds: string[] = [];
  const roomIds: string[] = [];
  const plantCovered: string[] = [];
  let plantApplied = false;

  for (const child of departmentSnapshots) {
    for (const area of child.areas) {
      areas.push({
        areaKey: area.areaKey,
        order: area.order,
        experienceKeys: child.experiences
          .filter((experience) => area.experienceIds.includes(experience.id))
          .sort(
            (a, b) =>
              a.order - b.order ||
              a.reference.experienceKey.localeCompare(
                b.reference.experienceKey,
              ),
          )
          .map((experience) => experience.reference.experienceKey),
      });
    }

    for (const experience of child.experiences) {
      experiences.push({
        experienceKey: experience.reference.experienceKey,
        areaKey: experience.reference.areaKey,
        order: experience.order,
        locationIds: [...experience.reference.locationIds].sort((a, b) =>
          a.localeCompare(b),
        ),
        allowedActionKeys: [...experience.permissions.allowedActionKeys].sort(
          (a, b) => a.localeCompare(b),
        ),
        navigationHandles: experience.navigation.entries
          .map((entry) => entry.id)
          .sort((a, b) => a.localeCompare(b)),
        workspaceHandles: [
          experience.workspace.default.density,
          experience.workspace.unitWorkspace.density,
          experience.workspace.businessWorkspace.density,
          experience.workspace.operationsCenter.density,
        ],
      });

      const scope = child.queryScopes.byExperience[experience.id];
      if (scope) {
        queryScopes.push({
          experienceKey: experience.reference.experienceKey,
          unitIds: [...scope.unitIds].sort((a, b) => a.localeCompare(b)),
          spaceIds: [...scope.spaceIds].sort((a, b) => a.localeCompare(b)),
          domains: [...scope.domains].sort((a, b) => a.localeCompare(b)),
        });
      }
    }

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
    areas: areas.sort(
      (a, b) => a.order - b.order || a.areaKey.localeCompare(b.areaKey),
    ),
    experiences: experiences.sort(
      (a, b) =>
        a.areaKey.localeCompare(b.areaKey) ||
        a.order - b.order ||
        a.experienceKey.localeCompare(b.experienceKey),
    ),
    queryScopes: queryScopes.sort((a, b) =>
      a.experienceKey.localeCompare(b.experienceKey),
    ),
    plantApplied,
    plantCoveredLocationIds: sortedUnique(plantCovered),
    revisionTokens: [
      revision.hierarchyRevision,
      revision.assignmentRevision,
      revision.profileRevision,
      revision.bindingRevision,
      revision.policyRevision,
      `registry:${revision.experienceRegistryVersion}`,
      revision.accessClassRevision,
    ].sort((a, b) => a.localeCompare(b)),
  };
}
