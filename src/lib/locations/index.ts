/**
 * Wave 15F/15G — Locations + Sidebar Projection consumers.
 *
 * Shared eligibility: ProjectionSnapshot → LocationsViewModel
 * Locations (15F): purpose LOCATIONS → Units page
 * Sidebar (15G): purpose SIDEBAR → LeftSidebar tree
 */

export type {
  LocationsAreaRef,
  LocationsDepartmentSnapshot,
  LocationsExperienceRef,
  LocationsLensMode,
  LocationsTreeNode,
  LocationsViewModel,
} from "./types";

export type {
  ProjectedSidebarNode,
  ProjectedSidebarSection,
  SidebarProjectionView,
  SidebarReadinessByUnitId,
} from "./sidebar-types";

export { adaptProjectionToLocationsView } from "./adapt-projection";
export {
  adaptLocationsViewToSidebar,
  sidebarProjectedUnitIds,
} from "./adapt-sidebar";

export {
  loadLocationsView,
  type LoadLocationsViewOptions,
  type LoadLocationsViewResult,
} from "./load-locations";

export {
  loadProjectedLocationView,
  resolveSessionProjection,
  emptyProjectedLocationView,
  type LoadProjectedLocationOptions,
  type LoadProjectedLocationResult,
  type ResolveSessionProjectionResult,
} from "./load-projected-location";

export {
  loadSidebarProjection,
  type LoadSidebarProjectionOptions,
  type LoadSidebarProjectionResult,
} from "./load-sidebar";

export {
  collectProjectedUnitIds,
  loadUnitsPageData,
  type UnitsPageData,
  type UnitsPageUnitRow,
} from "./load-units-page";
