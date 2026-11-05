/**
 * ProjectionSnapshot → Today's Work eligibility.
 * Does not rank work, compute readiness, or invent locations.
 */

import {
  shouldPresentDepartmentOnCustomerCurrentSurface,
  type DepartmentPresentationAudience,
} from "@/lib/department-products/eligibility";
import type { ProjectionLocationNode, ProjectionSnapshot } from "@/lib/projection";

import type { TodaysWorkProjectionView } from "./types";

function collectUnitIdsFromTree(roots: readonly ProjectionLocationNode[]): {
  allUnitIds: Set<string>;
  actionableUnitIds: Set<string>;
} {
  const allUnitIds = new Set<string>();
  const actionableUnitIds = new Set<string>();

  const visit = (node: ProjectionLocationNode) => {
    const ref = node.reference;
    if (ref.kind === "UNIT" || ref.kind === "SPACE") {
      allUnitIds.add(ref.unitId);
      if (node.presentation === "ACTIONABLE") {
        actionableUnitIds.add(ref.unitId);
      }
    }
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return { allUnitIds, actionableUnitIds };
}

function facilityOverviewChildProductKey(snapshot: ProjectionSnapshot): string | null {
  const lens = snapshot.context.request.lens;
  return lens.mode === "DEPARTMENT" ? lens.departmentKey : null;
}

export function adaptProjectionToTodaysWork(
  snapshot: ProjectionSnapshot,
  error: string | null = null,
  options?: { audience?: DepartmentPresentationAudience },
): TodaysWorkProjectionView {
  const audience = options?.audience ?? "customer";
  const lens = snapshot.context.request.lens;
  const lensMode = lens.mode === "FACILITY" ? "FACILITY" : "DEPARTMENT";
  const lensKey =
    lens.mode === "FACILITY"
      ? "facility"
      : `department:${lens.departmentKey}`;

  const allUnitIds = new Set<string>();
  const actionableUnitIds = new Set<string>();

  if (lens.mode === "FACILITY") {
    const children = (snapshot.facilityOverview?.departmentSnapshots ?? []).filter(
      (child) =>
        shouldPresentDepartmentOnCustomerCurrentSurface(
          facilityOverviewChildProductKey(child),
          audience,
        ),
    );
    for (const child of children) {
      const collected = collectUnitIdsFromTree(child.locations.roots);
      collected.allUnitIds.forEach((id) => allUnitIds.add(id));
      collected.actionableUnitIds.forEach((id) => actionableUnitIds.add(id));
    }
  } else {
    const collected = collectUnitIdsFromTree(snapshot.locations.roots);
    collected.allUnitIds.forEach((id) => allUnitIds.add(id));
    collected.actionableUnitIds.forEach((id) => actionableUnitIds.add(id));
  }

  const projectedUnitIds = [...allUnitIds].sort((a, b) => a.localeCompare(b));
  const actionableSorted = [...actionableUnitIds].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    facilityId: snapshot.context.identity.facilityId,
    lensMode,
    lensKey,
    projectedUnitIds,
    actionableUnitIds:
      actionableSorted.length > 0 ? actionableSorted : projectedUnitIds,
    error,
  };
}
