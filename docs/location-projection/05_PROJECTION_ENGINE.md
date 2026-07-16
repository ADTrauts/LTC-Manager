# 05 — Projection Engine

## Recommendation

Create one application-layer `LocationProjectionEngine` with a repository adapter and pure resolution core. Locations, Sidebar, Today's Work, Unit Workspace, Operations Center, and Business Workspace must consume its output instead of implementing independent department filters.

The engine is not middleware, a new database model, a generic policy language, or a UI framework.

## Boundaries

```text
Persistence adapters
  ├── physical hierarchy
  ├── explicit responsibilities
  ├── facility operational policies
  └── department metadata
             ↓
Pure projection core
  ├── validate physical eligibility
  ├── resolve effective capabilities
  ├── resolve experiences
  ├── intersect principal access
  ├── prune/retain ancestors
  └── produce query scopes and indexes
             ↓
Surface adapters
  ├── Locations / Sidebar
  ├── Today's Work / Readiness
  ├── Unit Workspace
  ├── Operations Center
  └── Business Workspace
```

## Inputs

The repository adapter loads a compact projection source:

```ts
type ProjectionSource = {
  facility: FacilityProjectionSource;
  departments: readonly DepartmentProjectionSource[];
  units: readonly UnitProjectionSource[];
  spaces: readonly SpaceProjectionSource[];
  policies: readonly FacilityOperationalPolicy[];
};
```

Only active, placed hierarchy data is eligible. The adapter must use the shared operational visibility predicate so `STAGED` Units and undesignated rooms cannot leak.

## Resolution pipeline

### 1. Normalize physical graph

- validate facility ownership;
- index Units and Rooms;
- connect Floors, Neighborhoods, Rooms, and legacy locations;
- reject cycles and orphans from operational output;
- apply vocabulary only to presentation metadata.

### 2. Select lens

Department mode resolves one department. Facility mode resolves each active operational department separately and preserves labels.

Unknown or inactive departments yield an empty projection with diagnostics, not a facility-wide fallback.

### 3. Resolve capability sources

For each eligible physical node:

- room direct responsibility;
- Unit compatibility responsibility where applicable;
- facility-wide policy grants;
- future certified policy exclusions.

Every effective capability records its source so administrators and tests can explain why it exists.

### 4. Resolve experiences

Use one `OperationalExperienceRegistry`. Each rule declares:

- stable experience ID;
- eligible departments or department family;
- required capability expression;
- applicable physical levels/types if needed;
- domain query keys;
- readiness signal keys;
- action keys.

Rules are explicit TypeScript configuration, versioned and tested. They are not persisted and do not compete with capabilities as source of truth.

### 5. Intersect principal constraints

Apply RBAC, employee Unit access, locked Unit context, and explicit route/action permissions. These constraints may remove nodes or actions but never add capabilities.

### 6. Mark actionability and prune

Nodes with at least one experience are actionable. Retain their physical ancestors as structural nodes. Remove empty branches.

### 7. Build query scope

Return normalized domain constraints:

```ts
type OperationalQueryScope = {
  unitIds: ReadonlySet<string>;
  spaceIds: ReadonlySet<string>;
  domains: ReadonlyMap<OperationalDomain, {
    unitIds: ReadonlySet<string>;
    spaceIds: ReadonlySet<string>;
    departmentId: string;
    capabilities: ReadonlySet<string>;
  }>;
};
```

Domain scopes may differ. Plant repairs can span every policy-covered placed room while Dietary meal service includes only rooms with the corresponding explicit capability.

### 8. Produce diagnostics

Diagnostics should include invalid responsibility capabilities, unplaced references, unsupported experience combinations, policy version, and orphan assignments. Diagnostics are for logs/tests/admin support and are not operational data.

## Where filtering happens

Filtering has coordinated layers with one authority:

1. **Projection engine:** decides eligible physical scope, effective capabilities, experiences, and domain query plans.
2. **Loaders/repositories:** enforce the supplied query plan while fetching records.
3. **Composition:** chooses among already-allowed experience descriptors and data for the surface's job.
4. **Navigation:** renders destinations from the projection.
5. **Components:** display only; no department visibility decisions.

Therefore capability filtering does not live in only one of loaders, composition, or navigation. The decision lives in the engine; loaders enforce it; composition and navigation consume it.

## Security posture

Projection is operational scope, not a substitute for authorization.

- Route/action RBAC remains authoritative.
- Every server loader validates facility tenancy.
- Direct URL access must resolve a projection for the requested physical node.
- A hidden navigation item is not access control.
- A broad Facility Overview projection is available only to entitled roles.
- Client-provided capabilities or department IDs are never trusted.

## Caching

The source graph changes relatively infrequently. Cache by:

```text
facility + department + hierarchy revision + responsibility revision
+ policy revision + principal access class
```

Do not key the stable projection on current meal period or volatile work records. Today's Work and readiness combine the stable projection with current operational signals downstream.

Early implementation may use request-scoped memoization. Cross-request caching should wait until invalidation revisions exist.

## Failure behavior

- No responsibility/policy: omit actionable node.
- Unknown capability: ignore it, record diagnostic, fail tests for seeded presets.
- Projection repository failure: fail closed for department data; do not fall back to all locations.
- Empty projection: return a valid empty snapshot.
- Legacy Unit: use explicit compatibility adapter.
- Mismatched facility IDs: reject.

## Testing contract

The engine requires:

- pure matrix tests for department × capability × physical node;
- Plant policy tests proving broad maintenance access without meal/EVS access;
- pruning and structural ancestor tests;
- staged/undesignated exclusion tests;
- principal access intersection tests;
- facility lens ownership tests;
- query-scope parity tests against each migrated loader;
- determinism and serialization tests.
