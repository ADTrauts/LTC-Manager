# Department Administration — Architecture Index

**Current programming plan:** [`13_LOCATION_PROGRAMMING_REALIGNMENT.md`](13_LOCATION_PROGRAMMING_REALIGNMENT.md) (locked 2026-09-24; step 25 retired 2026-09-25).  
**Run freeze:** [`14_RUN_SURFACE_REFERENCE_FREEZE.md`](14_RUN_SURFACE_REFERENCE_FREEZE.md).  
**Retired philosophy:** [`../platform-vision/RETIRED.md`](../platform-vision/RETIRED.md).

## Current contract

```text
Facility room
  → Location Program (teams, cycles, need, logs, assets)
  → Runtime Location State (today)
  → Locations / Dashboard / Review / location workspace
```

Department Builder is **Overview · Locations · Teams**. Cycles and staffing need live on the team. Named employees are Run. Harbor catalog items **install** facility-wide, then **place** on a room, Facility type, asset, unit, or department.

Do **not** implement Department → Operational Area → Experiences → Room Archetypes. That model is retired.

| Retired idea | Replacement |
|---|---|
| Operation entity / Operations Engine | Department cycle + Runtime Location State answers |
| Experience catalog / Areas / Archetypes | Harbor items placed on a location |
| Industry packs | Licensed department + installable catalog |

The location workspace and RLS engines read Location Program. Projection scope is responsibility, not Experience keys. The Operation engine and Experience shell are deleted. The leftover Experience catalog file is not a product registry. Do not seed new departments from it.

## Implementation hold (historical package)

Documents `01`–`12` below are **historical**. They do not authorize production code, Prisma, routes, UI, or Projection work.

## Why this package existed

Prior waves asked how a department organizes itself. The answer they gave — Operational Areas and Experiences — is no longer the director-facing or expansion model. The answer now is Location Program.

## Documents

**Current**

11. `13_LOCATION_PROGRAMMING_REALIGNMENT.md` — locked programming plan.
12. `14_RUN_SURFACE_REFERENCE_FREEZE.md` — Run Locations / Dashboard / Review as reference only.

**Retired (do not implement from these)**

1. `01_DEPARTMENT_ADMINISTRATION_CONSTITUTION.md`
2. `02_OPERATIONAL_AREA_MODEL.md`
3. `03_EXPERIENCE_CATALOG_ARCHITECTURE.md` — Experience catalog. Retired.
4. `04_ROOM_ARCHETYPE_MODEL.md`
5. `05_DEPARTMENT_CONFIGURATION_MODEL.md`
6. `06_PLATFORM_EXPANSION_MODEL.md` — expansion via Experience composition. Retired. Expansion is licensed department + Harbor items on places.
7. `07_ADMIN_INFORMATION_ARCHITECTURE.md`
8. `08_PROJECTION_RECERTIFICATION.md`
9. `09_IMPLEMENTATION_ROADMAP.md`
10. `10_CERTIFICATION.md`
11. `11_WAVE_14B_IMPLEMENTATION.md`
12. `12_WAVE_14C_IMPLEMENTATION.md`
