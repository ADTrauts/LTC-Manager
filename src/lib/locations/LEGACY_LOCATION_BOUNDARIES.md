/**
 * Location Experience Certification — shared Projection tree for Sidebar + Locations.
 *
 * Documentation only.
 */

/**
 * CERTIFIED (this wave)
 * ---------------------
 * - One shared LocationsViewModel tree from Projection (purpose LOCATIONS / SIDEBAR)
 * - `/units` renders read-only LocationsHierarchyBrowser when PROJECTION_LOCATIONS_ENABLED
 * - LeftSidebar renders recursive Floor → Neighborhood → Room when PROJECTION_SIDEBAR_ENABLED
 * - Both consume adaptProjectionToLocationsView; Sidebar only maps presentation
 * - Room href: `/unit/[unitId]?space=[spaceId]` (no dedicated room route)
 * - Defaults: both flags **on**; either can roll back independently
 *
 * LEGACY UNITS MANAGEMENT BOUNDARY
 * --------------------------------
 * | When | What renders | Route |
 * |------|--------------|-------|
 * | `PROJECTION_LOCATIONS_ENABLED=false` | UnitsManager (Add unit, display order, log assignment) | `/units` |
 * | `PROJECTION_LOCATIONS_ENABLED=true` | LocationsHierarchyBrowser (read-only) | `/units` |
 *
 * UnitsManager remains for flag-off rollback only. It is not the projected Locations UI.
 * Physical configuration belongs in Administration → Facility Builder.
 * Department operational configuration belongs in Administration → Departments.
 * After certification bake time, UnitsManager should move fully under Administration
 * (or retire) once no admin workflow still depends on `/units` editing.
 *
 * FLAG MATRIX (no union)
 * ----------------------
 * | Locations | Sidebar | Behavior |
 * |-----------|---------|----------|
 * | off | off | Legacy Units page + flat Unit Sidebar |
 * | on | off | Hierarchy Locations + flat Unit Sidebar |
 * | off | on | Legacy Units page + nested Projection Sidebar |
 * | on | on | Shared tree; hierarchy + eligibility match |
 *
 * SHARED PATH
 * -----------
 * ProjectionSnapshot
 *   → adaptProjectionToLocationsView
 *   → enrichLocationsRoomDisplay (presentation only)
 *   → Locations: LocationsHierarchyBrowser
 *   → Sidebar: adaptLocationsViewToSidebar → LeftSidebar
 *
 * RETAINED LEGACY
 * ---------------
 * | Dependency | Why | Retirement |
 * |------------|-----|------------|
 * | UnitsManager | Locations flag-off | After admin cutover |
 * | getSidebarUnitsForSession | Sidebar flag-off | After bake time |
 * | loadUnitsPageData templates/logs | Flag-off only | With UnitsManager |
 * | Readiness facility-wide query | Attach filtered to projected ids | Later readiness wave |
 */
