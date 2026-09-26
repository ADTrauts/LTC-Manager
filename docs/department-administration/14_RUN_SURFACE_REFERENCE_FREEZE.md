# 14 — Run surface reference freeze

**Status:** Frozen reference (2026-09-25)  
**Implements:** step 17 of [`13_LOCATION_PROGRAMMING_REALIGNMENT.md`](13_LOCATION_PROGRAMMING_REALIGNMENT.md)

These three Run screens stay live. They are **reference, not architecture**. Do not copy their layout, grouping, or copy when steps 20–22 rebuild cards. Do not rewire them in this freeze.

---

## What is frozen

| Run nav | Route | Page | What it is today |
|---|---|---|---|
| **Locations** | `/units` | `src/app/(protected)/units/page.tsx` | **Step 20:** exception-first cards from `RuntimeLocationState.answers`. Frozen hierarchy browser remains in-repo as reference only. |
| **Dashboard** | `/workspace` (`/dashboard` and `/operations` redirect here) | `src/app/(protected)/workspace/page.tsx` | **Step 21:** answers aggregation (overall + where to look). Personal workspace chrome remains around it. |
| **Review** | `/reports` | `src/app/(protected)/reports/page.tsx` | **Step 22:** day Locations replay from RLS answers. Historical evidence / coverage / service tables stay. |

Click-through from Locations goes to `/unit/[unitId]` (neighborhood or space workspace). That workspace now presents the same Runtime Location State answers as the Locations card. Deep links `#coverage` `#evidence` `#assets` `#milestones` land on those sections. Neighborhood rollup aggregates child SPACE answers. Experience shell does not host or decide this route.

---

## Locations (`/units`)

**Load** (still true)

1. `loadLocationsView` — who may see which places (Projection).  
2. `collectActionableLandingSpaces` — SPACE refs.  
3. `loadRuntimeLocationStates` — one batch.

**Step 20 presentation** (live)

4. `presentExceptionFirstLocationBoard` — cards from `answers` only.  
5. Sort: at risk → on time → ready → idle → unprogrammed.  
6. Card: name, muted place (neighborhood · floor · Facility type), pace badge, happening / cycle, responsible (team · filled of need), up to two wrong labels, one evidence-due line, next. Whole card → `/unit/[unitId]?space=…`.  
7. `presentLandingSpace` still feeds neighborhood / space workspace. Do not use `LocationsHierarchyBrowser` as the Locations product.

**Frozen reference** (do not copy)

- Nested hierarchy as the primary Run Locations product (`src/components/locations-hierarchy-browser.tsx`).  
- “Operational Type not assigned” as the configuration story (Facility type + Location Program replace Role).  
- Stacking a full operational dump on every tree node.

Flag off (`PROJECTION_LOCATIONS`) still falls back to legacy `UnitsManager`. Keep that rollback; do not design the new card from it.

---

## Dashboard (`/workspace`)

**Load**

1. `loadDashboardRuntime` → same Projection SPACE set → one `loadRuntimeLocationStates` → `presentDashboardWorkspace`.  
2. Then either projected `assembleProjectedBusinessWorkspace` or legacy `loadBusinessWorkspace`.  
3. Render `BusinessWorkspaceScreen`.

**Show**

- Runtime strip: current operation, attention count, coverage sentence, next event, intervention list, upcoming list.  
- Workspace chrome around it: focus cards, agenda buckets, quick actions, department cards, metrics, activity.  
- Interventions link into `/unit/[unitId]?space=…#section`.

**Do not copy**

- A second dashboard that restacks 17 location cards.  
- Mixing personal workspace chrome with location state as one object.  
- Re-querying logs / coverage / cycles inside the page.

---

## Review (`/reports`)

**Load**

- Canonical day: `loadOperationalReviewDay` → `presentOperationalReviewDay`.  
- Range: `loadOperationalReviewRange` → `presentOperationalReviewRange`.  
- `?view=legacy` still renders `LegacyReport`.

**Show**

- Day tables: evidence (location, requirement, window, status), coverage slots, presence, milestones.  
- Range totals across service dates.  
- Day view loads `loadRuntimeLocationStates` for the selected service date and overlays Locations rows from that object. Historical evidence / coverage / service tables stay on the Review compose until step 22.

**Do not copy**

- Review as a reprint of the Locations tree or Dashboard strip.  
- Replacing the historical tables with live RLS. Step 22 replays a **past** service date from the same state model.

---

## Runtime Location State — already exists, wrong program input

`src/lib/runtime-location-state` already answers today for Locations and Dashboard:

- what is happening (operation / next)  
- coverage slots  
- evidence due  
- assets / issues  
- exceptions  

`RuntimeLocationState.program` now carries the composed Location Program (teams, team × cycle need, Facility type, logs, assets). Operational Type remains a legacy sidecar for cycle / evidence engines that still key off it.

Step 18 landed that rewire. Steps 20–22 replaced Locations / Dashboard / Review presentation. Frozen files stay as reference only.

---

## Locked after 20–22

- Do not copy the frozen hierarchy / OT / dump.  
- Dashboard stays an aggregation, not 17 stacked cards.  
- Review day Locations stay a past-date replay of the same state.  
- Experience keys are retired (step 25). The location workspace reads this same state. Operation engine and Experience shell are deleted. Leftover catalog is not a product registry.
