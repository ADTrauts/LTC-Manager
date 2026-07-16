# 11 — Wave 14B Implementation Record

**Wave:** 14B — Operational Profiles and Room Archetypes  
**Depends on:** Wave 14A Experience Registry foundation (`a662ef62932d…`)  
**Status:** Implemented; no runtime consumers. Projection remains paused.

## Schema/model decision

No existing model could represent versioned, certifiable, facility-tenant
department configuration. Capability arrays on `UnitSpaceResponsibility` are
flat compatibility data; presets are TypeScript-only UX templates; no generic
configuration/version model exists in the schema. Forcing any of them to carry
profiles would have broken facility tenancy, immutable activated versions, or
clear profile identity.

Decision: seven new dedicated models, exactly on the recommended shape:

```text
DepartmentOperationalProfile        one authored/versioned profile per facility department
DepartmentOperationalArea           profile-specific ordered grouping
DepartmentAreaExperience            catalog Experience placed into one Area
DepartmentRoomArchetype             operational template for a category of room
DepartmentArchetypeExperience       archetype selection/tuning of profile Experiences
DepartmentRoomArchetypeBinding      one archetype per room per profile
DepartmentRoomExperienceException   sparse room-level override (ENABLE/DISABLE/OVERRIDE)
```

Notes:

- `createdByUserId` / `certifiedByUserId` are scalar audit fields (no FK) so the
  `User` model is untouched.
- "At most one ACTIVE per facility department" is enforced by a **partial unique
  index** in the migration SQL (`WHERE status = 'ACTIVE'`). Prisma cannot express
  partial unique indexes declaratively; the schema documents the rule in a comment.
- Migration: `20260716160000_department_operational_profiles` — forward-only,
  additive tables only; no existing table or row is modified.

## Catalog versus persisted profile boundary

The Wave 14A registries (`src/lib/experiences/`) remain the only canonical
definition of Experiences, tools, and standard Operational Areas. The database
stores a facility's **selection and arrangement** of those definitions —
`experienceKey` strings resolved against the server registry — never a second
copy of the catalog. Client-supplied Experience definitions are never trusted.

## Baseline materialization

`materializeBaselineProfilePlan(departmentKey)` (in
`src/lib/department-administration/baseline.ts`) reads the Wave 14A Operational
Area registry and Experience catalog and emits a DRAFT plan for DIETARY, EVS,
and PLANT. It creates ordered Areas mirroring the registry, places eligible
Experiences, and adds conservative default archetypes:

- **Dietary:** Servery, Production Kitchen, Dining Room, Tray Delivery Point, Storage / Supply, Office / Support
- **EVS:** Occupied Resident Room, Discharge / Turnover Room, Public Area, Restroom, Utility / Soiled Area, Office / Support
- **Plant:** Serviceable Space, Mechanical Room, Equipment Area, Utility Area, Exterior / Grounds, Plant Shop

Baseline creation never assigns physical rooms and never activates.
`createBaselineDraft` persists the plan in one transaction.

## Lifecycle

```text
DRAFT → CERTIFIED → ACTIVE → RETIRED
```

- DRAFT is the only editable state; drafts may be incomplete.
- DRAFT → ACTIVE directly is rejected.
- Certification validates first and is refused on structural errors.
- Activation is transactional: previous ACTIVE is retired in the same
  transaction; the partial unique index backs the invariant at the database.
- Certified/active/retired history is never deleted; new work continues in a new
  DRAFT version (`createNextDraftVersion` deep-copies the model).

## Certification validation

`validateProfileForCertification` (pure) rejects: unknown Experience keys,
Experiences active in two Areas, duplicate area/archetype keys, archetype
references outside the profile, cross-facility or unassigned or
staged/undesignated room bindings, multiple archetypes per room, exceptions
referencing non-profile Experiences, and unsupported configuration shapes.

Complete room mapping is **not** required in this milestone. Diagnostics (not
errors) report: assigned rooms without archetypes, inactive bound rooms, and
repeated identical exceptions that suggest a missing archetype.

## Room bindings

`bindRoomToArchetype` verifies: profile is DRAFT, archetype belongs to the
profile, room belongs to the same facility, room is not staged/undesignated,
and the room is explicitly assigned to the department in Facility Builder
(`UnitSpaceResponsibility`). Physical classification → archetype suggestions
come from `recommendArchetypeKey` (advisory only; nothing is auto-saved).

## Sparse exceptions

`DepartmentRoomExperienceException` supports ENABLE / DISABLE / OVERRIDE with
bounded configuration and a reason. Exceptions can never re-enable an
Experience the profile has deactivated. Three or more rooms sharing the same
exception produce a "define an archetype instead" diagnostic.

## Room-profile resolution

`resolveDepartmentRoomProfile` (pure) resolves one room within a profile:

```text
active profile Experiences
  → archetype narrowing + configuration tuning
    → sparse room exceptions
      → area-grouped result (empty Areas suppressed, stable order)
```

Each resolved Experience carries `source: PROFILE | ARCHETYPE | ROOM_EXCEPTION`
and a merged `effectiveConfiguration`. The resolver loads no live data,
applies no user access, and produces no navigation or query scopes — that is
Projection's future job.

## Plant policy boundary

Broad Plant coverage is a typed policy (`PLANT_FACILITY_WIDE_POLICY`), not
copied room assignments. Direct bindings are used for specialized spaces
(Mechanical Room, Equipment Area). `policyEligibleExperienceKeys` guarantees the
policy can only expose Experiences present in the Plant profile — it can never
grant Dietary or EVS Experiences.

Projection will later combine: Plant active profile + Plant facility-wide
physical-access policy (default archetype `serviceable_space` for placed,
active, unbound rooms) + archetype/default behavior. Direct bindings always
take precedence. Not implemented in this wave.

## Administration/API surface

None. Domain services (`profile-service.ts`), pure rules, and tests only. All
write paths enforce the feature flag, Manager+ role, and facility tenancy via
`assertProfileWriteAccess`.

## Feature flag

`DEPARTMENT_OPERATIONAL_PROFILES_ENABLED` (default **false**) in
`src/lib/feature-flags.ts`. While false: every profile write throws, no
navigation exposure exists (none was added anyway), no runtime consumer exists,
and the running app is unchanged.

## Why Projection remains paused

Projection consumes certified ACTIVE profiles. Until facilities can author and
certify profiles (Wave 14C UX) and the resolution semantics have settled here,
building Projection would bind it to an unproven upstream. The recertified
contract in `08_PROJECTION_RECERTIFICATION.md` stands; the resolver in this
wave is the profile-side half of that contract.

## What Wave 14C may build

- Department Administration UX: profile list, baseline draft creation, Area and
  Experience arrangement, archetype editing, room mapping matrix, exception
  management, certification/activation flows with diagnostics.
- Read-only profile inspection for administrators.
- Not yet: Projection, Sidebar changes, Locations changes, or any consumer.
