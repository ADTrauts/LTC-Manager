/**
 * Wave 15F + 15G — Locations / Sidebar Projection cutover status.
 *
 * Documentation only.
 */

/**
 * CUT OVER (Wave 15F — Locations)
 * --------------------------------
 * - `/units` unit visibility → Projection Runtime (purpose LOCATIONS)
 * - Shared LocationsViewModel tree
 * - Flag: PROJECTION_LOCATIONS_ENABLED (default on)
 *
 * CUT OVER (Wave 15G — Sidebar)
 * -----------------------------
 * - AppShell Locations rail → Projection Runtime (purpose SIDEBAR)
 * - Shared LocationsViewModel → adaptLocationsViewToSidebar → LeftSidebar
 * - Flag: PROJECTION_SIDEBAR_ENABLED (default **off**)
 * - When flag on: `getSidebarUnitsForSession` is **not** called (no union)
 * - Readiness overlays attach only to projected Unit ids
 * - Fail closed: empty tree + calm unavailable copy; never Facility Overview fallback
 *
 * RETIRED FROM SIDEBAR PATH (when flag on)
 * ----------------------------------------
 * - Sidebar eligibility via `getSidebarUnitsForSession` / `operationalUnitWhere`
 * - Duplicate PIN filtering as Sidebar eligibility (Projection accessClass owns it)
 * - Broad Unit list → hide in component
 *
 * RETAINED LEGACY DEPENDENCIES
 * ----------------------------
 * | Dependency | Why retained | Retirement |
 * |------------|--------------|------------|
 * | `getSidebarUnitsForSession` | Flag-off rollback path | After Sidebar flag defaults on + bake time |
 * | `operationalUnitWhere` | Sidebar rollback + non-nav surfaces | Keep for Facility Builder / admin |
 * | `employee-units.ts` | Principal construction + auth routes | Keep (Projection consumes allowlist) |
 * | Unit Workspace loaders | Separate wave | Unit Workspace cutover |
 * | Shadow Mode harness | Parity diagnostics | Optional after both consumers stable |
 * | Top-nav Area→Experience | Not this wave | Experience Shell / nav waves |
 * | Readiness engine facility-wide query | Rules unchanged; attach filtered | Later readiness projection wave |
 *
 * SHARED ELIGIBILITY
 * ------------------
 * ProjectionSnapshot
 *   → adaptProjectionToLocationsView (shared tree)
 *   → Locations: loadUnitsPageData
 *   → Sidebar: adaptLocationsViewToSidebar → LeftSidebar
 */
