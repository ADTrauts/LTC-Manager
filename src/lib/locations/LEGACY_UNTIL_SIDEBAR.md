/**
 * Wave 15F — Locations cutover: remaining legacy until Sidebar (15G).
 *
 * Documentation only. Do not delete Sidebar loaders in this wave.
 */

/**
 * CUT OVER (Wave 15F)
 * -------------------
 * - `/units` (Locations zone) unit visibility → Projection Runtime (purpose LOCATIONS)
 * - Location Projection Adapter → LocationsViewModel
 * - `operationalUnitWhere` removed from the Locations page loader path when
 *   `PROJECTION_LOCATIONS_ENABLED` is on (default)
 * - One Projection resolve; Prisma only for projected Unit ids
 * - Fail closed on Projection failure (empty list — never legacy broaden)
 *
 * REMAINS LEGACY UNTIL WAVE 15G (Sidebar)
 * ---------------------------------------
 * - `getSidebarUnitsForSession` / `getActiveSidebarUnits` in `src/lib/units.ts`
 * - `AppShell` → `LeftSidebar` still loads flat SidebarUnit[] via legacy path
 * - PIN/employee unit restrictions still applied in Sidebar loader (not Projection)
 * - Readiness chips on Sidebar still keyed by legacy unit list
 * - `operationalUnitWhere` still used by Sidebar and any non-Locations surfaces
 *
 * SAFE TO DELETE AFTER SIDEBAR CUTOVER (15G)
 * ------------------------------------------
 * - Sidebar use of `operationalUnitWhere` for eligibility (keep for other admin
 *   surfaces only if still needed)
 * - Duplicate employee unit filtering once Projection accessClass covers PIN
 * - Shadow Mode locations/sidebar parity gates once both consumers are live
 *
 * DO NOT DELETE YET
 * -----------------
 * - Shadow Mode harness (15E) — still useful for Sidebar parity
 * - Facility Builder `operationalUnitWhere` helpers — used outside Locations
 * - UnitsManager configuration UI — unchanged; only its unit set is projected
 */
