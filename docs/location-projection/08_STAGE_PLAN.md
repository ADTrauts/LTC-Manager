# 08 — Stage Plan

## Delivery principle

Adopt projection in narrow, reversible stages. Every stage keeps the existing hierarchy, Facility Builder, vocabulary, responsibility rows, capability keys, routes, and domain owners.

No production code belongs to Wave 13B Stage 3A. This document defines subsequent implementation stages.

## Stage 3B — Projection contracts and golden fixtures

Deliver:

- physical reference and projection types;
- operational experience registry contract;
- projection repository interface;
- golden fixtures for Servery, resident room, mechanical room, staged node, and legacy Unit;
- certified department/capability matrix tests.

No surface consumes the engine. No behavior changes.

Exit criteria:

- one-room/three-department fixture produces the certified experiences;
- Plant policy does not expose meal or EVS domains;
- staged and undesignated nodes are excluded;
- no responsibility inheritance is introduced.

## Stage 3C — Pure engine and repository adapter

Deliver:

- source loader for hierarchy, direct room responsibilities, Unit compatibility, and facility policy;
- pure capability and experience resolution;
- principal access intersection;
- structural pruning;
- domain query-scope generation;
- diagnostics.

Run in shadow mode beside existing loaders. Do not change rendered output.

Exit criteria:

- deterministic tests pass;
- projection timings and sizes are observed;
- differences from legacy Unit lists are classified;
- repository failure fails closed.

## Stage 3D — Locations and sidebar adoption

Deliver:

- projected tree adapter;
- active department filtering;
- structural ancestor handling;
- existing readiness chip integration;
- PIN/employee Unit restriction parity.

Use a feature flag and preserve current href generation.

Exit criteria:

- route and locked-tablet regressions pass;
- no staged/undesignated nodes;
- no empty branches;
- legacy Unit destinations remain available where projected.

## Stage 3E — Unit Workspace composition

Deliver:

- direct-target projection validation;
- projected experience descriptors;
- domain loaders accepting generated scopes;
- module composition from descriptors;
- compatibility adapter for Unit-linked records.

Migrate one domain slice at a time:

1. knowledge and inspections;
2. EVS cleaning/room status;
3. Plant assets, PM, and repairs;
4. Dietary meal service, times, logs, and food safety;
5. shared work queue.

Exit criteria:

- Plant at a servery never receives meal data;
- Dietary never receives Plant PM;
- EVS receives only EVS-owned cleaning/inspection data;
- broad preloading is removed for migrated domains.

## Stage 3F — Readiness and Today's Work

Deliver:

- readiness computation over projected actionable nodes;
- projected signal inputs;
- structural ancestor aggregation;
- walk list from projection;
- coverage/call-down location intersection.

Readiness rules and assignment truth remain in their existing engines.

Exit criteria:

- department walk lists contain only projected locations;
- readiness profile and signals match department;
- assignment outside projection emits diagnostics;
- coverage behavior remains compatible at Unit level.

## Stage 3G — Operations Center

Deliver:

- department projection passed into dashboard query planning;
- projected exception and pulse aggregation;
- department-owned meal, EVS, and Plant packs;
- labeled facility-mode composition.

Exit criteria:

- 60-second operational questions remain answerable;
- no cross-department data leakage;
- Facility Overview preserves department labels;
- active operation logic remains unchanged.

## Stage 3H — Business Workspace and top-level navigation

Deliver:

- projection-scoped Workspace inputs;
- experience-derived link discoverability;
- removal of duplicate hard-coded composition rules where the registry is authoritative;
- retained role/route authorization.

Exit criteria:

- Manager Focus and agenda use projected signals;
- links do not advertise unavailable experiences;
- Workspace remains a personal manager home, not a second Operations Center.

## Stage 3I — Compatibility retirement

Only after adoption metrics prove safety:

- remove shadow comparisons;
- retire duplicated department filters;
- narrow legacy empty-capability behavior;
- document remaining Unit-level compatibility;
- keep routes and physical persistence unchanged unless separately certified.

## Rollout controls

Use independent flags by consumer rather than one global launch flag:

```text
LOCATION_PROJECTION_SIDEBAR
LOCATION_PROJECTION_WORKSPACE
LOCATION_PROJECTION_TODAY
LOCATION_PROJECTION_OPERATIONS_CENTER
LOCATION_PROJECTION_BUSINESS_WORKSPACE
```

Flags choose consumer adapters. They must not select different projection rules.

## Required review gates

Each implementation stage requires:

- architecture conformance review;
- department matrix tests;
- role/PIN authorization tests;
- staged/undesignated exclusion tests;
- query-scope/data-leakage tests;
- current acceptance checklist regression;
- rollback validation.
