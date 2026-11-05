# Department Builder → Facility Deep Audit

**Date:** November 1, 2026  
**Scope:** Current Department Builder Facility/location architecture, ownership, legacy concepts, downstream dependencies, and migration direction.  
**Decision source:** [16 — Department Builder Architecture](../product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md)

**Superseded in part on November 2, 2026.** This file is the November 1 record. Its conclusion that Location Function should be kept and consolidated is withdrawn. The binding rule is now: retire Location Function, Operational Type, archetype, and the Department operational profile. Read [08 — Location Function elimination audit](./visual-audit/08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md) before any paragraph below that says to keep or rename that concept.

---

## Executive verdict

**The target concept is sound; the current implementation is carrying several generations of location programming at once.**

The clean architecture is:

```text
Facility Builder
  owns physical Facility tree
  owns Department responsibility
        ↓
Department Builder → Facility
  composes the selected Department over those places
  owns/edits only Department-specific Location Function binding
        ↓
Operating Rhythm / People & Coverage / Records / Assets / Product extensions
  remain canonical owners of their own facts
        ↓
Run / Audit
  consume effective configuration
```

The main cleanup is not “build a new Facility engine.” It is to **remove duplicate abstractions and converge the existing code on this ownership model**.

---

## 1. Current navigation is stale

`src/lib/department-administration/admin-nav.ts` currently defines:

- Overview
- Locations
- Operating Rhythm
- Work
- Maintenance
- People & Coverage
- Records
- Menus

It also redirects older `room-types`, `areas`, `archetypes`, and `rooms` tabs into Locations.

### Verdict

**CHANGE.**

Target core navigation:

- Overview
- Facility
- Operating Rhythm
- People & Coverage
- Records

Product extensions:

- Menus — Food and Nutrition
- Preventive Maintenance — Facility Plant Operations

Generic Work is removed.

`Locations` becomes `Facility` because the section is broader than a list of Department rooms: it is the selected Department's view of the canonical facility and the operational configuration that applies there.

---

## 2. Physical Facility ownership is already correct

`src/lib/facility-builder/department-responsibility-sync.ts` explicitly documents the canonical responsibility stores:

- actionable Unit / neighborhood → `UnitDepartmentResponsibility`
- Room / `UnitSpace` → `UnitSpaceResponsibility`
- Floors are structural only
- room responsibility is explicit, not inherited

This is a strong boundary and should survive.

### Verdict

**KEEP.**

Facility Builder owns:

- Facility hierarchy
- physical place identity
- physical room/space type
- Department responsibility
- bulk responsibility copy to actionable descendants

Department Builder must not add a second responsibility editor/store merely because the Facility section needs to show Department scope.

---

## 3. Location Function is the correct Department semantic

The current product docs already describe the intended concept: a Product defines Location Function keys/labels and the facility binds them to existing rooms.

The implementation, however, still uses:

- `DepartmentOperationalProfile`
- `DepartmentRoomArchetype`
- `DepartmentRoomArchetypeBinding`
- “Operational Type” vocabulary

`load-operational-type-targets.ts` proves those bindings already support an important publication boundary:

- Build / working perspective prefers DRAFT
- Run uses ACTIVE only
- bindings are profile-scoped
- physical Room Type is not used as a fallback

### Verdict

**KEEP THE BEHAVIOR; CONSOLIDATE THE CONCEPT.**

The product concept is **Location Function**.

Do not create a new parallel Location Function schema while the archetype/profile mechanism remains active. Instead:

1. trace all archetype/profile consumers
2. preserve draft/published/effective-date behavior that is genuinely required
3. remove Experience-era data and exceptions that no longer serve Location Function
4. rename/consolidate implementation once consumers are ready

The important distinction:

> `DepartmentRoomArchetype` is currently persistence. It is not permission to keep “Archetype” or “Operational Type” as a second product concept.

---

## 4. The old room-profile resolver is clearly legacy

`resolve-room-profile.ts` resolves:

```text
profile Experiences
  → archetype narrowing/tuning
  → room exceptions
```

The output still includes Operational Areas and Experiences.

`effective-location-program.ts` is even more explicit: its header calls itself **legacy Role / Experience composition**, says Director Locations moved to `location-program.ts`, and says it remains only until Run no longer keys off archetype bindings.

### Verdict

**RETIRE THE EXPERIENCE LAYER; DO NOT RETIRE LOCATION FUNCTION PUBLICATION BY ACCIDENT.**

The following are not needed in the target Facility product model:

- Experience catalog/tree
- Operational Areas
- room Experience exceptions
- Experience configuration merge as a Department location-programming model

Any remaining Run dependency must be moved to direct Location Function/effective-profile resolution before these pieces are deleted.

---

## 5. The newer Location Program is a useful read-model pattern, not an owner

`location-program.ts` describes itself as a composed read model for one Department room and explicitly says it is not persisted.

It currently composes:

- canonical location identity
- Department responsibility
- Teams
- Cycles
- Logs / Records-like requirements
- Assets

This is directionally correct because a Facility screen needs a place-centric view.

The problem is not that those facts appear together. The risk is allowing this object to become a write model or another source of truth.

### Verdict

**KEEP THE COMPOSITION PATTERN; REBUILD ITS INPUT CONTRACT AROUND CANONICAL OWNERS.**

Target conceptual read model:

```text
DepartmentFacilityLocationView
  identity        ← Facility Builder
  responsibility  ← Facility Builder
  function        ← Location Function binding
  rhythm          ← Operating Rhythm
  workforce       ← Employee Builder / Coverage
  records         ← Records
  assets          ← Asset registry
  extensions      ← Product-specific capability
```

It may return a single convenient view to the UI. It must persist nothing and must not own lifecycle.

---

## 6. Operating Rhythm currently depends on the old Operational Type name

`load-operational-type-targets.ts` loads `DepartmentRoomArchetype` keys and bindings for both working and runtime perspectives.

This is actually useful evidence that the current archetype key is already functioning as Location Function for Cycle targeting.

### Verdict

**MIGRATE TERMINOLOGY / API, NOT BEHAVIOR FIRST.**

Operating Rhythm may use Location Function as an applicability dimension, but:

- Cycle identity/timing remains in the Operating Rhythm engine
- Facility responsibility does not imply Cycle participation
- physical Room Type must not silently imply a Department function
- Build uses working function bindings
- Run uses published/effective function bindings

A future service should expose Location Function terminology even if it temporarily reads the archetype tables underneath.

---

## 7. Teams are overloaded and should not remain part of Facility programming

The current Department Team family mixes several concerns:

- organizational Team identity
- manager
- employee membership
- room membership/applicability
- Operational Type applicability
- Cycle linkage
- required staffing count
- coverage grain

That made Team an accidental bridge between People, Facility, Operating Rhythm, and Coverage.

### Verdict

**SPLIT.**

Target ownership:

```text
Employee Builder
Department
  → Team
    → Role
      → Employee
```

Department Builder → People & Coverage reads that organization.

Facility may **display** which Team normally serves a place if a legitimate relationship remains, but Team must not own the place, define the physical scope, or become the only way a Cycle/Record applies.

Coverage need should be modeled as coverage configuration, not hidden inside Team identity.

---

## 8. Department Job Roles are a second workforce model

The existing Department Job Role service explicitly describes the roles as Department-owned Build configuration and says they do not change route authorization or Run.

That leaves the system with a role/capability model that looks meaningful in Build but is not the canonical workforce/runtime role model.

### Verdict

**CONSOLIDATE INTO EMPLOYEE BUILDER.**

Do not preserve two meanings of Role.

Employee Builder should own the Team/Role structure managers use to organize the Department. Access/authorization roles remain a separate governance concern and should not be confused with job Roles.

---

## 9. Zones are not a Facility primitive

`department-zones/index.ts` says exactly what Zones are: groups of existing `UnitSpace` rows for Assignment convenience and Supervisor filters. It also says they are not physical locations, Assignments, Work Plans, or authorization.

This is a persisted saved grouping mechanism.

### Verdict

**RETIREMENT CANDIDATE.**

Do not include Zones in the target Department Builder → Facility architecture.

Before deletion, trace any current readers/writers and ask whether a unique user need remains. If the only need is:

- filter these rooms
- assign these rooms together
- show these rooms together

prefer canonical Facility scope, Employee Team/Role context, Assignment, or a non-owning query/filter mechanism rather than a required persisted location layer.

No new Zone dependency should be added during cleanup.

---

## 10. Generic Work should be hard-retired

The current navigation and registry still contain generic Work Plan / Expected Work concepts, but the product owner has decided Work no longer has a unique job and there are no real customers requiring compatibility.

### Verdict

**RETIRE.**

Before schema deletion, trace every dependency and classify it:

- documentation requirement → Records
- recurring timing → Operating Rhythm
- workforce need/placement → People/Coverage
- maintenance execution → Work Order / PM
- instruction → Procedure / Knowledge
- truly Department-specific behavior → explicit Product capability after platform-gap review

Do not move everything to a newly named generic task engine.

---

## 11. Records is architecturally valid but needs its own audit

Records should remain one shared engine. Department Builder → Records is a Department-scoped configuration/composition surface.

Facility needs to be able to answer which requirements apply to a location, and those requirements may use:

- canonical place identity
- Location Function
- Operating Rhythm context where supported

The current Records system has enough prior iterations that its exact configuration UX, applicability model, and old terminology should be audited separately before redesign.

### Verdict

**KEEP ENGINE; DEFER DETAILED REDESIGN.**

Do not solve Records problems by recreating generic Work.

---

## 12. Facility target UX

The Facility page should be organized around the physical tree the manager already understands.

Example:

```text
Food & Nutrition → Facility

1A Naval Park
  Servery
    Responsibility        Food & Nutrition
    Location Function     Resident Servery
    Operating Rhythm      Breakfast · Lunch · Dinner
    People                Resident Services
    Records               6 requirements
    Assets                4
    Menu                  Spring/Summer Resident Menu
```

The page should distinguish:

- **physical facts** — link/edit in Facility Builder
- **Department semantic/config** — Location Function, editable here
- **composed facts** — link to their canonical builder where editing belongs

This keeps the page powerful without turning it into a mega-form that rewrites every domain.

---

## 13. Concrete implementation sequence

### Phase A — shell

- change Locations label/id behavior to Facility
- remove Work tab and flag
- standard core nav on every Department
- keep Menus/PM conditional extensions
- restore/fix canonical Department Builder root route if still absent

### Phase B — Facility source contract

- load canonical Facility hierarchy
- load explicit Department responsibility
- load working/effective Location Function bindings
- produce one derived Department Facility view
- no Experience/Operational Area output

### Phase C — Location Function cleanup

- inventory all `DepartmentOperationalProfile`, `DepartmentRoomArchetype`, binding, exception, and resolver readers/writers
- identify which fields exist only for retired Experience behavior
- expose Location Function language/API
- preserve required publication/history semantics
- remove legacy Experience resolver once Run no longer depends on it

### Phase D — Work removal

- inventory all Work Plan / item / Expected Work / occurrence / preset readers and writers
- re-home legitimate behavior
- remove routes/services/tests/seeds
- forward-only schema cleanup after explicit drop approval

### Phase E — workforce cleanup

- make Employee Builder canonical Team/Role authoring home
- migrate Department Team/Job Role concepts
- separate coverage need from Team identity
- remove Team as location/cycle programming glue

### Phase F — Zone/legacy location cleanup

- inventory Zone consumers
- retire unless a unique non-owning saved-group need is proven
- remove Operational Areas / Experience concepts from active paths

### Phase G — Records audit

- run a dedicated Records ownership/applicability/UX audit

### Phase H — Overview

- build Overview last from the now-canonical sections

---

## 14. Final keep / move / retire table

| Concept | Verdict | Forward owner |
|---|---|---|
| Facility physical hierarchy | **KEEP** | Facility Builder |
| Department responsibility on places | **KEEP** | Facility Builder |
| Location Function | **RETIRED November 2** | Not a business primitive. See the elimination audit. |
| `DepartmentOperationalProfile` publication semantics | **RETIRED November 2** | History stays on each engine |
| Operational Type product language | **RETIRE** | No replacement classification |
| Archetype product language | **RETIRE** | No replacement classification |
| Experience tree/catalog | **RETIRE** | No replacement tree |
| Operational Areas | **RETIRE** | No replacement location layer |
| newer place-centric Location Program read model | **KEEP PATTERN / REFACTOR** | composition only |
| Department Team identity | **MOVE** | Employee Builder |
| Department Job Roles | **MOVE / CONSOLIDATE** | Employee Builder |
| coverage need | **KEEP / SEPARATE** | People & Coverage configuration |
| Department operational Zones | **RETIREMENT CANDIDATE** | canonical scope/filter/Assignment if needed |
| generic Work | **RETIRE** | classify each old behavior by real owner |
| Operating Rhythm | **KEEP** | Operating Rhythm |
| Records | **KEEP / AUDIT NEXT** | Records engine |
| Menus | **KEEP EXTENSION** | Menu Builder / Food & Nutrition |
| Preventive Maintenance | **KEEP EXTENSION** | Facility Plant Operations |

---

## Certification statement

The November 1 text below this banner recommended keeping Location Function. That recommendation is withdrawn.

> **Facility Builder defines the place and Department responsibility. Department Builder → Facility shows those places. Each engine stores the canonical location ids it needs. There is no Location Function.**

Implementation removes the indirection. It does not rename it.
