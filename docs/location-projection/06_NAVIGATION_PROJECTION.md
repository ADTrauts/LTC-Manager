# 06 — Navigation Projection

## Decision

Navigation is a consumer of projection, not the place where projection rules are defined.

Top-level route navigation continues to use role permissions, department route rules, and navigation zones. Location navigation consumes the shared `DepartmentLocationProjection`.

No route changes are recommended in this stage.

## Sidebar rule

The sidebar should show **operational locations with enough physical ancestry to orient the user**.

It should not always show every Floor, Neighborhood, and Room. It should not show only a flat list of rooms either.

For the active department:

1. include actionable nodes;
2. retain their ancestors as structural groups;
3. remove empty branches;
4. show readiness only from the same department projection;
5. apply employee/PIN Unit restrictions;
6. keep locked-device behavior.

Example:

```text
Dietary
  Ground Floor
    Kensington
      Servery

Plant
  Ground Floor
    Kensington
      Servery
      Mechanical Room
      Resident Room 101
```

The same physical labels and IDs are reused. The difference is derived relevance.

## Structural nodes in navigation

Floors and Neighborhoods may be:

- expandable grouping nodes;
- aggregate-status nodes if a surface supports aggregation;
- non-actionable breadcrumbs.

They must not receive local work controls merely because they are visible. A direct destination may remain for legacy Unit compatibility, but actionability is determined by the projection.

## Sidebar projection view model

The sidebar adapter should consume:

```ts
type ProjectedSidebarNode = {
  physical: PhysicalLocationRef;
  label: string;
  levelLabel: string;
  href: string | null;
  presentation: "ACTIONABLE" | "STRUCTURAL";
  readiness: ProjectedReadiness | null;
  children: ProjectedSidebarNode[];
};
```

`href` is supplied by the existing route adapter. The projection engine does not own URL construction.

## Existing route compatibility

Keep:

- `/unit/[unitId]`;
- PIN `activeUnitId`;
- existing Operations Center, Today's Work, Workspace, and module routes;
- route permission evaluation.

Room-aware experiences can initially open the owning Unit Workspace with projected room context. Any future room route requires a separately certified routing stage and is outside this package.

## Top-level department navigation

The current department route rules remain a coarse module-entitlement layer during migration. They should eventually consume the experience registry for discoverability:

```text
show Assets entry
  when role permits route
  and active department projection contains an asset experience
```

Route authorization still remains independent and server-enforced.

This removes hard-coded contradictions such as a department receiving a link to a module for which it has no projected location or capability.

## Deep links

A direct link to a Unit or domain record must:

1. authorize the user and facility;
2. resolve the active department projection;
3. verify the target physical reference is included for the requested experience;
4. load only the corresponding domain scope;
5. return the existing not-found/denied behavior if it is not included.

The sidebar being hidden is never sufficient enforcement.

## Lens switching

When a user changes department:

- physical identity and hierarchy remain stable;
- sidebar branches may appear or disappear;
- readiness changes to the department profile;
- workspace modules change;
- the current destination remains only if the physical node is projected for the new department.

If the current node is not projected, use the existing entitled home-selection mechanism. Do not silently switch to Facility Overview or a different department.

## Facility Overview

Facility Overview may show the complete placed physical hierarchy only for entitled leadership/admin contexts. Department states remain labeled and independently drillable.

It must not be used as the fallback for an unknown department, failed projection, or denied location.

## Navigation regressions to protect

- Staff/PIN users cannot gain extra Units.
- Locked tablets cannot navigate elsewhere.
- Existing `/unit` bookmarks remain valid.
- Staged and undesignated nodes never appear.
- Readiness chips match the active department.
- Empty projected branches do not appear.
- Route zones and default homes remain unchanged.
