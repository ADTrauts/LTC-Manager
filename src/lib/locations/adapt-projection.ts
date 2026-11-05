/**
 * Wave Location Certification — adapt ProjectionSnapshot → LocationsViewModel.
 *
 * Pure hierarchy adaptation. Room-number enrichment happens in a separate
 * presentation pass (does not change Projection).
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import {
  shouldPresentDepartmentOnCustomerCurrentSurface,
  type DepartmentPresentationAudience,
} from "@/lib/department-products/eligibility";
import type {
  ProjectionLocationNode,
  ProjectionSnapshot,
} from "@/lib/projection";

import type {
  LocationsDepartmentSnapshot,
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

function adaptNode(
  node: ProjectionLocationNode,
  parentId: string | null,
): LocationsTreeNode {
  const children = node.children.map((child) => adaptNode(child, node.id));

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
      children,
    };
  }

  if (node.reference.kind === "UNIT") {
    const role = node.reference.hierarchyRole;
    const kind =
      role === "BUILDING"
        ? "BUILDING"
        : role === "FLOOR"
          ? "FLOOR"
          : role === "NEIGHBORHOOD"
            ? "NEIGHBORHOOD"
            : "LEGACY";
    const hierarchyLevel =
      role === "BUILDING"
        ? "LEVEL_0"
        : role === "FLOOR"
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
    children,
  };
}

function collectUnitIds(nodes: readonly LocationsTreeNode[]): string[] {
  const ids = new Set<string>();
  const visit = (node: LocationsTreeNode) => {
    if (
      node.kind === "BUILDING" ||
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

export type AdaptLocationsViewOptions = {
  audience?: DepartmentPresentationAudience;
};

function facilityOverviewChildProductKey(snapshot: ProjectionSnapshot): string | null {
  const lens = snapshot.context.request.lens;
  return lens.mode === "DEPARTMENT" ? lens.departmentKey : null;
}

function adaptDepartmentSnapshot(
  snapshot: ProjectionSnapshot,
): LocationsDepartmentSnapshot | null {
  const lens = snapshot.context.request.lens;
  if (lens.mode !== "DEPARTMENT") return null;

  const roots = snapshot.locations.roots.map((root) =>
    adaptNode(root, null),
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
  options?: AdaptLocationsViewOptions,
): LocationsViewModel {
  const audience = options?.audience ?? "customer";
  const lens = snapshot.context.request.lens;
  const lensMode = lens.mode === "FACILITY" ? "FACILITY" : "DEPARTMENT";
  const lensKey =
    lens.mode === "FACILITY"
      ? "facility"
      : `department:${lens.departmentKey}`;

  let departmentSnapshots: LocationsDepartmentSnapshot[];

  if (lens.mode === "FACILITY") {
    const children = (snapshot.facilityOverview?.departmentSnapshots ?? []).filter(
      (child) =>
        shouldPresentDepartmentOnCustomerCurrentSurface(
          facilityOverviewChildProductKey(child),
          audience,
        ),
    );
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
