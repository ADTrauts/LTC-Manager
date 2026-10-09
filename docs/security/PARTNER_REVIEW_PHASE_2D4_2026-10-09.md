# Partner Review — Phase 2D4

Partner Review is a Department-scoped projection of the canonical Facility Review engine.

## Current authority

Current Path B permits reading the current-authorized Department's Facility history. Review does not require that the partner held access on the historical service date.

## Active Department

Each partner Review request uses exactly one live authorized Department: `activeDepartmentId` inside `allowedDepartmentIds`. A missing Department fails closed. It never means all Facility Departments.

## Facts

Partner Review loads Facility and Department-scoped facts before composition. Expectations, evidence, cycles, and assignments use the Department owner. Rooms come from `UnitSpaceResponsibility` for that Department. Parent neighborhood labels travel with an authorized room.

Facts with no Department owner — presence overrides, servery events, and legacy submissions — are omitted for partner Review.

## Range

Range composes each service day with the canonical day composer, then aggregates those days. The denominator is the Department-scoped day set.

## Shared structure

Floor, neighborhood, and room labels may appear as context for an authorized operational fact. Unrelated Facility rooms are not loaded.

## No second engine

Internal and partner Review use the same composers, aggregators, and presenters. Partner routes rewrite drill-down links to `/partner/reports` and `/partner/logs/records/[recordId]`. Review adds no mutation or configuration capability. `review.read` is granted to Viewer, Operator, and Manager.
