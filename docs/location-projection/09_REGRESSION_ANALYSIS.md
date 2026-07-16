# 09 — Regression Analysis

## Primary risks

### 1. Accidental cross-department data exposure

Cause:

- loaders fetch broad facility data;
- components or navigation are treated as visibility enforcement;
- shared capabilities are interpreted without department/domain ownership.

Protection:

- engine-generated domain query scopes;
- database query constraints;
- deny-by-default missing scopes;
- direct-link validation;
- explicit one-room/three-department leakage tests.

### 2. Hiding legitimate existing work

Cause:

- incomplete responsibility data;
- legacy Unit records have not adopted room responsibilities;
- empty capability semantics differ between old Unit rows and rooms.

Protection:

- isolated legacy Unit compatibility adapter;
- shadow projection comparison;
- per-domain staged migration;
- diagnostics for records lacking ownership;
- no generic fallback to facility-wide visibility.

### 3. Reintroducing responsibility inheritance

Cause:

- older location documents describe child inheritance;
- Floor/Neighborhood responsibilities are mistaken for room scope.

Protection:

- explicit room-only responsibility tests;
- Plant broad access only through facility policy;
- architecture comments and diagnostics identify capability source;
- no parent traversal in normal room capability resolution.

### 4. Plant policy overreach

Cause:

- policy interpreted as all capabilities or all department data.

Protection:

- typed policy domains;
- experience registry limits Plant grants;
- tests proving Plant sees maintenance experiences but not Meal Service, Food Safety, Dietary logs, EVS cleaning, or EVS room status.

### 5. Physical hierarchy drift

Cause:

- a projection table or department tree becomes editable;
- labels or hierarchy are copied into projection data.

Protection:

- projection is derived and immutable;
- physical refs point to existing IDs;
- no projection persistence;
- Facility Builder remains the sole writer.

### 6. Sidebar and direct-route mismatch

Cause:

- sidebar adopts projection while direct routes use legacy broad loaders.

Protection:

- migrate direct-target validation with or before each workspace domain;
- navigation is not considered enforcement;
- preserve existing URLs while validating their projected target.

### 7. Readiness disagreement

Cause:

- readiness computes over all Units while navigation shows projected Rooms;
- Unit type fallback selects Dietary for Plant/EVS contexts;
- unrelated signals enter a department profile.

Protection:

- projection supplies eligible nodes and signal domains;
- active department profile is explicit;
- parent readiness aggregates projected descendants;
- parity fixtures cover each department.

### 8. Assignment and coverage regressions

Cause:

- room projection replaces Unit-level staffing semantics;
- assignments are used to grant location access.

Protection:

- preserve Unit as assignment/coverage compatibility anchor;
- projection constrains assignments but does not redefine them;
- orphan assignments produce diagnostics;
- existing fulfillment and call-down tests remain mandatory.

### 9. Facility Overview becomes an authorization bypass

Cause:

- facility mode treated as unscoped fallback;
- department results flattened without ownership.

Protection:

- leadership entitlement required;
- compose independent department projections;
- never fall back to facility mode on errors;
- preserve owner labels on every signal and action.

### 10. Performance regression

Cause:

- engine performs per-room/per-department queries;
- every surface rebuilds the hierarchy;
- large `IN` scopes or repeated readiness calculations.

Protection:

- batch-load projection source;
- pure indexed resolution;
- request-scoped memoization;
- domain-specific scopes;
- benchmark large-facility fixtures;
- introduce revision-keyed caching only with correct invalidation.

## Existing behavior that must remain stable

- Facility Builder hierarchy editing and vocabulary.
- Department preset authoring behavior.
- Existing physical IDs and Unit foreign keys.
- `/unit/[unitId]` links and bookmarks.
- PIN `activeUnitId`, employee Unit access, and locked-tablet behavior.
- Route zones, default homes, and role permissions.
- Assignment fulfillment and audit history.
- Readiness status language.
- Operations Center purpose and active operation logic.
- Today's Work walk/coverage/handoff purposes.
- Business Workspace preference and cached-brief behavior.

## Regression matrix

Every migrated surface must be tested across:

- departments: Dietary, EVS, Plant, Facility Overview;
- physical nodes: Floor, Neighborhood, Room, legacy Unit, staged Unit, undesignated Room;
- principals: manager, supervisor, staff, PIN employee, locked PIN employee;
- responsibility source: direct room, Unit compatibility, Plant policy, none;
- capability state: expected set, empty, unknown key;
- data ownership: matching department, another department, null/legacy;
- route access: linked navigation and direct URL.

## Required scenario assertions

For the Kensington Servery fixture:

1. Dietary sees meal service, times, logs, food safety, Dietary cleaning, knowledge, and allowed Dietary equipment.
2. EVS sees cleaning, work/checklists, inspections, knowledge, and room status where configured.
3. Plant sees assets/equipment, PM, work orders, repairs, and Plant inspections.
4. Plant sees no meal events, meal times, Dietary logs, food safety, or EVS room-state controls.
5. Dietary sees no boiler PM or unrestricted Plant work orders.
6. EVS sees no meal service or Plant PM.
7. All projections share the same room ID and ancestry.

## Rollback

Each consumer adapter remains feature-flagged until certified. Rollback switches the consumer to its legacy adapter; it does not mutate hierarchy or responsibility data.

Schema rollback is unnecessary because this architecture adds no schema in Stage 3A and recommends no projection persistence later.

## Certification blockers

Implementation must not begin if any of these remain unresolved:

- Plant facility policy has no authoritative persisted/runtime source;
- capability-to-experience registry ownership is unclear;
- legacy empty-capability behavior is not isolated;
- a migrated loader cannot enforce domain scope server-side;
- facility mode entitlement is undefined;
- golden fixtures do not cover room-explicit responsibility behavior.
