/**
 * Presentation enrichment for room numbers after Projection adaptation.
 * Does not change eligibility, hierarchy, or Projection truth.
 */

import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";
import { prisma } from "@/lib/prisma";

import type { LocationsTreeNode, LocationsViewModel } from "./types";

function collectSpaceIds(nodes: readonly LocationsTreeNode[]): string[] {
  const ids = new Set<string>();
  const visit = (node: LocationsTreeNode) => {
    if (node.kind === "ROOM") ids.add(node.physicalId);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return [...ids];
}

function enrichNode(
  node: LocationsTreeNode,
  roomMeta: Map<string, { name: string; roomNumber: string | null }>,
): LocationsTreeNode {
  const children = node.children.map((child) => enrichNode(child, roomMeta));
  if (node.kind !== "ROOM") {
    return children === node.children ? node : { ...node, children };
  }

  const meta = roomMeta.get(node.physicalId);
  if (!meta) {
    return children === node.children ? node : { ...node, children };
  }

  const roomNumber = meta.roomNumber?.trim() || null;
  const label = formatRoomDisplayName({
    name: meta.name || node.label,
    roomNumber,
  });

  return {
    ...node,
    label,
    secondaryLabel: roomNumber,
    children,
  };
}

/**
 * Apply Facility Builder room numbers / display names onto ROOM nodes.
 * Scoped Prisma query — only projected space ids.
 */
export async function enrichLocationsRoomDisplay(
  view: LocationsViewModel,
): Promise<LocationsViewModel> {
  const spaceIds = [
    ...new Set(
      view.departmentSnapshots.flatMap((dept) => collectSpaceIds(dept.roots)),
    ),
  ];
  if (spaceIds.length === 0) return view;

  const spaces = await prisma.unitSpace.findMany({
    where: {
      facilityId: view.facilityId,
      id: { in: spaceIds },
    },
    select: { id: true, name: true, roomNumber: true },
  });

  const roomMeta = new Map(
    spaces.map((space) => [
      space.id,
      { name: space.name, roomNumber: space.roomNumber },
    ]),
  );

  return {
    ...view,
    departmentSnapshots: view.departmentSnapshots.map((dept) => ({
      ...dept,
      roots: dept.roots.map((root) => enrichNode(root, roomMeta)),
    })),
  };
}
