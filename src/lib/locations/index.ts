/**
 * Wave 15F — Locations Experience (Projection cutover).
 *
 * Projection Runtime → Location Projection Adapter → Locations View Model
 * → existing Locations UI (`/units`).
 *
 * Sidebar eligibility remains legacy until Wave 15G.
 */

export type {
  LocationsAreaRef,
  LocationsDepartmentSnapshot,
  LocationsExperienceRef,
  LocationsLensMode,
  LocationsTreeNode,
  LocationsViewModel,
} from "./types";

export { adaptProjectionToLocationsView } from "./adapt-projection";

export {
  loadLocationsView,
  type LoadLocationsViewOptions,
  type LoadLocationsViewResult,
} from "./load-locations";

export {
  collectProjectedUnitIds,
  loadUnitsPageData,
  type UnitsPageData,
  type UnitsPageUnitRow,
} from "./load-units-page";
