# 05 — Department Configuration

## Configuration principle

Each Facility Department owns one active Operational Profile. Department Administration configures that profile once, then maps the Department's assigned rooms to department-owned Room Archetypes.

Facility Builder does not display or modify operational Experiences.

## Configuration layers

### System Department Baseline

LTC Manager provides a curated starting model for a known department family.

It supplies:

- recommended Room Archetypes;
- recommended Experiences per archetype;
- department-wide Experiences;
- safe configuration defaults;
- suggested mappings from physical room characteristics.

The baseline accelerates setup. It is not hidden runtime inheritance.

### Facility Department Profile

The facility reviews and adopts a profile revision. It may:

- enable or disable eligible Experiences;
- configure Experience parameters;
- rename local archetype labels where allowed;
- add a custom archetype from approved Experience choices;
- define default mappings;
- establish permitted room exceptions.

The Facility Department Profile is the effective operational source of truth.

### Room assignment to archetype

For each Room assigned to the Department, Department Administration selects the operational archetype.

This binding does not duplicate the Room or its ownership. It states how the Department interprets its work in that Room.

### Sparse room exception

A room may require a controlled exception:

- a Servery without Meal Service;
- a Resident Room with an isolation cleaning program;
- a Mechanical Room without maintainable assets;
- a public space with additional inspections.

Exceptions should record only deviations from the archetype and include reason, author, and review status. They must not become unrestricted per-room Experience checklists by default.

## Dietary example

Department-wide Experiences:

- Menus
- Recipes
- Production planning
- Dietary Knowledge
- department inspections and reporting

Room Archetypes:

```text
Servery
  Meal Service
  Meal Times
  Meal Logs
  Food Safety
  Department Cleaning
  Equipment
  Knowledge
  Inspections

Production Kitchen
  Production
  Recipes
  Food Safety
  Production Logs
  Department Cleaning
  Equipment
  Repairs visibility
  Knowledge
  Inspections

Dietary Storage
  Food Safety
  Inventory-adjacent checks where supported
  Department Cleaning
  Equipment
  Knowledge

Dietary Office
  Knowledge
  department-level work links
```

## EVS example

Department-wide Experiences:

- EVS Knowledge
- assignment overview;
- inspection program management;
- cleaning program reporting.

Room Archetypes:

```text
Resident Room
  Cleaning Lists
  Cleaning Logs
  Room Status
  Knowledge
  Inspections

Public Area
  Cleaning Lists
  Cleaning Logs
  Knowledge
  Inspections

Restroom
  Cleaning Lists
  Cleaning Logs
  Room Status
  Inspections

Soiled Utility
  Cleaning Lists
  Cleaning Logs
  Knowledge
  Inspections

Food Service Area
  Cleaning Lists
  Cleaning Logs
  Knowledge
  Inspections
```

EVS does not receive Dietary Meal Service merely because it operates in a Servery.

## Plant example

Department-wide Experiences:

- Asset registry;
- Preventive Maintenance program;
- Work Orders;
- Repairs;
- Plant Knowledge and Manuals;
- department inspections.

Room Archetypes:

```text
Mechanical Room
  Assets
  Preventive Maintenance
  Repairs
  Work Orders
  Manuals
  Inspections

Equipment Area
  Assets
  Preventive Maintenance
  Repairs
  Work Orders
  Manuals

General Maintainable Space
  Repairs
  Work Orders
  linked Assets where present
  Manuals where linked

Utility Area
  Assets
  Preventive Maintenance
  Repairs
  Work Orders
  Inspections
```

Plant's facility-wide responsibility may cause all placed Rooms to be eligible for a Plant archetype. The Operational Profile still determines which Plant Experiences each archetype exposes.

## Custom departments

Future departments use the same architecture:

1. choose a department family or custom baseline;
2. define department-owned Room Archetypes;
3. select eligible Experiences from the canonical catalog;
4. configure defaults and room mappings;
5. certify the profile.

Custom departments cannot invent executable Experience IDs. New product Experiences require product architecture governance.

## Configuration validation

A profile is certifiable only when:

- every assigned Room has an archetype or an explicit pending status;
- every selected Experience is eligible for the department;
- required Experience configuration is complete;
- no room exception selects an ineligible Experience;
- department-wide and room-scoped Experiences are not confused;
- external dependencies are available or clearly marked unavailable;
- the profile has an accountable owner.

## Change control

Operational Profile changes can alter visible work and readiness. They require:

- draft review before activation;
- impact preview by Room and Experience;
- an effective revision boundary;
- audit history;
- rollback to a previous certified revision;
- no silent activation from system default updates.

These are governance requirements, not implementation authorization.
