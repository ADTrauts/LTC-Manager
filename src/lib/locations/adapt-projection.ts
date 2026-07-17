/**
 * Wave Location Certification — adapt ProjectionSnapshot → LocationsViewModel.
 *
 * Pure hierarchy adaptation. Room-number enrichment happens in a separate
 * presentation pass (does not change Projection).
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type {
  ProjectionArea,
  ProjectionExperience,
  ProjectionLocationNode,
  ProjectionSnapshot,
} from "@/lib/projection";

import type {
  LocationsAreaRef,
  LocationsDepartmentSnapshot,
  LocationsExperienceRef,
  LocationsTreeNode,
  LocationsViewModel,
} from "./types";

function departmentLabel(key: OperationalDepartmentKey): string {
  switch (key) {
    case "DIETARY":
      return "Dietary";
    case "EVS":
      return "EVS";
    case "PLANT":
      return "Plant";
    default:
      return key;
  }
}

function areasForLocation(
  locationId: string,
  areas: readonly ProjectionArea[],
  experiences: readonly ProjectionExperience[],
): LocationsAreaRef[] {
  const byArea = new Map<string, LocationsExperienceRef[]>();

  for (const experience of experiences) {
    if (!experience.reference.locationIds.includes(locationId)) continue;
    const list = byArea.get(experience.reference.areaKey) ?? [];
    list.push({
      experienceKey: experience.reference.experienceKey,
      areaKey: experience.reference.areaKey,
      label: experience.label,
      order: experience.order,
      allowedActionKeys: experience.permissions.allowedActionKeys,
    });
    byArea.set(experience.reference.areaKey, list);
  }

  const result: LocationsAreaRef[] = [];
  for (const area of [...areas].sort(
    (a, b) => a.order - b.order || a.areaKey.localeCompare(b.areaKey),
  )) {
    const areaExperiences = (byArea.get(area.areaKey) ?? []).sort(
      (a, b) =>
        a.order - b.order || a.experienceKey.localeCompare(b.experienceKey),
    );
    if (areaExperiences.length === 0) continue;
    result.push({
      areaKey: area.areaKey,
      label: area.label,
      order: area.order,
      experiences: areaExperiences,
    });
  }
  return result;
}

function adaptNode(
  node: ProjectionLocationNode,
  areas: readonly ProjectionArea[],
  experiences: readonly ProjectionExperience[],
  parentId: string | null,
): LocationsTreeNode {
  const locationAreas = areasForLocation(node.id, areas, experiences);
  const children = node.children.map((child) =>
    adaptNode(child, areas, experiences, node.id),
  );

  if (node.reference.kind === "FACILITY") {
    return {
      id: node.id,
      label: node.label,
      secondaryLabel: null,
      presentation: node.presentation,
      physicalId: node.reference.facilityId,
      kind: "FACILITY",
      hierarchyLevel: "FACILITY",
      parentId,
      unitId: null,
      href: null,
      experienceKeys: node.experienceKeys,
      areas: locationAreas,
      children,
    };
  }

  if (node.reference.kind === "UNIT") {
    const role = node.reference.hierarchyRole;
    const kind =
      role === "FLOOR"
        ? "FLOOR"
        : role === "NEIGHBORHOOD"
          ? "NEIGHBORHOOD"
          : "LEGACY";
    const hierarchyLevel =
      role === "FLOOR"
        ? "LEVEL_1"
        : role === "NEIGHBORHOOD"
          ? "LEVEL_2"
          : "LEGACY";
    const href =
      node.presentation === "ACTIONABLE"
        ? `/unit/${node.reference.unitId}`
        : null;
    return {
      id: node.id,
      label: node.label,
      secondaryLabel: null,
      presentation: node.presentation,
      physicalId: node.reference.unitId,
      kind,
      hierarchyLevel,
      parentId,
      unitId: node.reference.unitId,
      href,
      experienceKeys: node.experienceKeys,
      areas: locationAreas,
      children,
    };
  }

  // SPACE → ROOM. Route to owning Unit with space context query (no new routes).
  const spaceHref =
    node.presentation === "ACTIONABLE"
      ? `/unit/${node.reference.unitId}?space=${encodeURIComponent(node.reference.spaceId)}`
      : null;

  return {
    id: node.id,
    label: node.label,
    secondaryLabel: null,
    presentation: node.presentation,
    physicalId: node.reference.spaceId,
    kind: "ROOM",
    hierarchyLevel: "LEVEL_3",
    parentId,
    unitId: node.reference.unitId,
    href: spaceHref,
    experienceKeys: node.experienceKeys,
    areas: locationAreas,
    children,
  };
}

function collectUnitIds(nodes: readonly LocationsTreeNode[]): string[] {
  const ids = new Set<string>();
  const visit = (node: LocationsTreeNode) => {
    if (
      node.kind === "FLOOR" ||
      node.kind === "NEIGHBORHOOD" ||
      node.kind === "LEGACY"
    ) {
      ids.add(node.physicalId);
    }
    if (node.kind === "ROOM" && node.unitId) {
      ids.add(node.unitId);
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function adaptDepartmentSnapshot(
  snapshot: ProjectionSnapshot,
): LocationsDepartmentSnapshot | null {
  const lens = snapshot.context.request.lens;
  if (lens.mode !== "DEPARTMENT") return null;

  const roots = snapshot.locations.roots.map((root) =>
    adaptNode(root, snapshot.areas, snapshot.experiences, null),
  );

  return {
    departmentId: lens.departmentId,
    departmentKey: lens.departmentKey,
    label: departmentLabel(lens.departmentKey),
    roots,
    actionableLocationIds: [...snapshot.locations.actionableIds],
    unitIds: collectUnitIds(roots),
    plantPolicy: snapshot.plantPolicy ?? null,
  };
}

/**
 * Adapt a Projection snapshot into the Locations place-entry view model.
 * Facility Overview preserves labeled department snapshots — never merges them.
 */
export function adaptProjectionToLocationsView(
  snapshot: ProjectionSnapshot,
): LocationsViewModel {
  const lens = snapshot.context.request.lens;
  const lensMode = lens.mode === "FACILITY" ? "FACILITY" : "DEPARTMENT";
  const lensKey =
    lens.mode === "FACILITY"
      ? "facility"
      : `department:${lens.departmentKey}`;

  let departmentSnapshots: LocationsDepartmentSnapshot[];

  if (lens.mode === "FACILITY") {
    const children = snapshot.facilityOverview?.departmentSnapshots ?? [];
    departmentSnapshots = children
      .map(adaptDepartmentSnapshot)
      .filter((child): child is LocationsDepartmentSnapshot => child != null);
  } else {
    const single = adaptDepartmentSnapshot(snapshot);
    departmentSnapshots = single ? [single] : [];
  }

  const projectedUnitIds = [
    ...new Set(departmentSnapshots.flatMap((dept) => dept.unitIds)),
  ].sort((a, b) => a.localeCompare(b));

  return {
    facilityId: snapshot.context.identity.facilityId,
    purpose: snapshot.context.identity.purpose,
    lensMode,
    lensKey,
    departmentKey: lens.mode === "DEPARTMENT" ? lens.departmentKey : null,
    revision: snapshot.context.identity.revision,
    departmentSnapshots,
    projectedUnitIds,
    diagnostics: snapshot.diagnostics.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
    })),
  };
}
