# 16 — Department Builder Architecture

**Status:** Binding Department Builder architecture decision  
**Decision date:** November 1, 2026  
**Scope:** Department Builder ownership, Facility composition, Location Functions, People & Coverage ownership, generic Work retirement, and Department-specific extensions.  
**Product-owner decision:** Accepted. There are no customer installations whose compatibility requires preserving the retired generic Work or duplicate Department Builder concepts.

This document is the binding contract for Department Builder. Where older Department Builder, location-programming, generic Work, Team, Zone, Operational Area, Operational Type, or archetype guidance conflicts with this decision, this document wins. The affected older material must be reconciled rather than extended.

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
- Location Function summary
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
- What Department-specific function does each responsible place serve?
- Which Operating Rhythm applies or participates here?
- Which Records requirements apply here?
- Which organizational / coverage information is relevant here?
- Which Department-specific capabilities apply here?

The Facility section may summarize information owned by other engines. Editing should remain with the canonical owner unless the edit is specifically the Department-to-location semantic binding described below.

### 4.3 Location Function is the one Department-specific location semantic

**Location Function** is the canonical manager-language concept for the role an existing physical place serves for a particular Department.

Examples:

- Food and Nutrition: Resident Servery, Production Kitchen, Retail Service Area
- Environmental Services: Resident Care, Service Support

The Product may define available/default Location Function keys and labels. The facility binds those functions to existing responsible locations.

The same physical room may have different Location Functions for different Departments because the physical identity is shared while the Department meaning is scoped.

### 4.4 Legacy implementation vocabulary

Current code still uses names such as:

- `DepartmentRoomArchetype`
- Operational Type
- archetype binding
- `DepartmentOperationalProfile`

These names must **not** cause creation of another concept.

Until code is migrated, they are implementation/compatibility names for the Location Function mechanism and its publication/effective-dating behavior. New UI, documentation, APIs, services, or schemas must use **Location Function** as the product concept.

Do not introduce a new `LocationFunction` persistence model beside the existing archetype/profile mechanism without an explicit migration plan. The goal is consolidation/rename, not a third implementation.

### 4.5 Publication / effective dating

The existing working/ACTIVE profile mechanism may remain where it is needed to preserve draft-versus-published configuration and historical effective truth.

The architecture decision is about **ownership**, not about removing useful publication semantics.

The desired rule is:

- Build edits working Department-scoped Location Function bindings.
- Run reads the effective published bindings.
- Audit reads the bindings effective on the requested service date.

A later code pass should simplify profile/archetype implementation only after all consumers have been traced.

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

The Facility section may associate an existing location / Location Function with participation in an Operating Rhythm, but it must not create a second timing model.

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

### 7.3 Current Team model is overloaded legacy

The current `DepartmentTeam` family mixes organizational grouping with manager, membership, room applicability, cycle links, required count, and coverage grain.

That shape is not the target architecture.

During implementation cleanup:

- retain the **Team** business concept, but move its canonical authoring/ownership to Employee Builder
- retain **Role** as a workforce concept under Team
- remove Team as a shadow location-programming mechanism
- separate coverage need from Team identity where necessary
- do not let Team membership define physical location identity

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
      where: canonical Facility place / Location Function
      when: canonical Operating Rhythm where applicable
  → derived due requirement
  → submitted Record
  → Audit / Reports
```

The Facility section may show which Records apply to a place. It does not become the Record definition or evidence store.

`DepartmentRecordApplicability` using canonical Record attachments plus Cycle/Phase and the existing archetype/Location Function binding is conceptually aligned with this direction, though terminology must be reconciled.

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
- Location Function as the Department-specific meaning of an existing place
- draft/published/effective-dated semantics where consumers require them
- Operating Rhythm
- one Records engine
- shared Asset registry
- place-centric read/composition models, provided they persist no shadow truth

### KEEP, BUT MOVE / CONSOLIDATE

- **Teams** → Employee Builder ownership
- **Roles** → Employee Builder ownership under Teams
- **Coverage need** → explicit workforce/coverage configuration, separate from Team identity where necessary
- current archetype/Operational Type implementation → one Location Function mechanism and vocabulary

### RETIRE / DO NOT EXTEND

- generic Department Builder **Work** section
- generic Work Plan / Expected Work / Work occurrence / Work preset architecture
- old Experience-based Department location composition
- Operational Areas as a second Department grouping of physical places
- Experience catalog as product/location structure
- Operational Type as user-facing/product terminology
- archetype as user-facing/product terminology
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
Location Function: Resident Servery
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
  function        ← Department Location Function binding
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
- a second “Location Function” model beside the current mechanism without a migration/consolidation plan
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
   - define one Department Facility composition
   - migrate manager language to Location Function
   - remove Experience/Operational Area concepts from the active path

3. **Location Function implementation reconciliation**
   - trace `DepartmentOperationalProfile`, `DepartmentRoomArchetype`, bindings, exceptions, and all Run/Audit consumers
   - keep publication/effective dating that is still required
   - consolidate naming/models rather than adding another layer

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
