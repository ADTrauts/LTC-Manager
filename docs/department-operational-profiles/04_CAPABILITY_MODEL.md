# 04 — Capability Model

## Decision

**Experiences replace configurable capabilities completely in the target product architecture.**

Do not keep a hybrid model in which Operational Profiles expose both Experience selections and capability arrays.

The word “capability” may remain in internal engineering language for authorization or adapter requirements, but no product administrator selects capabilities and no projection treats them as operational truth.

## Why a hybrid model is rejected

A hybrid appears safe:

```text
Experience
  requires capabilities
Room or profile
  grants capabilities
Projection
  resolves both
```

It creates two independently configurable truths:

- the department says it has Meal Service;
- capability data says it does or does not have `MEAL_SERVICE`.

The system must then define precedence, drift handling, audit behavior, and fallback rules. Administrators cannot understand why an enabled Experience is missing. Projection remains a policy interpreter.

That complexity adds no product value.

## Why Experiences are sufficient

An enabled Experience already states the operational intent.

If a Dietary Servery has Meal Service, the Meal Service implementation knows which:

- data it loads;
- actions it contributes;
- readiness signals it emits;
- routes it advertises;
- role permissions it requires.

Those implementation requirements should travel with the Experience contract, not be independently granted by the room.

## Separation from authorization

Experience activation does not authorize a person.

Visibility and action still require:

```text
Experience active in the Department Operational Profile
AND Room assigned to the Department
AND user has facility and location access
AND role/action authorization passes
AND domain record is in scope
```

RBAC, employee access, and domain authorization remain authoritative.

Do not rename RBAC permissions to Experiences. They solve different problems:

- Experience: what the department operates.
- Permission: what this person may do.

## Internal implementation requirements

An Experience implementation may declare internal requirements such as:

```text
data domains
read models
write actions
readiness signals
dependencies
role permission keys
```

These are code-owned contracts. If engineers call them capabilities internally, they must remain:

- non-configurable;
- non-persisted as room/profile grants;
- derived from Experience identity;
- invisible to Facility Builder;
- invisible to Department Administration;
- unable to override Experience activation.

To prevent conceptual regression, architecture documents should prefer “Experience requirements” or “action permissions” rather than reusing “capability.”

## Current capability keys

Today's keys fall into three categories.

### Product Experiences in disguise

- `MEAL_SERVICE`
- `FOOD_SAFETY`
- `CLEANING`
- `ROOM_STATUS`
- `INSPECTIONS`
- `REPAIRS`
- `KNOWLEDGE`
- `ASSET_MANAGEMENT`
- `SERVICE_LOGS`

These map into canonical Experiences.

### Over-broad composition concepts

- `SERVICE_OPERATIONS`
- `WORK_QUEUE`
- `BUILDING_MAINTENANCE`

These should not become selectable Experiences without refinement. Work Queue is an output composed from active Experiences. Building Maintenance should resolve into specific Plant Experiences such as Assets, Preventive Maintenance, Repairs, Work Orders, and Manuals.

### Missing product distinctions

Current keys do not clearly represent:

- Meal Times;
- Menus;
- Recipes;
- Production;
- Cleaning Lists versus Cleaning Logs;
- Equipment versus Assets;
- Preventive Maintenance versus corrective Repairs;
- Work Orders;
- Manuals.

Expanding capability keys would deepen the mixed abstraction rather than fix it.

## Compatibility policy

Current persisted capability arrays remain untouched until an authorized implementation wave.

During migration:

1. Read existing room assignments and capability arrays.
2. Translate known capability combinations into proposed profile archetypes and Experiences.
3. Require review for ambiguous or custom combinations.
4. Keep legacy reads available for comparison and rollback.
5. Once a room/department resolves through a certified profile, profile Experiences are authoritative.
6. Never dual-write profiles back into raw capability arrays as permanent behavior.
7. Retire capability reads only after parity and audit completion.

This is one-way conceptual migration:

```text
legacy capabilities → proposed Experiences
```

not:

```text
legacy capabilities ↔ Experiences
```

## Architecture rule

If a future feature asks, “Which capabilities should this room receive?”, the question is malformed.

Ask:

> Which Department Experience belongs in this department's Room Archetype, and what authorization does that Experience require?
