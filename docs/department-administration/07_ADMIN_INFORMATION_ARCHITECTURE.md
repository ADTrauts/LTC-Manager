# 07 — Administration Information Architecture

## Purpose

This document designs the future **Administration** area as an information architecture — the top-level organization of everything an administrator configures. It is not UI. It defines the sections, what belongs in each, and where Department Administration fits.

## Principle

Administration is organized by **what is being administered**, and each section respects the ownership boundaries from `01`. Nothing in Administration blurs the line between physical structure, operational model, derivation, and live truth.

## Top-level sections

```text
Administration
├── Facility          physical structure and vocabulary
├── Departments       operational models (Department Administration lives here)
├── Employees         people, roles, competencies
├── Assets            tracked physical assets across departments
├── Knowledge         reference content library
├── Scheduling        staffing patterns and rules
├── Integrations      external systems and data exchange
└── Organization      multi-facility structure, standards, governance
```

### Facility

The Facility Builder home. Physical truth only.

- Facilities, Floors, Neighborhoods, Rooms.
- Physical room classifications (department-neutral).
- Room ↔ Department assignment.
- Vocabulary (e.g., "Unit" vs. "Neighborhood").
- **Never** operational Experiences or Areas.

### Departments

Where Department Administration lives. This is the heart of this package.

Within Departments, an administrator manages, per department:

- **Operational Areas** — the department's organizing structure (`02`).
- **Experiences** — selected from the catalog and arranged into areas (`03`).
- **Room Archetypes** — how the department operates by room kind (`04`).
- **Operational Profile** — the configuration layers, certification, and versioning (`05`).
- **Expansion** — onboarding a new department by composition (`06`).

Departments is the only place operational models are authored. It reads Facility (rooms, assignments) but never edits it.

### Employees

People administration.

- Employee records, roles, department membership.
- Competencies and certifications (referenced by People areas across departments).
- Access — which Experiences a person can see/act on (input to Projection).

### Assets

Cross-department asset registry.

- The canonical asset records that Equipment/Assets Experiences reference.
- Asset classification, location (references Facility rooms), condition.
- Shared so Dietary's steam table and Plant's boiler live in one registry with department-specific Experiences on top.

### Knowledge

The reference content library — the *source*, not a navigation destination for workers.

- Authoring and versioning of knowledge content.
- Tagging content to Experiences so it surfaces in context (Food Safety knowledge appears inside Food Safety).
- Reinforces the decision in `03`: Knowledge is a tool surfaced in context, and this section is only where the library is *maintained*.

### Scheduling

Staffing structure and rules.

- Schedule templates, shift patterns, coverage rules.
- Consumed by every department's People area (Scheduling Experience).
- Centralized so scheduling is consistent across departments.

### Integrations

External connections.

- Interfaces to EHR, HR, procurement, building systems.
- Data mappings that feed Experiences (e.g., census into Meal Service).
- Kept separate so operational models never hard-code integration details.

### Organization

Multi-facility and governance.

- Organization → Region → Facility structure.
- **System Department Baselines** (`05`, Layer 1) — the standard models published to facilities.
- Governance of the Experience Catalog and shared Operational Area vocabulary.
- Standards, policies, and rollout of baseline versions.

## Where the boundaries show up in the IA

```text
Facility        → Facility Builder            (physical truth)
Departments     → Department Administration   (operational model)
Employees/Assets/Knowledge/Scheduling
                → shared resources referenced by Experiences
Integrations    → external data plumbing
Organization    → platform governance + baselines
```

Projection and Operational Engines are **not** Administration sections. They are runtime layers. Administration configures the model; Projection derives from it; engines execute within it.

## Rules

1. Administration sections mirror ownership boundaries; no section crosses them.
2. Department Administration lives only under Departments.
3. Facility is physical-only and never shows Experiences or Areas.
4. Shared resources (Employees, Assets, Knowledge, Scheduling) are referenced by Experiences, not redefined per department.
5. Organization owns baselines and catalog governance for the whole platform.
