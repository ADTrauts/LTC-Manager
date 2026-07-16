# 10 — Recommendation and Architecture Certification

**Status:** Recommended architecture for Wave 13B — Stage 3A  
**Decision type:** Application architecture; no production or schema changes

## Recommendation

Build one derived `LocationProjectionEngine` over the frozen Facility Builder model.

Keep one canonical physical hierarchy. For each request, derive a department operational projection from:

- placed, active physical nodes;
- direct room responsibilities;
- Unit compatibility responsibilities;
- facility-wide operational policy;
- persisted capabilities;
- active department lens;
- RBAC and employee/PIN access.

The engine returns actionable locations, structural ancestors, effective capabilities, experience descriptors, and domain query scopes. All operational surfaces consume that same result.

## Direct answers

### 1. What is a Location?

A Location is a physical place in the canonical Facility hierarchy. An operational location is a derived view of that place for one department.

### 2. Should Locations become Department Locations?

The Locations **experience** should become department-projected. The entity and hierarchy must not become department-specific, and no `DepartmentLocation` persistence should be added.

### 3. What should the sidebar show?

Show actionable operational locations for the active department plus only the Floors/Neighborhoods needed as structural ancestry. Do not show the entire raw hierarchy and do not flatten away physical context.

### 4. How are unrelated experiences excluded?

Resolve department plus effective capabilities into central experience descriptors, then generate domain query scopes. Plant receives maintenance experiences at a servery through facility policy but receives no meal/EVS descriptors or data. Dietary receives no Plant PM descriptor or data.

### 5. Where does capability filtering happen?

The decision happens once in the projection engine. Loaders enforce its query scope. Composition and navigation consume its descriptors. Components do not filter.

### 6. Can every surface use one engine?

Yes. Locations, Sidebar, Today's Work, Unit Workspace, Operations Center, and Business Workspace use one projection snapshot with purpose-specific adapters. Surface adapters may aggregate or order; they may not redefine eligibility.

## Recommended engine

The engine has:

1. a batched persistence adapter;
2. a pure physical graph resolver;
3. an explicit responsibility/policy capability resolver;
4. one operational experience registry;
5. principal access intersection;
6. structural pruning;
7. domain query-scope generation;
8. diagnostics and shadow-comparison support.

It is a bounded application service, not a generalized policy engine.

## How Locations evolves

- Preserve physical identity and vocabulary.
- Project the Locations zone by active department.
- Prefer Rooms as actionable nodes in the completed hierarchy.
- Keep Floors and Neighborhoods as structural or aggregate nodes.
- Preserve legacy Unit actionability through a named compatibility adapter.
- Keep existing routes unchanged.

## How Sidebar evolves

- Replace the flat all-active-Units source with a projected tree adapter.
- Apply department relevance and PIN access through the engine.
- Prune empty branches.
- Use readiness from the same projection.
- Keep route generation and locked-tablet semantics unchanged.

## How Workspaces consume projections

- Unit Workspace resolves the target projection before loading domain data and composes only allowed experiences.
- Today's Work ranks projected locations using readiness, operation, assignment, and coverage.
- Operations Center aggregates projected domain signals for the active department.
- Business Workspace scopes its coordinated input pipeline with the projection before manager composition.
- Facility mode composes labeled department projections rather than flattening them.

## Alternative options considered

### A. Duplicate the hierarchy per department

Rejected. It creates multiple room identities, synchronization problems, divergent vocabulary, and conflicting physical truth.

### B. Persist `DepartmentLocation` projection rows

Rejected. Projection is derived from responsibilities, capabilities, and policy. Persisting it creates stale denormalized truth and complex invalidation.

### C. Filter independently in each surface

Rejected. The repository already shows drift: readiness profiles, route rules, Workspace composition, sidebar Units, and broad loaders answer different parts of visibility.

### D. Filter only in navigation/components

Rejected. Hidden UI is not authorization and broad loaders can still expose or compose unrelated records.

### E. Filter only in database loaders

Rejected as the sole architecture. Loaders need a common scope decision, and navigation/composition still need a consistent experience contract.

### F. Use Unit type as the projection key

Rejected. A servery is simultaneously relevant to Dietary, EVS, and Plant for different reasons. Physical type cannot encode department responsibility.

### G. Make assignments the location source

Rejected. Assignments express current placement, not all locations where a department has responsibility.

### H. Build a generalized rules/policy engine

Rejected. Explicit capabilities, a small experience registry, and typed facility policies are sufficient and easier to test.

## Migration recommendation

Implement after Stage 3A in this order:

1. contracts, experience registry, and golden fixtures;
2. pure engine and shadow-mode repository adapter;
3. Locations/sidebar;
4. Unit Workspace domain slices;
5. readiness and Today's Work;
6. Operations Center;
7. Business Workspace and discoverability navigation;
8. compatibility cleanup.

Every consumer is feature-flagged independently and compared against legacy behavior before activation.

## Certified invariants

This recommendation preserves:

- one hierarchy;
- one Facility Builder;
- one vocabulary system;
- one responsibility model;
- one capability system;
- one physical source of truth;
- existing Unit IDs and routes;
- existing domain ownership;
- existing RBAC, PIN, assignment, readiness, and operation engines.

It explicitly forbids:

- department-specific hierarchy copies;
- persisted projection identity;
- implicit Floor/Neighborhood-to-Room responsibility inheritance;
- copied Plant room responsibilities for facility-wide access;
- capability decisions inside UI components;
- Facility Overview as an error fallback;
- route changes as part of projection adoption.

## Architecture certification

The architecture is ready for implementation planning when the following owners accept it:

- Facility Builder owner: confirms physical and responsibility invariants.
- Operations owner: confirms experience registry and Plant policy domains.
- Security/RBAC owner: confirms principal intersection and direct-link enforcement.
- Readiness owner: confirms projected signal inputs and ancestor aggregation.
- Surface owners: confirm shared projection consumption and removal of independent filters.

Approval of this package certifies the architecture, not production behavior. Production implementation begins only in a separately authorized stage.
