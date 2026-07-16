# 03 — Experience Model

## Definition

An **Experience** is a stable, user-recognizable operational product area that a department can activate through its Operational Profile.

An Experience answers:

> What can this department understand or do in this operational context?

Examples:

- Meal Service
- Meal Times
- Meal Logs
- Food Safety
- Menus
- Recipes
- Production
- Cleaning Lists
- Cleaning Logs
- Room Status
- Equipment
- Assets
- Preventive Maintenance
- Repairs
- Work Orders
- Knowledge
- Manuals
- Inspections

## Experience contract

Conceptually, each Experience defines:

```text
Stable identity
Product name and purpose
Owning domain
Eligible department families
Applicable scope: department, room archetype, or both
Configuration contract
Data dependencies
Readiness signal contribution
Work-item contribution
Navigation contribution
Allowed actions and their authorization requirements
Compatibility mappings
```

This is an architectural contract, not a TypeScript or database proposal.

## Experience versus module

An Experience is not necessarily one route or component.

For example, Preventive Maintenance may contribute:

- PM due signals in Operations Center;
- PM work in Today's Work;
- equipment schedules in a Room Workspace;
- an Assets navigation entry;
- readiness impact;
- a work-order action.

Those are projections of one Experience into different surfaces.

Likewise, Knowledge may appear as room-relevant guidance, department reference material, and recovery context without becoming three different Experiences.

## Experience versus domain object

Experiences compose domain objects but do not replace them.

- Meal Service uses meal events and operation context.
- Repairs uses issue/repair records.
- Assets uses asset records.
- Inspections uses definitions, occurrences, and submissions.
- Cleaning Logs uses cleaning records or log submissions.

Existing domain engines remain authoritative for their records and lifecycle. The Operational Profile decides whether and where a department uses the Experience.

## Experience versus capability

An Experience is product-facing, configurable, and compositional.

A low-level capability would mean an implementation ability such as:

- read asset;
- create work order;
- submit inspection;
- acknowledge room status;
- view department knowledge.

Those abilities belong to authorization and Experience implementation contracts. Administrators should select **Preventive Maintenance** or **Inspections**, not an unstable list of internal actions.

The current capability list mixes both levels. It should not survive as the long-term product vocabulary.

## Experience granularity

Experiences must be:

- recognizable to operators;
- independently meaningful;
- configurable without exposing implementation internals;
- broad enough to avoid one switch per screen;
- narrow enough to express real department differences.

Good:

- Meal Service
- Food Safety
- Cleaning Lists
- Preventive Maintenance

Too broad:

- Service Operations
- Work Queue
- Resources

Too narrow:

- View meal ready timestamp
- Edit one cleaning log field
- Open asset drawer

Broad product zones may group Experiences, but they are not substitutes for them.

## Canonical catalog and department eligibility

There is one canonical Experience catalog across LTC Manager. Departments do not create arbitrary executable Experience IDs.

Each catalog entry declares eligible department families and scopes. A Facility Department Profile selects from the eligible catalog and configures approved parameters.

Examples:

```text
Meal Service
  eligible: Dietary
  scopes: Servery, Dining Service Area

Cleaning Lists
  eligible: EVS, Dietary where department self-cleans
  scopes: room archetypes selected by that department

Preventive Maintenance
  eligible: Plant
  scopes: maintainable room archetypes and department-wide

Knowledge
  eligible: all departments
  scopes: department-wide and room archetype
```

Eligibility prevents nonsensical configuration without hardcoding behavior in Facility Builder.

## Shared names, department-specific behavior

Some Experience names are shared across departments. Their product contract must preserve department ownership.

`Equipment` for Dietary may mean food-service equipment awareness and issue reporting. `Assets` for Plant may mean registry, lifecycle, PM, and maintenance actions.

If workflows materially differ, define distinct Experiences rather than one ambiguous global switch. Shared labels do not require shared operational semantics.

## Bundles

An archetype may offer curated Experience bundles for setup convenience:

```text
Dietary Servery Standard
  Meal Service
  Meal Times
  Meal Logs
  Food Safety
  Department Cleaning
  Equipment
  Knowledge
```

Bundles are authoring defaults only. The active Operational Profile stores or resolves Experience assignments, not the bundle's marketing identity as runtime truth.

## Experience states

Conceptually an Experience assignment may be:

- enabled;
- disabled by facility profile;
- unavailable because its product/domain dependency is absent;
- overridden for a specific room;
- deprecated with a migration path.

“Unavailable” must not silently become “enabled” through projection fallback.

## Governance rules

1. Experience IDs are stable and versioned by product architecture.
2. Display labels may evolve without changing identity.
3. Department eligibility is centrally governed.
4. Facilities configure allowed parameters, not executable behavior.
5. Experiences declare dependencies and fail closed when unavailable.
6. Projection consumes only active, resolved Experiences.
7. User authorization remains separate from Experience activation.
8. A new Experience does not require a Facility Builder change.
