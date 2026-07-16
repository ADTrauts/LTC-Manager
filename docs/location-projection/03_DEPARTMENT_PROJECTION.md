# 03 — Department Projection

## Core rule

A department projection is the intersection:

```text
placed physical hierarchy
∩ department responsibility or facility policy
∩ capability-to-experience rules
∩ user/employee access
∩ active operational state where relevant
```

Department identity alone does not expose every location. Physical type alone does not expose a department. A capability alone does not bypass access.

## Example: one room, three projections

Physical truth:

```text
Ground Floor
  └── Kensington
        └── Servery
```

The room exists once. It may have explicit Dietary and EVS responsibility rows. Plant reaches it through the facility-wide maintenance policy.

### Dietary projection

Possible enabled experiences:

- Meal Service from `MEAL_SERVICE`
- Meal Times from `MEAL_SERVICE` plus applicable service scheduling
- Service Logs from `SERVICE_LOGS`
- Food Safety from `FOOD_SAFETY`
- Dietary Cleaning from `CLEANING` under Dietary ownership
- Dietary Knowledge from `KNOWLEDGE`
- Dietary Equipment from department-owned equipment context plus `ASSET_MANAGEMENT`

The projection does not include EVS room-state controls or Plant PM controls.

### EVS projection

Possible enabled experiences:

- Cleaning from `CLEANING`
- EVS work/checklists from `WORK_QUEUE`
- EVS inspections from `INSPECTIONS`
- EVS Knowledge from `KNOWLEDGE`
- Room status from `ROOM_STATUS`

The projection does not include meal service, food safety, meal times, or Plant PM.

### Plant projection

Possible enabled experiences:

- Equipment and assets from `ASSET_MANAGEMENT`
- Preventive maintenance from `BUILDING_MAINTENANCE` or the Plant maintenance policy
- Work orders and repairs from `REPAIRS`
- Plant inspections from `INSPECTIONS`

The projection does not include meal service, Dietary logs, or EVS cleaning controls.

## Why department plus capability is required

Some capability labels are intentionally reusable. `CLEANING`, `KNOWLEDGE`, `INSPECTIONS`, `REPAIRS`, and `ASSET_MANAGEMENT` can be meaningful to more than one department.

The experience resolver therefore evaluates:

```text
department identity
+ effective capabilities
+ domain ownership
+ physical applicability
```

For example, Dietary and Plant may both hold `ASSET_MANAGEMENT`. Dietary receives a Dietary equipment context; Plant receives the maintenance asset context. This is not duplicated location data. It is a department-owned interpretation of the same room and related domain records.

## Experience descriptors

Capabilities should not be translated directly into UI component names. A central experience registry maps stable operational meaning:

```ts
type ExperienceDescriptor = {
  id:
    | "MEAL_SERVICE"
    | "MEAL_TIMES"
    | "SERVICE_LOGS"
    | "FOOD_SAFETY"
    | "DEPARTMENT_CLEANING"
    | "ROOM_STATUS"
    | "DEPARTMENT_INSPECTIONS"
    | "DEPARTMENT_KNOWLEDGE"
    | "DEPARTMENT_EQUIPMENT"
    | "PREVENTIVE_MAINTENANCE"
    | "WORK_ORDERS";
  departmentId: string;
  requiredCapabilities: CapabilityRequirement;
  dataDomains: readonly OperationalDomain[];
  actions: readonly string[];
};
```

Descriptors state what may be composed and loaded. UI components remain downstream consumers.

## Responsibility and policy precedence

1. Builder-only or inactive physical nodes are excluded.
2. A room's direct responsibility grants its stored capabilities to that department.
3. Floor and Neighborhood responsibilities do not implicitly flow to rooms.
4. The facility-wide Plant policy grants only its declared maintenance domains to placed locations.
5. Principal access narrows the result.
6. A department with no resulting experience does not receive an actionable location.

The Plant policy must be evaluated centrally. It must not be implemented by copying Plant responsibility rows into every room.

## Domain ownership

Domain records retain their existing owners:

- meal service and meal times: Dietary;
- room cleaning status: EVS;
- PM and maintenance work: Plant;
- inspections and knowledge: department-scoped by their owning metadata;
- repairs/issues: responsible department and requesting context;
- assignments: department plus operational location scope.

Projection does not transfer ownership. It determines whether owned records are relevant at a physical place for the active department.

## Assignment interaction

Assignments can narrow what a person sees first, but assignment is not the source of department location eligibility.

```text
department projection = places where the department can operate
employee assignment = current work placement within that projection
```

An assignment outside the resolved department projection is invalid data and should be diagnosed, not silently used to broaden visibility.

## Readiness interaction

Readiness must be computed only for operational nodes in the department projection, using the department profile and only its allowed signals.

Parent readiness is an aggregate over projected actionable descendants. Structural ancestors never select a readiness profile by Unit type.

This prevents a Plant projection from becoming meal-driven merely because a room is physically a servery.

## Facility Overview interaction

Leadership may inspect the same room across departments, but each summary and drill-down stays labeled:

```text
Servery
  Dietary — meal service needs attention
  EVS — ready
  Plant — PM due
```

Facility Overview may correlate these states. It must not merge their controls or capability sets.
