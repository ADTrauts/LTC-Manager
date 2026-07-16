# 01 — Problem Statement

## The boundary error

Facility Builder currently allows a room responsibility to carry raw operational capability keys such as:

- Meal Service
- Food Safety
- Cleaning
- Asset Management
- Inspections
- Repairs
- Knowledge
- Work Queue

This combines two different questions:

1. **Who operates in this room?**
2. **What operating model does that department use there?**

Facility Builder should answer only the first question. The department should answer the second.

## Why the current model looked reasonable

At first, a department-room relationship appeared to need descriptive detail. A Dietary responsibility in a servery could list Meal Service and Food Safety. An EVS responsibility could list Cleaning and Room Status. A Plant responsibility could list Assets and Repairs.

That worked while each key was treated as a simple visibility switch. It breaks down once those switches imply:

- navigation;
- data loaders;
- workflows;
- readiness signals;
- checklists;
- configuration;
- domain ownership;
- actions;
- reporting;
- knowledge context.

Those are not properties of the physical room or its ownership relationship. They are parts of a department's product model.

## Architectural consequences of raw room capabilities

### Facility Builder becomes module-aware

The physical administration surface must understand product modules and operational terminology. Adding Recipes, Preventive Maintenance, Cleaning Logs, or Manuals becomes a Facility Builder concern even though physical structure did not change.

### The same department is configured repeatedly

Every servery can receive the same collection of Dietary keys. Every resident room can receive the same EVS collection. Repeated checkboxes create drift rather than intentional variation.

### Department defaults have no owner

There is nowhere to state:

> Every Dietary Servery normally includes Meal Service, Meal Times, Food Safety, Equipment, and Knowledge.

The system can only repeat that decision room by room.

### Operational meaning is too coarse

`CLEANING` could mean Dietary self-cleaning, EVS daily cleaning, discharge cleaning, a checklist, a log, a readiness signal, or all of them. A raw key does not define a coherent product experience.

### Projection becomes a policy interpreter

The earlier Projection Engine design needed a capability-to-experience registry because the input lacked product meaning. That makes projection responsible for inventing department behavior instead of deriving already-defined behavior.

### Governance is misplaced

Changing a department's operational model requires editing physical locations. A department leader cannot govern its own standards independently of Facility Builder administration.

### Auditing becomes ambiguous

A changed capability could mean a physical ownership change, an operational policy change, or a temporary UI preference. Those changes require different authority and audit treatment.

## Correct separation

```text
Facility Builder
  Room exists
  Room belongs under this Neighborhood
  Dietary operates here
  EVS operates here
  Plant operates here

Department Administration
  Dietary treats this as a Servery
  Servery includes Meal Service, Food Safety, and Meal Logs

  EVS treats this as a Food Service Area
  Food Service Area includes Cleaning Lists and Inspections

  Plant treats this as an Equipment Area
  Equipment Area includes Assets, PM, Repairs, and Manuals
```

The room's physical identity remains shared. Its department-specific operational classification and Experiences are independent.

## Product-level discovery

Capabilities in the current implementation are mostly **misnamed Experiences**.

`MEAL_SERVICE`, `FOOD_SAFETY`, `CLEANING`, `INSPECTIONS`, `REPAIRS`, and `KNOWLEDGE` are recognizable product areas, not low-level abilities. Meanwhile `SERVICE_OPERATIONS` and `WORK_QUEUE` are broad implementation groupings. Mixing both levels in one array guarantees inconsistent interpretation.

The architecture should not normalize this mixed list. It should replace it with a single product-level concept.

## Decision

Raw capabilities no longer belong in Facility Builder or in the long-term room responsibility model.

Facility Builder retains only the department assignment:

```text
Room ↔ Department
```

Department Administration owns:

```text
Department → Operational Profile → Room Archetype → Experiences
```

Projection consumes the result. It does not infer department behavior from room-owned flags.

## What remains valid

The current capability arrays remain real compatibility data until a future implementation safely translates them. This architecture does not authorize deleting or changing them.

Their existence does not make them the target source of truth.
