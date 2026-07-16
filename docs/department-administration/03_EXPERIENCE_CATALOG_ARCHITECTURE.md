# 03 — Experience Catalog Architecture

## What an Experience is

> An **Experience** is a stable, user-recognizable operational product area that a department can turn on, place, and work inside.

An Experience is the reusable building block of the platform. It is named the way a worker would name the work: Meal Service, Cleaning, Repairs, Preventive Maintenance. It is not a database table (that is a domain object) and it is not a screen (that is a rendering of one).

This document defines the **catalog** of Experiences — the shared library from which every department composes its Operational Areas.

## The three roles around an Experience

An Experience sits at the intersection of three responsibilities, each owned by a different layer:

```text
Operational Areas ORGANIZE Experiences   (Department Administration)
Experiences are the reusable building blocks
Projection DELIVERS Experiences          (Projection Engine)
```

- **Operational Areas organize them.** An area groups Experiences into the manager's mental model.
- **Experiences are reusable building blocks.** The same Meal Service Experience can be used by many facilities and referenced by many rooms.
- **Projection delivers them.** Projection decides which Experiences appear in which room for which user, at what time.

## Catalog examples

The catalog is shared across the platform. Departments select from it; they do not each reinvent it.

| Experience | Typical Area(s) | What it represents |
|---|---|---|
| Meal Service | Service (Dietary) | Serving meals to residents/patients |
| Menus | Service (Dietary) | Menu planning and cycles |
| Production | Service / Production (Dietary) | Food production and batch output |
| Nourishments | Service (Dietary) | Between-meal nourishment programs |
| Tray Accuracy | Service / Quality (Dietary) | Verifying tray correctness |
| Temperature Monitoring | Food Safety (Dietary) | Temp checks and holding |
| Cleaning | Cleaning (EVS), Documentation (Dietary) | Cleaning execution and lists |
| Room Status | Room Status (EVS) | Bed/room readiness and turnover |
| Repairs | Work Orders (Plant) | Reactive maintenance |
| Assets | Assets (Plant), Equipment (Dietary/EVS) | Tracked physical assets |
| Preventive Maintenance (PM) | Preventive Maintenance (Plant) | Scheduled maintenance |
| Assignments | People (all) | Assigning work to people |
| Scheduling | People (all) | Staff scheduling |
| Forms | Documentation (all) | Structured data capture |
| Logs | (inside owning Experience) | Recurring record capture |
| Knowledge | (inside owning Experience) | Reference guidance |
| Rounding | Quality (all) | Structured walkthroughs |
| Audits | Compliance / Quality (all) | Compliance checks |

## The critical reclassification: tools vs. Experiences

Some things we currently call modules are **not Experiences** — they are **tools** that live inside Experiences.

- **Logs** is a tool. A log is a recurring capture surface. It has no meaning on its own; a temperature log belongs to Temperature Monitoring, a cleaning log belongs to Cleaning. There is no top-level "Logs."
- **Knowledge** is a tool. Guidance appears inside the Experience it supports. HACCP knowledge appears inside Food Safety; PM procedures appear inside Preventive Maintenance. Knowledge is contextual, not a destination.
- **Forms** is a tool. A form is a capture mechanism used by many Experiences. It is configured centrally but surfaced inside the work.

### The test for "Experience vs. tool"

Ask: *"Would a worker say they are going to go do this?"*

- "I'm going to do Meal Service." → Experience.
- "I'm going to do the temperature log." → tool inside Temperature Monitoring.
- "I'm going to check the Knowledge." → tool, appears in context.

If the answer names the work, it is an Experience. If it names the instrument, it is a tool.

## Catalog structure

The catalog is a flat, versioned library of Experience definitions. Each Experience definition carries:

- A stable identifier and human name.
- A short operational description (what work it represents).
- The tools it can expose (logs, forms, knowledge, records).
- The domain engines it reads/writes (readiness, operations, assignments) — reference only, not implemented here.
- Default Room Archetype behavior hints (see `04`).

Departments never edit the catalog definition. They **select** an Experience, **place** it in an Operational Area, and **tune** its behavior per Room Archetype within their profile.

## Why a shared catalog

1. **Reuse.** Cleaning means the same thing whether EVS or Dietary uses it. One definition, many consumers.
2. **Coherent reporting.** Cross-department metrics require shared definitions. "Audits completed" is comparable only if Audits is one Experience.
3. **Additive growth.** A new Experience is added to the catalog once and becomes available to every department without platform surgery.
4. **Governance.** The catalog is the controlled vocabulary. It prevents each department from inventing overlapping, incompatible concepts.

## Rules

1. An Experience is defined once in the catalog and reused everywhere.
2. Logs, Knowledge, and Forms are tools, not top-level Experiences, and always appear inside an owning Experience.
3. A department selects Experiences into Operational Areas; it does not author new catalog Experiences ad hoc.
4. Projection is the only layer that decides where a selected Experience actually appears.
5. Adding a department capability means adding an Experience to the catalog, never adding a module to the platform.
