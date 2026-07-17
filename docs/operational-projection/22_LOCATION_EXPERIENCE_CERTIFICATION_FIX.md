# 22 — Location Experience Certification Fix

**Wave:** Location Experience Certification (post-15G / post-15F correction)  
**Status:** Implemented — Sidebar + Locations share one projected hierarchy  
**Depends on:** Waves 15F (Locations eligibility), 15G (Sidebar adapter), Facility Builder hierarchy

---

## Root causes

### A. Flat Sidebar

`PROJECTION_SIDEBAR_ENABLED` defaulted **off**. AppShell used `getSidebarUnitsForSession()` (flat `Unit[]`). Adapters already preserved Floor → Neighborhood → Room when the flag was on; production never enabled them by default.

### B. Legacy / empty Locations page

Wave 15F filtered Unit IDs into **UnitsManager** but never rendered the projected tree. `/units` always mounted UnitsManager (“Add unit”, display order, log assignment). When Projection returned few or no Unit IDs, the management list looked empty even though Facility Builder had floors, neighborhoods, and rooms.

Rooms were not discarded in adapters; the legacy UI never showed them.

---

## Shared projected location model

```text
ProjectionSnapshot
  → adaptProjectionToLocationsView → LocationsViewModel
  → enrichLocationsRoomDisplay (room numbers; presentation only)
  → LocationsHierarchyBrowser
  → adaptLocationsViewToSidebar → LeftSidebar
```

`LocationsTreeNode` carries:

- `physicalId`, `kind`, `hierarchyLevel`, `parentId`
- `presentation` (ACTIONABLE | STRUCTURAL)
- `href` (null for STRUCTURAL; Unit or Unit+space for ACTIONABLE)
- Areas / Experiences summaries (Locations browser)
- Ordering and ancestry from Projection (no local rebuild)

Sidebar and Locations must not invent eligibility or separate hierarchy logic.

---

## Locations page replacement

When `PROJECTION_LOCATIONS_ENABLED=true`:

- Read-only `LocationsHierarchyBrowser`
- PageHeader: Locations + lens badge
- Manager+ link: “Configure facility structure” → `/admin/facility/builder`
- No Add unit / display order / log assignment / type editing

When flag **off**: complete legacy UnitsManager page (rollback).

### Empty states

| Condition | Copy |
|-----------|------|
| Projection error | Locations are temporarily unavailable. |
| MISSING_ACTIVE_PROFILE + empty | This department does not have an active operational profile. |
| Empty tree | No operational locations are available for this mode. |
| ROOM_UNMAPPED / ORPHAN_BINDING / INVALID_ARCHETYPE | Configuration-gap banner |
| Flag off | Legacy Units page |

---

## Sidebar recursive hierarchy

- Floors / Level 1: STRUCTURAL, expand/collapse, usually not links
- Neighborhoods / Units: STRUCTURAL or ACTIONABLE per Projection
- Rooms: nested under Unit; room number formatting via enrichment
- Indentation + expand/collapse communicate structure
- Default flag: **on** (set `false` to restore flat Unit list)

---

## Actionable vs structural

| Presentation | Behavior |
|--------------|----------|
| STRUCTURAL | Orientation only; `href` null; expand/collapse |
| ACTIONABLE | Link to Unit Workspace; readiness may attach |

---

## Room routing decision

**Chosen:** `/unit/[unitId]?space=[spaceId]`

- No new room routes in this wave
- Query is presentation/context compatibility only until a certified room-routing wave
- Active nav matching uses path without query (`/unit/[unitId]`)

---

## Readiness overlay

Unchanged semantics:

- Attach only to projected Unit ids after Projection
- Failure removes badges only; never broadens the tree
- Structural nodes may show aggregate readiness via owning Unit id when present

Remaining: readiness engine may still query broadly; AppShell filters to projected ids.

---

## Facility Overview

Labeled department sections (Dietary / EVS / Plant). Experiences never merge across departments.

---

## Plant policy

Projection remains authoritative. No local Plant ownership, no UnitSpaceResponsibility rows, no Unit-type eligibility. Plant Experiences stay on policy-covered rooms only.

---

## PIN / employee / locked-device

Narrowing remains Projection `accessClass` (principal construction in `loadProjectedLocationView`). Sidebar lock styling uses `lockedUnitId` overlay only — does not reintroduce visibility.

---

## Feature flag matrix

| Locations | Sidebar | Result |
|-----------|---------|--------|
| off | off | Legacy Units + flat Sidebar |
| on | off | Hierarchy Locations + flat Sidebar |
| off | on | Legacy Units + nested Sidebar |
| on | on | Shared tree; matching hierarchy/eligibility |

No union. No legacy broad data while a flag is on.

Defaults: both **true**.

---

## Legacy UnitsManager boundary

See `src/lib/locations/LEGACY_LOCATION_BOUNDARIES.md`.

- Flag off → `/units` UnitsManager
- Flag on → hierarchy browser only
- Physical edit → Facility Builder only
- Eventually retire UnitsManager from operational Locations after admin workflows migrate

---

## Performance

- One Projection resolve per Locations request
- One Projection resolve per Sidebar request
- Shared request memo when both share a memo scope
- One hierarchy adaptation + scoped room-number Prisma query (projected space ids only)
- No N+1 room queries; no broad Unit load then hide when Locations flag on
- Flag-on Locations page skips UnitsManager templates/log assignment load

---

## Failure behavior

Fail closed:

- Locations: calm unavailable EmptyState
- Sidebar: no location branches + unavailable message
- Never show all Units / Facility Overview fallback / legacy∪Projection

---

## Tests

- `location-experience-certification.test.ts` — hierarchy, room href, ancestry parity, flag matrix
- Existing `locations-cutover.test.ts` / `sidebar-cutover.test.ts` updated for room `?space=` and Sidebar default on
- Feature-flag defaults updated

---

## Known limitations

- `?space=` is not yet a certified Unit Workspace focus contract
- Readiness may still load facility-wide then filter
- UnitsManager still exists for rollback / some admin habits on flag-off
- Facility Overview duplicate physical keys across labeled sections are compared per department for parity

---

## Certification status

**Certified for:** shared projected location tree → Sidebar + Locations hierarchy and eligibility parity, with independent flag rollback.

**Not certified:** room deep-link semantics inside Unit Workspace, Experience Shell, Today’s Work / OC / BW, Facility Builder edits.

---

## Recommended next wave

Room-routing certification inside Unit Workspace (`?space=` → focus), or retire UnitsManager into Administration after bake time.
