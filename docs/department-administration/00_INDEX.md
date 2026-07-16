# Department Administration — Architecture Index

**Wave:** Department Administration architecture  
**Status:** Final architecture package before Department Operational Profile implementation  
**Scope:** Product architecture, ownership boundaries, and information architecture only

## Implementation hold

No production code, Prisma, migration, route, UI, feature flag, Facility Builder change, or Projection change is authorized by this package.

This is the last architecture wave before implementation planning begins.

## Why this package exists

Prior waves established three answers:

- **Where** something exists — Facility Builder physical hierarchy.
- **Who** owns a room — Facility Builder department assignment.
- **What** operational behavior can exist — Department Operational Profiles and Experiences.

One layer is still missing: **how a department organizes itself.**

The system still thinks in software modules — Logs, Knowledge, Equipment, Repairs, Assignments. Directors do not think that way. A Director of Food Service thinks in Service, Food Safety, Equipment, People, Documentation, Production, and Quality.

This package introduces the **Operational Area** as the manager's mental model and the organizing layer between a Department and its Experiences.

## The completed conceptual stack

```text
Facility Builder            WHERE + WHO
  Facility → Floor → Neighborhood → Room
  Room ↔ Department assignment

Department Administration   HOW a department organizes itself
  Department → Operational Area → Experiences → Room Archetypes → Operational Profile

Projection Engine           WHICH of that appears here, now, for this person

Operational Engines         WHAT is actually true right now
  readiness, operations, work, assignments, domain records
```

## Documents

1. `01_DEPARTMENT_ADMINISTRATION_CONSTITUTION.md` — what Department Administration is, owns, and must never own.
2. `02_OPERATIONAL_AREA_MODEL.md` — the Operational Area concept and why modules disappear.
3. `03_EXPERIENCE_CATALOG_ARCHITECTURE.md` — Experiences as reusable building blocks organized by Operational Areas.
4. `04_ROOM_ARCHETYPE_MODEL.md` — department-owned operational room archetypes.
5. `05_DEPARTMENT_CONFIGURATION_MODEL.md` — the configuration layers of a department.
6. `06_PLATFORM_EXPANSION_MODEL.md` — proof the architecture scales to any department.
7. `07_ADMIN_INFORMATION_ARCHITECTURE.md` — the future Administration information architecture.
8. `08_PROJECTION_RECERTIFICATION.md` — Operational Area-aware projection resolution.
9. `09_IMPLEMENTATION_ROADMAP.md` — non-code implementation order.
10. `10_CERTIFICATION.md` — final operational architecture, constitutional layers, and expansion rule.

## Executive recommendation

Adopt a four-layer department model:

```text
Department → Operational Area → Experiences → Room Archetypes
```

bound into one active **Operational Profile** per Facility Department.

Make the **Operational Area** the primary manager-facing organizing concept. Make **Experiences** the reusable building blocks. Retire software module names — Logs, Knowledge, Forms — as top-level navigation. They become tools that appear inside the operational work they support.

A new department, including Laundry, Security, or Biomedical, is added by composing existing Operational Areas and Experiences from the catalog. It never requires a Facility Builder change.

## Opinionated answers to the framing questions

- **Should "Logs" be a visible concept?** No. Logs are a tool. A manager opens Food Safety and finds temperature logs inside it. "Logs" is not a destination.
- **Should "Knowledge" be a module?** No. Knowledge appears wherever work happens — inside Food Safety, inside Preventive Maintenance, inside Cleaning. A department-wide reference library may still exist, but Knowledge is not a peer of Service.
- **Should managers see modules or operations?** Operations. The IA is organized by what a department does, not by which database table backs it.

## Non-goals

- No production code.
- No Prisma or migrations.
- No routes.
- No UI.
- No feature flags.
- No Facility Builder changes.
- No Projection implementation.
- No implementation of Department Administration.
