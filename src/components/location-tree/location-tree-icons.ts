import {
  Building2,
  DoorOpen,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

import type { LocationTreeKind } from "./location-tree-tokens";

/** Kind icons shared with Facility Builder Structure tree. */
export function locationTreeKindIcon(kind: LocationTreeKind): LucideIcon {
  if (kind === "floor") return Building2;
  if (kind === "neighborhood") return LayoutGrid;
  return DoorOpen;
}
