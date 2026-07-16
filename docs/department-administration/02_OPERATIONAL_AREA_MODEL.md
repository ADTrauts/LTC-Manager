# 02 — Operational Area Model

## The new concept

An **Operational Area** is a named division of a department's work, as a Director would describe it. It is the layer between a Department and its Experiences.

```text
Department
   ↓
Operational Area        ← new concept
   ↓
Experiences
   ↓
Room Archetypes
```

An Operational Area is not a feature, a screen, or a permission. It is a **mental model made structural**. When a Dietary Director says "let's talk about Food Safety," they are naming an Operational Area. Everything they expect to find under that phrase — temperature monitoring, sanitation, HACCP, corrective actions — are the Experiences inside it.

## Definition

> An Operational Area is a durable, department-owned grouping of related Experiences that represents one coherent responsibility a manager holds.

Properties:

- **Named in the department's own language.** "Food Safety," not "Compliance Records."
- **Owned by Department Administration.** Part of the Operational Profile.
- **Composed of Experiences.** An area is meaningless without the Experiences inside it.
- **Stable.** Areas change rarely; they are the department's org chart of work.
- **Not physical.** An area is not a place. It manifests in many rooms through its Experiences.

## Worked examples

### Dietary

```text
Dietary
├── Service
│   ├── Meal Service
│   ├── Meal Times
│   ├── Menus
│   ├── Recipes
│   ├── Production
│   ├── Nourishments
│   └── Tray Accuracy
├── Food Safety
│   ├── Temperature Monitoring
│   ├── Sanitation
│   ├── HACCP
│   └── Corrective Actions
├── Equipment
│   ├── Steam Tables
│   ├── Dish Machines
│   ├── Coffee
│   ├── Coolers
│   ├── Hot Wells
│   └── Smallwares
├── People
│   ├── Assignments
│   ├── Scheduling
│   └── Competencies
├── Documentation
│   ├── Cleaning Lists
│   ├── Knowledge
│   ├── Logs
│   ├── Forms
│   └── Policies
├── Production
│   ├── Forecasting
│   └── Batch Records
└── Quality
    ├── Rounding
    ├── Satisfaction
    └── Audits
```

### EVS

```text
EVS
├── Cleaning
│   ├── Room Cleaning
│   ├── Project Cleaning
│   └── Cleaning Lists
├── Room Status
│   ├── Bed Tracking
│   └── Turnover
├── Equipment
│   ├── Floor Machines
│   └── Carts
├── Compliance
│   ├── Infection Control
│   └── Audits
└── People
    ├── Assignments
    └── Scheduling
```

### Plant Operations

```text
Plant
├── Assets
│   ├── Asset Registry
│   └── Condition
├── Work Orders
│   ├── Reactive Repairs
│   └── Requests
├── Preventive Maintenance
│   ├── PM Schedules
│   └── Rounds
├── Utilities
│   ├── Generators
│   ├── Boilers
│   └── Water Systems
├── Compliance
│   ├── Life Safety
│   └── Inspections
└── People
    ├── Assignments
    └── Scheduling
```

## Why Operational Areas exist

1. **They match how directors think.** A director's job is defined by areas of responsibility, not by software features. Structuring the system around areas means a director understands it in minutes.
2. **They give Experiences a home.** Meal Service without Service is orphaned. Areas provide the grouping that makes a long list of Experiences navigable.
3. **They stabilize navigation.** Experiences may be added, renamed, or refined; the areas persist. Navigation does not churn every time the catalog grows.
4. **They localize accountability.** An area maps cleanly to a lead or a manager. "Who owns Food Safety?" has an answer.
5. **They make expansion additive.** A new Experience joins an existing area. A new department composes areas. Neither disturbs the platform.

## Why modules disappear

Today the system exposes software modules: Logs, Knowledge, Equipment, Repairs, Assignments. These are engineering categories — they describe the *shape of the data*, not the *work of the department*.

Modules fail as an organizing model because:

- **They are not how anyone works.** No director walks the floor thinking about "Logs." They think about Food Safety and use a log as one tool within it.
- **They flatten meaning.** "Logs" lumps temperature logs, cleaning logs, and refrigerator logs into one bucket even though they belong to entirely different responsibilities.
- **They do not scale.** Every new capability becomes another top-level module, and the navigation becomes a junk drawer.

Under this architecture, modules dissolve into two things:

1. **Operational Areas** — the organizing layer (what modules pretended to be).
2. **Tools inside Experiences** — a log, a form, a knowledge article is a tool that appears *inside* the Experience it supports.

So "Logs" is not deleted; it is relocated. A temperature log lives inside the Temperature Monitoring Experience inside the Food Safety area. It is reachable exactly where the work happens, and nowhere else.

## Relationship to the layers below

- **Experiences** are the reusable building blocks an area contains (`03`).
- **Room Archetypes** describe how the area's Experiences behave in a type of room (`04`).
- **Projection** later resolves which area and which Experiences appear in a specific room for a specific user (`08`).

## Rules

1. Every active Experience belongs to exactly one Operational Area within a given department's profile.
2. Operational Areas are department-scoped. Dietary's "Equipment" and Plant's "Assets" are different areas even where they overlap conceptually.
3. Areas are drawn from a shared vocabulary where possible so cross-department reporting stays coherent, but a department may name its own.
4. An area with no active Experiences is not shown. Areas are never empty shells.
