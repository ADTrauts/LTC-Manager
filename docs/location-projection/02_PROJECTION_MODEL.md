# 02 — Projection Model

## Decision

**Location remains a physical place. A department location is a derived operational projection, never a persisted copy of that place.**

The architecture uses three distinct terms:

1. **Physical location node** — a canonical Facility, Floor, Neighborhood, or Room from the Facility Builder.
2. **Operational location projection** — a physical node viewed through one department, its effective capabilities, policy, and user access.
3. **Location experience** — the modules and actions enabled by that operational projection.

This distinction preserves one hierarchy while allowing the same room to produce different experiences.

## Identity

Projection does not create new durable identity. Every projected node retains its physical source identity:

```ts
type PhysicalLocationRef =
  | { kind: "FACILITY"; facilityId: string }
  | { kind: "UNIT"; facilityId: string; unitId: string }
  | {
      kind: "SPACE";
      facilityId: string;
      unitId: string;
      spaceId: string;
    };
```

`UNIT` covers Floor, Neighborhood, and legacy compatibility records. `SPACE` covers Room. Existing `unitId` links and routes remain valid.

A projection key is ephemeral and deterministic:

```text
facilityId + departmentId + physical-kind + physical-id + policy-version
```

It may be cached, but must never become a second location table or foreign-key target.

## Projection request

A projection is built for an explicit context:

```ts
type LocationProjectionRequest = {
  facilityId: string;
  lens:
    | { mode: "DEPARTMENT"; departmentId: string; departmentKey: string }
    | { mode: "FACILITY" };
  principal: {
    role: string;
    authKind: "USER" | "EMPLOYEE";
    allowedUnitIds: ReadonlySet<string> | "ALL";
    lockedUnitId?: string;
  };
  purpose:
    | "LOCATIONS"
    | "SIDEBAR"
    | "TODAYS_WORK"
    | "WORKSPACE"
    | "OPERATIONS_CENTER";
};
```

The department lens determines operational relevance. The principal intersects that relevance with RBAC and employee/PIN access. `purpose` selects output shape and aggregation, not different visibility truth.

## Projection output

The engine returns one immutable snapshot with reusable indexes:

```ts
type DepartmentLocationProjection = {
  context: ProjectionContext;
  roots: ProjectedLocationNode[];
  operationalLeaves: ProjectedLocationNode[];
  byPhysicalKey: ReadonlyMap<string, ProjectedLocationNode>;
  queryScope: OperationalQueryScope;
  diagnostics: ProjectionDiagnostics;
};

type ProjectedLocationNode = {
  physical: PhysicalLocationRef;
  name: string;
  hierarchyRole: "FACILITY" | "FLOOR" | "NEIGHBORHOOD" | "ROOM" | "LEGACY";
  ancestry: PhysicalLocationRef[];
  presentation: "ACTIONABLE" | "STRUCTURAL";
  effectiveCapabilities: ReadonlySet<string>;
  capabilitySources: CapabilitySource[];
  experiences: ExperienceDescriptor[];
  children: ProjectedLocationNode[];
};
```

`ACTIONABLE` means the department has at least one operational experience at that node. `STRUCTURAL` means the node is retained only to preserve physical context for actionable descendants.

## Capability resolution

Effective capabilities come from existing authoritative inputs:

- direct `UnitSpaceResponsibility` for a room;
- existing `UnitDepartmentResponsibility` only for Unit/legacy compatibility behavior;
- explicit facility-wide operational policy, currently Plant maintenance;
- no implicit Floor/Neighborhood-to-Room inheritance.

Resolution is additive across valid sources, except an explicit policy exclusion if policy supports exclusions in a future certified stage.

Empty room capabilities mean no enabled room experience. They must not mean “all capabilities.” Legacy empty-array compatibility, if still required for Unit responsibilities, is isolated to the compatibility adapter and never generalized to rooms.

## Structural pruning

The engine builds from the canonical hierarchy and then prunes:

1. remove staged and undesignated nodes;
2. remove inactive nodes;
3. resolve department relevance at actionable nodes;
4. intersect employee/PIN Unit access;
5. retain ancestors of included nodes as `STRUCTURAL`;
6. remove empty branches.

A Floor or Neighborhood may therefore appear without becoming an operational work target. It exists to explain where an actionable Room is.

## Facility lens

Facility Overview is not a synthetic department and not a union that erases ownership. It is a labeled composition of department projections:

```text
Facility projection
  = Dietary projection
  + EVS projection
  + Plant projection
  + explicit cross-department summaries
```

Every item retains its department owner and physical reference. Facility mode must never flatten controls from multiple departments into one ambiguous room experience.

## Invariants

1. Projection is read-only and deterministic for the same authoritative inputs.
2. Physical identity never changes by department.
3. No hierarchy node is copied per department.
4. Vocabulary labels presentation; it does not affect projection logic.
5. Responsibilities and policy are the only location-scope grants.
6. Capabilities enable experiences; they do not grant user authorization.
7. RBAC and employee access can only narrow a projection.
8. Navigation and components cannot broaden a projection.
9. Domain loaders must use the projection query scope.
10. Existing Unit identifiers remain compatibility anchors throughout migration.
