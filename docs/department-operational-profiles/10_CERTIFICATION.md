# 10 — Architecture Certification

**Status:** Recommended for product architecture approval  
**Implementation status:** STOPPED pending certification and later design authorization

## Executive summary

Facility Builder and Department Administration must be separate bounded systems.

Facility Builder owns the one physical hierarchy and states which Departments operate in each Room. Department Administration owns what each Department does there through one active Operational Profile, department-scoped Room Archetypes, and canonical Experiences.

Experiences replace configurable capabilities in the target architecture. Current capability arrays remain migration-only compatibility data. Projection consumes resolved Experiences and never decides department behavior from raw room flags.

## Major architectural discoveries

1. Current capability keys mix product Experiences, broad composition concepts, and implementation concerns.
2. Storing them on room responsibilities makes Facility Builder operationally module-aware.
3. Repeated room capability combinations are undeclared department templates.
4. One physical Room needs different operational classifications for different Departments.
5. Department-wide Experiences such as Menus and Recipes do not belong on Room responsibilities.
6. A hybrid Experience-plus-capability model creates dual truth and should be rejected.
7. The Stage 3A projection boundary is correct, but capability resolution is the wrong upstream source.
8. Profile governance must precede Projection Engine implementation.

## Recommended product architecture

```text
ONE PHYSICAL TRUTH

Facility Builder
  Facility → Floor → Neighborhood → Room
  Room ↔ Department assignment

ONE OPERATIONAL TRUTH PER FACILITY DEPARTMENT

Department
  → active Operational Profile
  → Department Room Archetype
  → Experiences

ONE DERIVED VIEW

Projection Engine
  Room + Department + Profile + Archetype + Experiences
  + principal access + current operational state
  → department-specific operational projection
```

## Capability decision

Certified recommendation:

- Remove configurable capabilities from the long-term product model.
- Do not expose capabilities in Facility Builder.
- Do not expose capabilities beside Experiences in Department Administration.
- Do not make capability arrays a Projection Engine source after migration.
- Keep action permissions and Experience requirements internal and derived.
- Preserve current arrays only for non-breaking compatibility migration.

## Impact on Projection Engine

The engine becomes simpler and more deterministic:

- it verifies physical and department scope;
- resolves the active profile and room archetype;
- receives already-defined Experiences;
- generates Experience-specific query scopes and descriptors;
- intersects authorization;
- prunes and aggregates the physical tree.

It no longer maps capabilities into product behavior.

The existing projection implementation plan is paused. It must be recertified after Experience catalog and profile governance design.

## Impact on Facility Builder

Long-term responsibility:

- physical hierarchy;
- placement and activity;
- physical Room type;
- Room-to-Department assignment;
- vocabulary.

Explicitly excluded:

- Experience selection;
- module configuration;
- department archetypes;
- readiness policy;
- logs, checklists, assets, PM, repairs, knowledge, or work setup.

No Facility Builder change is authorized in this wave.

## Impact on Department Administration

Department Administration becomes the owner of:

- active Operational Profile;
- department Room Archetypes;
- Experience activation and configuration;
- department-wide Experiences;
- Room-to-archetype mapping;
- controlled room exceptions;
- profile review, activation, audit, and rollback.

This is a future product boundary, not an implementation specification.

## Risks

### Profile complexity

Profiles can become a generic configuration platform. Control this with a canonical Experience catalog, department eligibility, typed configuration contracts, and limited inheritance.

### Archetype proliferation

Facilities may create one archetype per Room. Control this with curated defaults, reuse metrics, sparse exceptions, and certification review.

### Dual truth during migration

Legacy capabilities and profiles may disagree. Use one-way translation, shadow comparison, explicit authority cutover, and no permanent dual-write.

### Missing configuration

Assigned Rooms may lack archetypes. Fail visibly with diagnostics; do not infer full access or silently hide the Room.

### Authorization confusion

Experience activation may be mistaken for user permission. Keep RBAC and employee access as independent intersections.

### Plant scope ambiguity

Facility-wide Plant access and room-specific Plant behavior are different. Scope policy determines eligible Rooms; the Plant profile determines Experiences.

### Baseline update surprise

System defaults must never silently change active facility profiles. Require explicit adoption of revisions.

### Operational disruption

Profile changes can alter readiness and work visibility. Require impact preview, revision activation, audit, and rollback.

## Recommended implementation order

No implementation begins in this wave.

Future order:

1. certify this ownership model;
2. define and govern the canonical Experience catalog;
3. define department baselines and Room Archetypes;
4. define profile lifecycle, revisions, inheritance, and exceptions;
5. inventory legacy capability combinations;
6. design non-breaking profile persistence and migration separately;
7. generate and review proposed profiles;
8. recertify the Projection Engine contract;
9. implement profile resolution in shadow mode;
10. adopt projection consumers incrementally;
11. retire raw capability decisions after full certification.

## Readiness score

**Architecture readiness: 8.5 / 10**

Strongly resolved:

- physical versus operational ownership boundary;
- Experience as canonical product primitive;
- rejection of hybrid configurable capabilities;
- department-scoped operational archetypes;
- revised projection dependency direction;
- non-breaking migration principles.

Still required before implementation:

- canonical Experience catalog approval;
- exact profile lifecycle and governance;
- Plant scope-policy ownership;
- custom department eligibility policy;
- conceptual treatment of unavailable product dependencies;
- later schema and authorization designs.

**Implementation readiness: 2 / 10**

This low score is intentional. Production work is blocked until the remaining product contracts are certified.

## Certification statements

This architecture certifies:

1. Facility Builder owns physical truth.
2. Departments own operational truth.
3. Projection derives Experiences; it does not define them.
4. There is one physical hierarchy.
5. Physical Rooms are never duplicated per Department.
6. Room-to-Department assignment and Department behavior are separate.
7. Department Room Archetypes are operational interpretations, not physical types.
8. Experiences are the canonical configurable product primitive.
9. Configurable capabilities are retired from the target architecture.
10. User permissions remain separate from Experience activation.
11. Existing routes and domain engines remain authoritative.
12. No production, Prisma, migration, route, Builder, admin, or projection change is authorized here.

## Approval gate

Before implementation planning, obtain agreement from:

- Facility Builder/physical model owner;
- department product owners;
- Experience catalog/product architecture owner;
- security and RBAC owner;
- readiness and work-engine owners;
- operational surface owners;
- migration/data governance owner.

Approval certifies the architecture only.
