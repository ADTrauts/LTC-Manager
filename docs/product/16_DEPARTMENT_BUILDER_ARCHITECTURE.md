# 16 — Department Builder Architecture

**Status:** Binding Department Builder architecture decision  
**Decision date:** November 1, 2026, amended November 2, 2026  
**Scope:** Department Builder ownership, Facility composition, People & Coverage ownership, generic Work retirement, and Department-specific extensions.  
**Product-owner decision:** Accepted. There are no customer installations. Test data, existing code, and bookmarks are not reasons to keep a retired concept.

This document is the binding contract for Department Builder. Where older Department Builder, location-programming, generic Work, Team, Zone, Operational Area, Operational Type, archetype, or Location Function guidance conflicts with this decision, this document wins.

**November 2, 2026.** Location Function is retired before release. It is indirect grouping, not a business primitive. Department Builder → Facility shows the places Facility Builder already marked responsible for the selected Department. Operating Rhythm, Records, Coverage, and Menus store canonical location ids on their own configuration. The trace is [08 — Location Function elimination audit](../department-administration/visual-audit/08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md). Do not add a Location Function, Operational Type, archetype, or Department room classification.

---

## 1. Product definition

Department Builder is the **configuration and information hub for one installed Department**.

It answers:

> **How does this Department operate in this facility?**

Department Builder is intentionally a composition surface. Some information is created or configured in Department Builder, some is owned by another Platform builder or engine and projected here, and some is supplied by a Department-specific capability.

Department Builder does **not** become the canonical owner merely because it displays a fact.

### The ownership questions

| Surface / engine | Question it answers |
|---|---|
| **Facility Builder** | What physical places exist, and which Departments are responsible for them? |
| **Employee Builder** | Who works here, and how are people organized into Departments, Teams, and Roles? |
| **Department Builder** | How does this Department use those places, people, timing, and Records? |
| **Run** | What is happening today? |
| **Audit / Reports** | What was expected and what happened on a service date? |

---

## 2. Standard Department Builder contract

Every installed Department receives the same five core sections:

1. **Overview**
2. **Facility**
3. **Operating Rhythm**
4. **People & Coverage**
5. **Records**

Department Products may add specialized sections only for a capability that is genuinely Department-specific and is not already owned by a shared Platform engine.

Current extensions:

| Department Product | Extension |
|---|---|
| Food and Nutrition | **Menus** |
| Facility Plant Operations | **Preventive Maintenance** |
| Environmental Services | None defined yet |

A new Product does not receive a different Department Builder shell.

### Retired core section

**Work is removed from Department Builder.** Generic Work is not a core Platform/Department Builder concept going forward.

Existing generic Work machinery — including Work Plans, Expected Work, Work occurrences, Work presets, starter Work, and generic Work applicability — is legacy implementation scheduled for removal after dependency tracing. It must not receive new features, new consumers, new migrations, new UI, or new documentation.

This does **not** retire:

- Records requirements or due Records
- Operational Cycles, Phases, or Key Points
- Shifts, Assignments, or Coverage
- Facility Plant Operations Requests, Issues, Work Orders, or Preventive Maintenance
- Department-specific capabilities such as Menus

If a future operational need appears to be “work,” first identify the real owner. A temperature check is Records. Meal timing is Operating Rhythm. Staffing is People/Coverage. Maintenance execution is a Work Order or PM. Do not recreate generic Work as a catch-all.

---

## 3. Overview

Overview is a **composition-only Department summary**.

It may show:

- configuration completeness
- responsible Facility locations
- responsible Facility locations
- current or published Operating Rhythm summary
- Employee / Team / Role counts
- coverage summary
- Records configuration/completion summary
- Department-specific capability summaries such as active Menus or PM status
- links into the canonical owner for configuration

Overview owns no duplicate operational facts and no separate readiness engine.

The main Dashboard remains the supervisor answer to **what needs attention now**. Department Builder Overview answers **what this Department is and how it is configured**, with selected live signals only where useful.

---

## 4. Facility

### 4.1 Facility Builder is the physical owner

There is one physical Facility tree:

```text
Facility
  → structural Units / Floors
  → neighborhoods / operational Units
  → Rooms / Spaces (UnitSpace)
```

Facility Builder owns:

- physical identity
- hierarchy
- physical names
- physical room / space type
- creation, movement, and retirement of physical places
- Department responsibility for canonical Units and UnitSpaces

Department responsibility is represented by the existing responsibility relationships such as `UnitDepartmentResponsibility` and `UnitSpaceResponsibility`.

**Department Builder must not create, copy, rename, or independently persist another physical tree.**

### 4.2 Department Builder → Facility is a Department lens

The Facility section consumes the canonical physical tree and the Department responsibility established in Facility Builder.

It answers:

- Which Facility places is this Department responsible for?
- Which Operating Rhythm participates here?
- Which Records requirements apply here?
- Which coverage information is relevant here?
- Which Department-specific capabilities apply here?

The Facility section summarizes information owned by other engines. It does not add a Department-specific classification of the room. The room’s name and Facility Room Type stay in Facility Builder. Two Departments use the same room by each holding a responsibility row and by each naming that room id in their own cycles, requirements, coverage, or menus.

### 4.3 No Department room classification

Location Function, Operational Type, and `DepartmentRoomArchetype` are not forward concepts.

A Servery that Food and Nutrition is responsible for does not also need `food_service_area`. A resident room that Environmental Services is responsible for does not also need `resident_care`. Plant already operates with no such key.

The current key exists so a cycle, a record attachment, a coverage item, a team, or a Work plan can store the key and expand it later to whatever rooms are bound. That is a live query. The released product stores the location ids on the owner that uses them. Authoring may filter by floor, neighborhood, or Facility Room Type, and then save ids. A new room does not join an existing configuration because its physical type matches. The author is offered an explicit “apply the same configuration” action.

`DepartmentOperationalProfile`, Operational Areas, Experience rows, room exceptions, and the historical profile selector exist to version that key. They are retired with it. Cycles, record attachments, coverage templates, and menus keep their own effective dating. There is no released question that asks which function key a room had on a past date.

### 4.4 Current code is deletion debt

Until the approved removal sequence runs, code still contains:

- `DepartmentRoomArchetype` and `DepartmentRoomArchetypeBinding`
- `DepartmentOperationalProfile`
- `operationalTypeKey` / `applicableOperationalTypeKeys`
- `src/lib/department-products/location-functions.ts`
- the Experience catalog and `resolve-room-profile.ts`

Do not add readers, writers, starters, columns, or UI for them. Do not rename them to Location Function. Do not add a new table to make the deletion easier. Test rows are reseeded. They are not migrated.

### 4.5 Publication stays on the real owner

Draft, publish, and service-date history remain where an engine has its own configuration:

- Operating Rhythm versions name the places that participated.
- Record attachment intervals name the place, unit, department, facility, or asset that was required.
- Coverage template intervals name the staffing need that was effective: Department, assignment role, canonical location, period, and required count. A team does not own that count. Location Function and Facility Room Type do not select it.
- Menus follow Menu applicability rules.

A Department operational profile is not kept as a generic history bus for those owners.

---

## 5. What Facility does not own

Department Builder → Facility does not own:

- physical place creation or hierarchy
- Department responsibility assignment
- Employee identity
- Team or Role identity
- Shift scheduling
- daily Assignment
- coverage truth
- Operational Cycle definitions
- Record definitions or submitted Records
- Menu identity/content
- Asset identity
- Plant Work Orders or PM Plans

It may display these facts in a place-centric composition when useful.

### Editing rule

> **Display can compose. Editing follows ownership.**

If a Facility row shows an Employee Team, Record, Menu, Asset, or Cycle, that does not make Facility the authoring home for that object.

---

## 6. Operating Rhythm interaction

Operating Rhythm owns Department timing:

```text
Operational Cycle
  → Phase(s)
  → Key Point(s)
```

The Facility section may show which places participate in an Operating Rhythm. Participation is stored on the cycle in one of two ways:

- Department-wide. Every place Facility Builder says this Department is responsible for, including a place assigned later. That is the rule the manager chose.
- Explicit canonical Unit and UnitSpace ids. A Unit id is that Unit. It does not add every room under it. Rooms participate only when their ids are stored.

Floor, neighborhood, and Facility Room Type may filter the picker. They are not saved, and a new room does not join an explicit cycle because it matches a filter. Location Function, Operational Type, unit type, and room type are not cycle targeting.

Facility must not create a second timing model.

Other engines reference canonical rhythm facts:

- Records may use a Cycle / Phase / Key Point timing context where supported.
- Coverage may calculate need during a Cycle / Phase.
- Menus may reference a canonical root Operational Cycle.
- Facility may show which rhythm applies at a location.

Department responsibility alone does not imply Cycle participation.

---

## 7. People & Coverage interaction

### 7.1 Employee Builder owns workforce organization

Employee Builder owns the organizational hierarchy beneath a Department:

```text
Department
  → Team
    → Role
      → Employee membership / assignment to that role
```

Examples:

```text
Food & Nutrition
  Culinary
    Cook
    Prep Cook
    Baker

  Resident Services
    Server
    Lead Server

  Utility
    Dishwasher
    Porter
    Receiver

  Retail
    Cashier
    Barista
```

Teams and Roles are workforce organization. They do **not** belong to Department Builder as separate authoring domains.

### 7.2 Department Builder People & Coverage consumes the model

People & Coverage may show:

- Department employee count
- Teams
- Roles within Teams
- managers / leads where the Employee model supports them
- required coverage
- scheduled coverage
- actual/daily coverage
- gaps
- drill-down links to Employee Builder or Run

Coverage remains derived from configured need plus canonical workforce/run facts. It must not create a second staffing record.

### 7.3 Team is organizational

Phase 5A leaves `DepartmentTeam` as a named group of people in one Department, with an optional lead. Membership is `EmployeeTeamMembership`.

A Team does not own locations, define Coverage, define authorization, or define daily placement.

- Department responsibility is the Department footprint.
- Coverage is the staffing need.
- `OperationalAssignment` is today's placement.
- Employee Builder remains the later home for Team, Role, and member organization.
- Authorization stays with policy and authority.

Role is not yet nested under Team. That consolidation is still ahead. Do not put rooms, Location Function keys, or cycle staffing counts back on the Team.

The existing Department Job Role implementation also requires consolidation into the Employee Builder workforce model. A second Department-only role/capability system must not remain beside canonical Employee roles.

---

## 8. Records interaction

Records remains one shared engine.

Department Builder → Records is the Department-scoped configuration/composition surface for that engine. Its detailed UX and ownership boundaries require a separate audit.

Current direction:

```text
Catalog definition
  → facility install
  → Department requirement / attachment
  → applicability
      where: canonical Facility place, unit, Department, facility, or Asset
      when: canonical Operating Rhythm where applicable
  → derived due requirement
  → submitted Record
  → Audit / Reports
```

The Facility section may show which Records apply to a place. It does not become the Record definition or evidence store.

There is no `DepartmentRecordApplicability` model. `LogAttachment` stores the canonical target: `FACILITY`, `DEPARTMENT`, `UNIT`, `SPACE`, or `ASSET`.

`FACILITY` is one facility requirement. `DEPARTMENT` is one department requirement. `UNIT` is that Unit. `SPACE` is that `UnitSpace`. `ASSET` is that Asset, and it is not copied onto the Asset's room. A manager may filter rooms by department responsibility, floor, neighborhood, Facility Room Type, or search while assigning. The saved rows are the selected targets. A later room of the same Facility Room Type does not inherit the requirement.

`OPERATIONAL_TYPE`, Location Function, Facility Room Type inheritance, and location suppression are not Records applicability. The enum value and the unused default/suppression tables remain until the final schema pass. Do not add a function-key applicability path.

---

## 9. Department-specific extensions

A Department Product may add a section only when the capability is truly specific to that Department Product and no shared owner already fits.

### Food and Nutrition — Menus

Menus is a Department-specific extension.

Department Builder displays active/configured Menus from Menu Builder and provides appropriate navigation/context. It does not create a second Menu engine.

### Facility Plant Operations — Preventive Maintenance

Preventive Maintenance is a Plant-specific extension built on shared Assets, People, Records, and Plant maintenance lifecycle concepts.

PM is not generic Work and is not an Operational Cycle.

---

## 10. Retirement decisions from the Facility audit

### KEEP

- canonical Facility → Unit → UnitSpace tree
- Facility Builder ownership of physical hierarchy
- explicit Department responsibility relationships
- canonical Facility places and Department responsibility, with no Department room classification
- draft/published/effective-dated semantics where consumers require them
- Operating Rhythm
- one Records engine
- shared Asset registry
- place-centric read/composition models, provided they persist no shadow truth

### KEEP, BUT MOVE / CONSOLIDATE

- **Teams** → Employee Builder ownership
- **Roles** → Employee Builder ownership under Teams
- **Coverage need** → explicit workforce/coverage configuration, separate from Team identity where necessary
- archetype, Operational Type, and Location Function → delete after consumers store canonical location ids

### RETIRE / DO NOT EXTEND

- generic Department Builder **Work** section
- generic Work Plan / Expected Work / Work occurrence / Work preset architecture
- old Experience-based Department location composition
- Operational Areas as a second Department grouping of physical places
- Experience catalog as product/location structure
- Location Function, Operational Type, and archetype, as product concepts and as implementation
- `DepartmentOperationalProfile` once consumers no longer expand its bindings
- Experience catalog, Operational Areas, and room experience exceptions
- Department-owned role system that does not drive the canonical Employee workforce model

### RETIREMENT CANDIDATE — ZONES

`DepartmentOperationalZone` currently groups existing UnitSpaces for Assignment convenience and Supervisor filters. It is not a physical place.

Under the target architecture, Zone is not part of the Department Builder Facility model and must not become another location hierarchy. Before deleting its schema/code, trace all remaining readers/writers. If no unique business rule exists beyond saved grouping/filter convenience, retire it and use canonical Facility scope, Team/Role organization, and Assignment/coverage filtering instead.

No new Zone usage may be added during that trace.

---

## 11. Target Facility composition

A Department Facility row/card should be understandable without exposing persistence vocabulary.

Example:

```text
1A Naval Park — Servery
Food & Nutrition responsibility: Primary
Facility Room Type: Servery
Operating Rhythm: Breakfast · Lunch · Dinner
People: Resident Services
Records: 6 requirements
Assets: 4
Menu: Spring/Summer Resident Menu
```

Each line comes from its canonical owner. The page is a composition, not a merged store.

A useful conceptual resolver may return a Department location view model such as:

```text
DepartmentFacilityLocationView
  identity        ← Facility Builder
  responsibility  ← Facility Builder responsibility
  place           ← Facility Builder identity and responsibility
  rhythm          ← Operating Rhythm
  workforce       ← Employee Builder / coverage resolver
  records         ← Records resolver
  assets          ← Asset registry
  extensions      ← Department Product capability resolvers
```

This object should be derived/read-only unless a field's canonical owner explicitly exposes an edit operation.

---

## 12. Forbidden patterns

Do not introduce:

- `DepartmentLocation`, `DietaryLocation`, `PlantLocation`, or another physical place identity
- a second tree of Department rooms
- a second Department responsibility store
- a Location Function, Operational Type, archetype, Department room classification, or profile whose job is to group rooms for other engines
- Operational Area as a substitute location hierarchy
- Zone as a required location layer
- Team as a physical location owner
- Team membership as a substitute for Assignment
- a Department-only Employee identity
- a Department-only Role system beside Employee Builder Roles
- generic Work rebuilt under another name such as Task, Activity, Duty, Routine, or Work Item
- Record requirements converted into generic Work
- PM converted into generic Work
- Work Orders converted into generic Work
- Overview or Facility persisting merged copies of facts from other owners
- UI-local calculations that conflict with canonical Coverage, Records, Operating Rhythm, or authorization resolvers

---

## 13. Implementation migration order

Architecture is decided before code removal. Cleanup should proceed in this order:

1. **Navigation / shell**
   - `Locations` → `Facility`
   - remove `Work`
   - core tabs become Overview / Facility / Operating Rhythm / People & Coverage / Records
   - append Product extensions such as Menus and Preventive Maintenance

2. **Facility read model**
   - use canonical Facility hierarchy and responsibility
   - define one Department Facility composition with no room classification
   - remove Experience/Operational Area concepts from the active path

3. **Remove Location Function indirection**
   - follow the ordered plan in the November 2 elimination audit
   - cycles, records, coverage, runtime, and audit store or read canonical places
   - then drop profile, archetype, binding, and Experience persistence in a forward migration
   - reseed test data; do not migrate it

4. **Work hard retirement**
   - trace all readers/writers of Work Plan, Expected Work, Work occurrences, presets, starter Work, and Work applicability
   - move any legitimate surviving responsibility to its actual owner
   - remove code, routes, UI, schema through forward-only migrations

5. **Employee Builder reorganization**
   - establish Department → Team → Role ownership there
   - migrate Team/Role authoring out of Department Builder
   - separate organizational identity from coverage need and daily Assignment

6. **Zones / Operational Areas / Experience cleanup**
   - prove remaining consumers
   - retire concepts that only duplicate grouping or legacy composition

7. **Records audit**
   - reconcile Records configuration, location applicability, timing, due derivation, and Department Builder UX

8. **Overview composition**
   - build after the underlying sections are canonical so Overview cannot become a source of new concepts

9. **Delete legacy persistence**
   - forward-only Prisma migrations
   - never rewrite applied migrations
   - remove only after reader/writer scans and migration plans are complete

---

## 14. Documentation guardrail

When this architecture changes, update together:

- Product Constitution / current foundation where applicable
- Department Product contract
- Platform Primitives & Engines Registry
- Domain Model ownership table
- Language Guide
- Department Builder UX/interface documentation
- `AGENTS.md`
- legacy-retirement decisions when a store or route becomes non-canonical

Until those older documents are fully reconciled, this decision is the binding source for Department Builder ownership, the Facility lens, Employee Builder ownership of Teams/Roles, and generic Work retirement.

A future implementation prompt must cite or restate these rules before creating a new Department Builder model.
