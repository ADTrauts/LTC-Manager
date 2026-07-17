# 17 — Wave 15G Sidebar Cutover

Status: **implemented** (feature-flagged).  
Prior Locations cutover: Wave 15F (`purpose: LOCATIONS`).

---

## Integration path

```text
Trusted session / principal
  → resolveProjectionRuntime({ purpose: "SIDEBAR", lens, principal })
  → ProjectionSnapshot
  → adaptProjectionToLocationsView  (shared eligibility tree)
  → adaptLocationsViewToSidebar     (presentation DTO + vocabulary)
  → readiness overlay (projected Unit ids only)
  → LeftSidebar
```

Package: `src/lib/locations/`  
Shell: `src/components/app-shell.tsx`  
UI: `src/components/left-sidebar.tsx`

---

## Shared Locations / Sidebar eligibility

Both consumers use the same `LocationsViewModel` from `adaptProjectionToLocationsView`.

| Consumer | Purpose | Adapter |
|----------|---------|---------|
| Locations `/units` | `LOCATIONS` | `loadUnitsPageData` |
| Sidebar rail | `SIDEBAR` | `adaptLocationsViewToSidebar` |

No separate department filters, Plant branches, or staged-room rules in Sidebar.

Request-scoped memoization is available when both purposes resolve in one request (distinct memo keys by purpose).

---

## Actionable vs structural

| Presentation | Sidebar behavior |
|--------------|------------------|
| `ACTIONABLE` | Navigable link to `/unit/[unitId]` |
| `STRUCTURAL` | Orientation label only (`href: null`) |

Projection decides presentation. Empty branches remain pruned by the pipeline.

---

## Room presentation and routing

- No `/room/[id]` or `/unit/.../space/...` routes in this wave.
- Projected rooms link to the owning Unit: `/unit/[unitId]`.
- Structural Floors / Neighborhoods are non-route containers.

---

## Department lens

Active department (cookie / shell resolution) drives `DEPARTMENT` lens.  
Dietary / EVS / Plant each see only their projected tree.  
Missing lens / Projection error → fail closed (empty), never Facility Overview fallback.

---

## Facility Overview

Entitled facility-admin “all departments” uses `FACILITY` lens.  
Sidebar renders **labeled** department sections. Experiences / Areas are not flattened into one union body.

---

## Plant policy

Plant coverage comes from Projection `plantPolicy`.  
Sidebar never invents responsibilities, ownership, or Dietary/EVS Experiences.

---

## PIN / employee / locked device

- `allowedUnitIds` / `lockedUnitId` are passed on the Projection request.
- Device lock still disables non-locked Unit destinations in the UI.
- Direct route authorization remains server-side (unchanged).

---

## Readiness overlay

- Live readiness engine unchanged.
- Overlay attaches only to projected Unit ids.
- Readiness failure keeps the projected tree and omits badges (does not broaden locations).
- Known limitation: underlying readiness query may still load facility-wide inputs; display is filtered.

---

## Vocabulary

Level labels use `resolveFacilityVocabulary` (Floor / Neighborhood / Room, or hospital/hotel/campus/custom).

---

## Feature flag and rollback

| Flag | Default | Behavior |
|------|---------|----------|
| `PROJECTION_SIDEBAR_ENABLED` | **false** | Off → legacy `getSidebarUnitsForSession` only |
| | | On → Projection only; **no union** with legacy |

Rollback: set `PROJECTION_SIDEBAR_ENABLED=false`.

---

## Failure behavior

On Projection failure with flag on:

- empty location sections + calm “Locations temporarily unavailable”;
- non-location shell / top nav preserved;
- never show every Unit;
- never switch to Facility Overview;
- never serve legacy ∪ Projection.

---

## Legacy code

**Removed from Sidebar path when flag on:** calling `getSidebarUnitsForSession` for eligibility.

**Retained:** `getSidebarUnitsForSession` for flag-off rollback; `operationalUnitWhere` for other surfaces; Unit Workspace; auth/PIN helpers. See `src/lib/locations/LEGACY_UNTIL_SIDEBAR.md`.

---

## Known limitations

- Top navigation is not Area→Experience (later wave).
- Room deep-links are Unit-compatible only.
- Readiness query scoping is attach-filter only (engine redesign out of scope).
- Flag defaults off until operators enable cutover.

---

## Next consumer wave

Recommended: **Unit Workspace** Projection focus + Experience panels (program Wave after Sidebar bake), or enable `PROJECTION_SIDEBAR_ENABLED` in staging then production.
