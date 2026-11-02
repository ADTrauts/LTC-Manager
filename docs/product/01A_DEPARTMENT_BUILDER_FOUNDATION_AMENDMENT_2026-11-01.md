# Product Constitution Amendment — Department Builder Foundation

**Status:** Accepted product-owner architecture amendment  
**Decision date:** November 1, 2026  
**Amends:** [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md)  
**Detailed contract:** [16 — Department Builder Architecture](./16_DEPARTMENT_BUILDER_ARCHITECTURE.md)

This amendment records a product-owner decision made after the October 26, 2026 foundation. It is forward architecture. Older Constitution language that names generic Work as a shared engine, Work presets as Department Product content, or Work as a standard Department Builder section is superseded by this amendment.

The long-form Constitution should be textually reconciled when the implementation retirement is performed. Until then, this amendment prevents stale paragraphs from being treated as permission to extend the retired design.

---

## Amendment A — Department Builder

Department Builder is the **configuration and information hub for one installed Department**.

Every Department uses the same core shell:

- Overview
- Facility
- Operating Rhythm
- People & Coverage
- Records

Department Products may contribute genuine domain-specific extensions. Current examples:

- Food and Nutrition → Menus
- Facility Plant Operations → Preventive Maintenance

A Product-specific extension does not create another Department Builder architecture.

---

## Amendment B — Facility ownership

There is one physical Facility tree. Facility Builder owns physical identity, hierarchy, physical room/space type, and Department responsibility.

Department Builder → Facility consumes that canonical tree through the selected Department lens. It does not create another physical location identity or responsibility store.

The Department-specific semantic applied to an existing responsible place is **Location Function**.

Current implementation names such as `DepartmentRoomArchetype`, Operational Type, archetype binding, and profile are not separate product concepts. They are compatibility/implementation details to consolidate around Location Function while retaining required draft/publish/effective-dating semantics.

The same physical room may carry different Location Functions for different Departments.

---

## Amendment C — Workforce ownership

Employee Builder owns workforce organization:

```text
Department
  → Team
    → Role
      → Employee
```

Department Builder → People & Coverage consumes that organization and combines it with coverage information.

Team identity, Role identity, and Employee identity are not Department Builder-owned engines. Coverage remains derived from configured need plus canonical Shift, call-off, and Assignment facts.

Existing Department Team / Job Role implementations must be reconciled toward this ownership. No second Department-only role/capability system may be added.

---

## Amendment D — Generic Work retirement

Generic Department Work is retired from the forward architecture.

Remove, after dependency tracing:

- the Department Builder Work section
- Work Plans / Work Plan items
- Expected Work
- generic Work occurrences
- Product Work presets / starter Work
- generic Work applicability
- generic Work consumers that have no other valid owner

Do not replace Work with a renamed generic Task/Activity/Duty/Routine engine.

Records stay Records. Operating Rhythm owns recurring time. Shift/Assignment/Coverage own staffing. Facility Plant Operations Work Orders and Preventive Maintenance remain domain capabilities and are not generic Work.

Marketplace language no longer includes generic Work presets.

---

## Amendment E — Composition rule

A Department Builder page may compose facts from several canonical owners. Composition does not transfer ownership.

> **Display can compose. Editing follows ownership.**

Examples:

- Facility may show an Operating Rhythm, Team, Record requirement, Asset, or Menu for a location.
- People & Coverage may show Facility and Operating Rhythm context.
- Overview may summarize all sections.

These views persist no merged copies merely to simplify a screen.

---

## Amendment F — Legacy concepts

The following are not forward Department Builder concepts:

- Operational Type as manager/product language
- archetype as manager/product language
- Experience tree / Experience catalog
- Operational Areas as a second location structure
- generic Work
- Department-only role systems beside Employee Builder

Department operational Zones are a retirement candidate, not a required Facility layer. No new Zone dependencies may be added while remaining readers/writers are traced.

---

## Amendment G — Standard platform wording

When older architecture text says every Department receives a generic Work engine or Work presets, read the forward shared mechanisms as:

- one physical Facility tree
- Location Function mechanism
- Operating Rhythm / Operational Cycles
- one Records engine
- shared Assets
- shared People / Shift / Assignment / Coverage mechanisms
- Department-specific capabilities where explicitly defined
- Dashboard / frontline compositions that read those owners without merging stores

This amendment does not itself delete code or database rows. Removal is governed by [Generic Department Work Retirement](../legacy-retirement/DEPARTMENT_WORK_RETIREMENT_2026-11-01.md) and the repository's forward-only migration rules.
