# Department Operational Profiles — Architecture Index

**Wave:** Department Operational Profiles architecture  
**Status:** Architecture certification candidate  
**Scope:** Product modeling, ownership boundaries, governance, and migration planning only

## Implementation hold

Do not implement the Location Projection Engine from `docs/location-projection/` until this package is certified.

The earlier package correctly established that:

- there is one physical hierarchy;
- department experiences are derived rather than copied;
- every operational surface should consume one projection;
- routes, Facility Builder, RBAC, and domain ownership remain stable.

This package changes the engine's upstream source. Projection must not interpret raw capabilities stored on room responsibilities as operational truth. It must consume department-owned Operational Profiles and their Experiences.

Where the earlier package says:

```text
Room → capabilities → experiences → projection
```

this package supersedes it with:

```text
Room → assigned Department → Department Operational Profile
     → department Room Archetype → Experiences → projection
```

No production or schema change is authorized by this decision.

## Certified ownership boundary

```text
Facility Builder
  owns physical structure and room-to-department assignment

Department Administration
  owns department operational profiles, room archetypes,
  experiences, defaults, and approved overrides

Projection Engine
  derives department-specific operational locations and query scopes

Operational surfaces
  compose projected experiences for their distinct jobs
```

## Documents

1. `01_PROBLEM_STATEMENT.md` — why raw capabilities do not belong in Facility Builder.
2. `02_OPERATIONAL_PROFILE_MODEL.md` — the Department → Profile → Room Archetype → Experience model.
3. `03_EXPERIENCE_MODEL.md` — the canonical unit of operational product behavior.
4. `04_CAPABILITY_MODEL.md` — decision to retire configurable capabilities in favor of Experiences.
5. `05_DEPARTMENT_CONFIGURATION.md` — how each department defines its operational model.
6. `06_ROOM_TYPE_STRATEGY.md` — physical room types versus department-owned operational archetypes.
7. `07_ADMIN_EXPERIENCE.md` — future administrative workflow and ownership.
8. `08_PROJECTION_IMPACT.md` — revised Projection Engine inputs and responsibilities.
9. `09_MIGRATION_PLAN.md` — non-breaking conceptual migration without schema design.
10. `10_CERTIFICATION.md` — architectural decisions, readiness, risks, and sign-off.

## Executive recommendation

Make **Experiences** the only product-facing and configurable operational primitive.

Retire today's room capability arrays from the target architecture. During migration they remain readable as a compatibility input, translated one way into profile Experiences. They must not remain a second source of operational truth.

Keep lower-level authorization, data-access, and action requirements as internal contracts owned by each Experience implementation. Do not expose those internal requirements as “capabilities” in Facility Builder or Department Administration.

## Long-term source-of-truth map

- Physical identity and ancestry: Facility Builder.
- Department presence in a room: Facility Builder.
- Department operational behavior: Department Operational Profile.
- Operational room classification: department-owned Room Archetype.
- User authorization: RBAC and employee access systems.
- Current work truth: existing domain engines.
- Projected visibility and composition: Projection Engine.
- Product vocabulary: existing Facility vocabulary system.

## Non-goals

- No production code.
- No Prisma changes or migrations.
- No schema proposal.
- No route changes.
- No Facility Builder changes.
- No Department Administration implementation.
- No UI implementation.
- No feature flags.
- No Projection Engine implementation.
