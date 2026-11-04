# Department Builder visual audit

Review drawings only. Nothing in this folder changes production code, schema, or navigation.

**Current architecture.** Department Builder is Overview, Facility, Operating Rhythm, People & Coverage, and Records. Food & Nutrition adds Menus. Plant adds Preventive Maintenance. Facility Builder owns places and Department responsibility. Each engine owns its own location applicability.

**Retired.** Location Function, Operational Type, Department Room Archetype, Department Operational Profile, Operational Area, Experience programming, and the generic Department Work Plan are not forward architecture. Drawings that still show those layers are historical.

**Target** drawings began as the November 1, 2026 Department Builder decision. On November 2 that decision’s Location Function layer was retired. The trace is [08 — Location Function elimination audit](./08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md). November 1 documents on [PR 5](https://github.com/ADTrauts/LTC-Manager/pull/5) are updated to match.

| File | Visual |
|---|---|
| [01_CURRENT_DEPARTMENT_BUILDER.md](./01_CURRENT_DEPARTMENT_BUILDER.md) | What Department Builder is today, including the overlap |
| [02_TARGET_DEPARTMENT_BUILDER.md](./02_TARGET_DEPARTMENT_BUILDER.md) | The November 1 shell and ownership boundaries |
| [03_FACILITY_OWNERSHIP_MAP.md](./03_FACILITY_OWNERSHIP_MAP.md) | One physical room, many Department meanings, no second tree |
| [04_LOCATION_FUNCTION_CURRENT_VS_TARGET.md](./04_LOCATION_FUNCTION_CURRENT_VS_TARGET.md) | Profile / archetype chain beside the Location Function concept |
| [05_PEOPLE_COVERAGE_MODEL.md](./05_PEOPLE_COVERAGE_MODEL.md) | Overloaded Teams beside Department → Team → Role |
| [06_FACILITY_UI_CONCEPT.md](./06_FACILITY_UI_CONCEPT.md) | Conceptual Facility page. Open the [HTML wireframe](./06_facility_ui_concept.html) |
| [07_WHAT_WE_ARE_REMOVING.md](./07_WHAT_WE_ARE_REMOVING.md) | Keep, move, and retire after the November 2 decision |
| [08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md](./08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md) | Whether Location Function is a business fact |

Legend used throughout:

| Mark | Meaning |
|---|---|
| **CANON** | A fact with a real owner. Other screens should read it. |
| **READ** | A composed view. It persists nothing. |
| **LEGACY** | An earlier generation still in code. |
| **DUP** | A second store or vocabulary for a fact another owner already has. |
| **LEFTOVER UI** | A screen or panel that still exists and is not on the current Department Builder tab bar. |

Example names such as “1A Naval Park,” “Resident Servery,” and “2 required” are illustrative. They are not a reading of a facility’s database.

## Decisions the visuals expose

November 2 retired Location Function. November 3 removed the profile, Experience catalog, and generic Department Work. Coverage is `OperationalAssignmentTemplateItem` on a canonical room. A Team does not own rooms.

These remain open for a later phase. This package does not start that phase.

1. **Which list is Employee Builder “Role.”** Resolved in Phase 7B. Operational eligibility uses `OPERATIONAL_ROLE_REGISTRY`. Job Title is HR. RoleKey is authority. Department Job Role is removed. None of these is nested under Team.
4. **Who is the manager.** The Department head, `DepartmentStaffManager`, and `DepartmentTeam.managerEmployeeId` stay separate. Membership has no role. A Team lead is not a platform Manager.
5. **Where rhythm participation is edited.** The cycle can already store explicit rooms. The Facility card shows the result and links to Operating Rhythm. Whether the card itself writes those ids is open.
6. **Whether a room responsibility is “Primary.”** Neighborhood responsibility has PRIMARY, BACKUP, and SUPPORT. A room row is present or absent, plus a `capabilities` array.
7. **Zones.** They are a saved room group, not a Location Function. The reader/writer trace is still not done.
8. **Which Plant “Work” is actually PM, a Work Order, or Records.** Plant still has `workPresets: true`, so the Work tab still appears.
