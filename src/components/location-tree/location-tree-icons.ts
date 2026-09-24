import {
  Building2,
  DoorOpen,
  Layers,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

import type { LocationTreeKind } from "./location-tree-tokens";

/** Kind icons shared with Facility Builder Structure tree. */
export function locationTreeKindIcon(kind: LocationTreeKind): LucideIcon {
  if (kind === "building") return Building2;
  if (kind === "floor") return Layers;
  if (kind === "neighborhood") return LayoutGrid;
  return DoorOpen;
}
