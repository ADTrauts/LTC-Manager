# 13 — Location Programming realignment

**Status:** Locked product plan (2026-09-24)  
**Supersedes, for Department Builder programming:** peer tabs for Coverage and Operational Cycles; Locations as a Role / Experience inspector; a second Department “how we use this room” catalog.

Older documents in this folder (`02`–`05`, `07`, `09`) still describe Operational Areas, Experiences, and Room Archetypes as the director-facing model. Treat those as historical. This file is what we build toward.

Do not implement from this document until the next ACT prompt names a phase.

---

## Locked model

A room stays a room. Facility Builder already said what it is and where it sits. Department Builder **adds Dietary’s (or EVS’s, or Plant’s) operating pieces onto that room**.

```text
Facility room
  3A Servery exists. Facility typed it Servery.
  Dietary is responsible.

Department attachments  (the Location Program)
  Teams that work here
  Cycles those teams run
  How many people each team needs in each cycle
  Logs on the room (or on an asset in the room)
  Assets already placed here

Today (Run)
  Which cycle is open
  Who is assigned
  What evidence is due
  What is wrong
```

Same three layers as the pipeline: **Location → Location Program → Runtime Location State**. The program is the attachment list plus provenance. It is not Experiences.

**Builders define capabilities. Teams and Locations decide what applies. Run materializes today.**

---

## Department Builder information architecture

Three tabs only:

| Tab | Job |
|---|---|
| **Overview** | Who this department is |
| **Locations** | Rooms Facility already assigned. Inspect and attach room-level things (logs; see which teams/cycles landed). |
| **Teams** | People-groups, their rooms, their day parts, headcount need per day part |

**Gone as peer tabs:** Coverage, Operational Cycles.

Logs stay in Log Builder. Assets stay in Asset Builder. Employees’ *today* stay on Run. Those are not Department Builder tabs.

---

## Teams workspace (the operating builder)

Laid out like Facility Builder: **team list → selected team panel**. This is the first working view after Overview.

On a team the director sets:

1. Manager  
2. Rooms this team works (or “all rooms of this Facility room type”)  
3. Cycles this team runs  
4. Need per cycle: count + grain (`total` or `per room` the team covers)

Example — Dietary Servery Team:

```text
Rooms: the 17 serveries
Cycles:
  Breakfast   5:30–10:00   need 1 / room
  Lunch                    need 1 / room
  Dinner                   need 1 / room
```

Culinary Team: Main Kitchen, same Dietary Breakfast, `5 total`.  
Retail Team: Retail, its own windows.  
EVS Unit Team: Day / Overnight, not meals.  
Laundry Team: Day 3 total.  
Plant: a team with **no** cycles and **no** need is valid.

### Cycles are department-owned, opened from a team

Breakfast is one Dietary cycle, not one cycle per team.

- First team that needs Breakfast **creates** it in this panel: name, hours, days, phases / key times, rooms. That is the existing timeline editor — it does not get a fourth tab.  
- Other teams **link** Breakfast and type their own need.  
- Creating a second “Breakfast” for Culinary is not allowed.

Staffing is a row on **team × cycle**. Coverage is that row. There is no Coverage document.

### Where “Breakfast” comes from

It is not a platform meal clock. It is a name this department put on an Operational Cycle. EVS writes Day / Evening / Overnight. Plant may write nothing. Run asks: which of *this department’s* cycles is open right now?

---

## Locations tab

Rooms Dietary is responsible for. Flat list; place as muted text (neighborhood · floor · Facility type).

Room modal:

- Place + Facility type + this department is responsible  
- Teams that work here (derived from team room membership)  
- Cycles that landed here (from those teams / explicit room placement)  
- Staffing need (derived)  
- Logs: add to this room, or see logs on assets in this room  
- Assets: read-only from Asset Builder  

No “How we use this room” / Role dropdown. Facility type already said Servery.

**By Facility room type** (not “By role”): attach defaults once for all Dietary Serveries; one room can override. Provenance on every row: inherited from type vs added on this room.

---

## What Experiences and Role are now

**Experiences** (Meal Service, Meal Times, ARCHETYPE badges) are a platform module catalog and Run projection input. They are **not** something a director adds onto a room. Hide them from the Locations modal. Do not delete the registry in this phase — Run still keys off archetype bindings. Do not design programming around them.

**Role / Operational Type / How we use this room** was a second use catalog. Stop teaching it. Facility room type is the bulk grouping key. Department-scoped attachments on that type (Dietary’s Servery defaults) are how 17 serveries share Breakfast without a second type object.

Keep existing binding tables in the database until Run no longer requires them, so Locations / Dashboard do not go blank.

---

## Coverage, named plainly

> During this department cycle, this team needs N people, total or per room they cover.

Build = the need.  
Run = who filled it today.

Not a tab. Not a named person. Not required for Plant.

---

## Pipeline (unchanged order)

1. Freeze current Run UX as reference, not architecture.  
2. Build configuration (this IA).  
3. Location Program = attachments + provenance.  
4. Runtime Location State (one object for Locations, Dashboard, Review).  
5. Location card / workspace (exception-first).  
6. Dashboard as aggregation of that state.  
7. Review as “what happened” from the same state.

Prove on **3A Servery + Retail + Main Kitchen** before the other serveries.

---

## Full step list

Do these in order. Do not start a later number until the earlier one is done. Prove Dietary on **3A Servery, Retail, Main Kitchen** before expanding to the other serveries.

### Now (contract)

0. This document is the locked plan. Do not invent another layer.

### Department Builder — stop teaching the old program

1. Strip the Locations room modal: remove Role / How we use this room, remove the Experiences list, keep Facility type + place as facts.
2. Leave archetype bindings and the Experience registry in the database so Run does not go blank.
3. Change primary nav to **Overview · Locations · Teams**. Hide Coverage and Operational Cycles from the bar; keep deep links until their data has a new home.
4. Rebuild Teams as list + panel (Facility Builder grammar): name, manager, rooms (or all rooms of a Facility type).

### Department Builder — program on the team

5. From a team panel, **create** a department cycle (name, hours, days, phases / key times, rooms). Timeline editor opens here, not on a Cycles tab.
6. From a team panel, **link** an existing department cycle. Two teams may share Breakfast. Do not create a second Breakfast.
7. On each team × cycle row, set staffing need: count + grain (`total` or `per room`). Plant may leave this empty.
8. Stop authoring on the Coverage tab. That tab is the need row in step 7.
9. After 5–8 work, remove Coverage and Operational Cycles from primary IA entirely.

### Department Builder — program on the room

10. Locations list stays flat (name + muted neighborhood · floor · Facility type).
11. Room modal shows derived teams, cycles, and need (from team membership), with provenance.
12. Room modal can add or remove a **log** on that room. Logs on an asset in the room also show here.
13. Room modal shows **assets** read-only (Asset Builder).
14. Add Facility room type defaults (department-scoped): attach a log or cycle once to Dietary Servery; 17 rooms inherit; one room can override. Provenance stays visible.
15. Do not put named employees on the room. That is Run.

### Location Program (read model)

16. Compose one inspectable Location Program per department room: place, Facility type, teams, cycles, need, logs, assets, provenance. No Experiences in this object for directors.

### Run — one daily state

17. Freeze current Run Locations / Dashboard / Review as reference only. Do not copy their structure. **Done:** [`14_RUN_SURFACE_REFERENCE_FREEZE.md`](14_RUN_SURFACE_REFERENCE_FREEZE.md).
18. Build Runtime Location State from the Location Program + today’s assignments, clock, logs, and issues. One object. Locations, Dashboard, and Review all read it. **Done** (2026-09-25): `RuntimeLocationState.program.locationProgram`; coverage from team × cycle need with template fallback; Locations / Dashboard treat empty program (not missing Operational Type) as unconfigured; Review day loads the same RLS object for the selected date.
19. That object answers: what is happening, who is responsible, which cycle is open, ready / on time / at risk, what evidence is due, what is wrong, what is next. **Done** (2026-09-25): `RuntimeLocationState.answers` — happening, responsible (teams / assigned / need), open cycle, pace (`ready` | `on_time` | `at_risk` | `idle`), evidence due, wrong, next. Not a health score. Not a card.

### Run — surfaces

20. Redesign the Location card from that object (exception-first). Click through to the full location workspace. **Done** (2026-09-25): `/units` presents `answers` as a sorted exception-first list (`presentExceptionFirstLocationBoard`). Click-through is `/unit/[unitId]?space=…` (first wrong deep-links `#coverage` / `#evidence` / `#assets` / `#milestones`). Hierarchy browser stays in-repo as freeze reference only.
21. Rebuild Dashboard as an aggregation of the same objects (overall state + where to look). Do not stack 17 giant cards. **Done** (2026-09-25): `presentDashboardWorkspace` reads `answers` — pace counts, one look-at per at-risk room, next. Personal workspace chrome stays separate.
22. Rebuild Review as “what happened” for a past service date from the same state (planned vs assigned vs actual, evidence, issues). **Done** (2026-09-25): day Review Locations is `presentReviewLocationsFromRuntime` (happened, planned vs actual, issues). Historical evidence / coverage / service tables remain the day record.

### Expand and retire leftovers

23. After 3A / Retail / Kitchen are clean, apply the same program across the rest of Dietary, then EVS, then Plant. **Done** (2026-09-25): Locations shows remaining rooms by Facility type and can add them to the team that already works that type. Same path for EVS and Plant — no department-specific wiring.
24. When Run no longer needs archetype bindings to show a room, stop writing Role bindings and hide leftover Areas / Archetypes / Room Types / Coverage / Cycles routes. **Done** (2026-09-25): Role bind/create/assign actions refuse writes. Leftover `?tab=` routes redirect into Overview / Locations / Teams.
25. **Retired (2026-09-25):** Experience keys are not internal platform wiring. The location workspace reads Runtime Location State. Cycle / evidence engines key off Location Program. Projection scope is responsibility. Operation engine and Experience shell are deleted. Do not seed new departments from the leftover catalog. See [`../platform-vision/RETIRED.md`](../platform-vision/RETIRED.md).

---

## Implementation phases

### Phase 0 — Contract only

This document. No new theory. No code. Steps 0.

### Phase 1 — Stop the second “use”

- Locations modal: remove Role / How we use this room / Experiences list.  
- Show Facility type as a fact.  
- Leave bindings in the database.  
- Do not add attach UI yet.

### Phase 2 — Three-tab shell

- Primary nav: Overview, Locations, Teams.  
- Coverage and Operational Cycles drop from the primary bar (keep deep links until data is moved).  
- Teams workspace: list + panel (Facility Builder grammar).

### Phase 3 — Cycles and need on the team

- From a team: create cycle, or link an existing department cycle.  
- Timeline editor (phases, key times, rooms) opens in the team panel.  
- Staffing row: count + grain.  
- Same cycle identity shared across teams.  
- Coverage tab stops being the authoring surface.

### Phase 4 — Locations as attach / inspect

- Room modal: add/remove logs; show teams, cycles, need, assets with provenance.  
- Optional: Facility room type defaults for logs (and later cycles) so 17 serveries are not edited one by one.  
- Employees still not authored here.

### Phase 5 — Runtime object, then cards

- One daily location state from attachments + Run assignments.  
- Location card exception-first.  
- Dashboard aggregates. Review replays.  
- Only after Phases 2–4.

---

## Current code — classify

| Piece | Action |
|---|---|
| Facility rooms, responsibility | KEEP |
| `DepartmentTeam` + room membership | KEEP; become the programming home |
| `DepartmentOperationalCycle` + timeline | KEEP; author from Teams, not a peer tab |
| `OperationalAssignmentTemplate` (Coverage) | ADAPT → team × cycle staffing rows; remove Coverage tab |
| Locations list + room modal shell | KEEP; change what the modal authors |
| `DepartmentRoomArchetype` + bindings | LEGACY for Run until projection changes; hide from director UI |
| Experience catalog + projection | RETIRED. Scope is responsibility. Catalog file is leftover, not a product registry. |
| Operational Areas / Archetypes / Room Types tabs | LEGACY / hide |
| Coverage tab, Cycles tab | REMOVE from primary IA after Phase 3 |

---

## Locked decisions

1. Three tabs: Overview, Locations, Teams.  
2. Cycles and staffing are programmed on the team; cycles are department-owned.  
3. Coverage is the need on the team-cycle row.  
4. Facility room type is the bulk key. No second Department role.  
5. Experiences are retired. Stay out of director UI. Location workspace is on Runtime Location State. Leftover catalog is not a product registry.  
6. Named employees are Run.  
7. Review means the existing Run-side historical day, using the same location state.  
8. Operation entity and industry packs are retired. Cycles + Location Program + Harbor items replace them. See [`../platform-vision/RETIRED.md`](../platform-vision/RETIRED.md).
