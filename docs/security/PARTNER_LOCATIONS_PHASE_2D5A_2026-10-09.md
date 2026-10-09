# Partner Locations — Phase 2D5A

Partner Locations is the current Facility structure for one active Department, derived from explicit responsibility.

## Unit responsibility

`UnitDepartmentResponsibility` authorizes that Neighborhood. It does not authorize descendant Rooms.

## Room responsibility

`UnitSpaceResponsibility` authorizes that Room. Rooms do not inherit a parent Neighborhood.

## Structural ancestors

A Floor or Neighborhood appears only when it connects an authorized descendant. Those ancestors stay structural. Sibling branches are not loaded into the partner tree.

## Plant

Partner Plant visibility ignores the internal facility-wide Plant room policy. A Plant Room appears only with an explicit `UnitSpaceResponsibility` for Plant. Internal Plant Locations are unchanged.

## Current configuration

These responsibility rows are current assignments, not historical periods. Standalone Locations answers what the Department is responsible for now.

## Assets

Location responsibility is not Asset authorization. An Asset inside a responsible Room is not therefore visible to that Department. Future Asset access follows `Asset.departmentId`.
