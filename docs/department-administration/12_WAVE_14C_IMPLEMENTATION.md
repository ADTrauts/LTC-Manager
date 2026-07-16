# 12 — Wave 14C Implementation Record

**Wave:** 14C — Department Administration  
**Depends on:** Wave 14A (`a662ef6…`), Wave 14B (`a87c1ee…`)  
**Status:** Implemented behind `DEPARTMENT_OPERATIONAL_PROFILES_ENABLED` (default off).  
**Projection:** still paused. No Sidebar / Locations / Workspace / engines changes.

## Route

`/admin/departments/[departmentId]?tab=&profile=`

Local left navigation (not global):

Overview · Operational Areas · Room Archetypes · Rooms · Diagnostics · Versions · Settings

Entry from `/admin/departments` when the feature flag is on. Admin layout remains Facility Administrator–only (existing boundary).

## Reuse

- Wave 14A Experience Registry (display names, eligibility)
- Wave 14B lifecycle, certification, baseline, room binding, exceptions, plant policy
- Design system: `PageHeader`, `SectionHeader`, `AppCard`, `MetricCard`, `StatusBadge`
- Facility Builder hierarchy loader (read-only) for assigned rooms + vocabulary labels
- Space-type display / recommendation helpers (advisory only)

## Draft editing APIs added in this wave

`setAreaExperienceActive`, `reorderAreaExperiences`, `moveAreaExperience`,  
`createRoomArchetype`, `updateRoomArchetype`, `setArchetypeExperiences`,  
`clearRoomArchetypeBinding`, `removeRoomExperienceException`, `retireActiveProfile`

All DRAFT-only (except retire of ACTIVE). All gated by the feature flag + Manager+ + facility tenancy via existing `assertProfileWriteAccess`.

## What Wave 15 / Projection may build next

Projection Engine consuming ACTIVE profiles → Locations / Sidebar / Workspace composition. Department Administration UX polish (compare versions, richer exception editor) can continue in parallel but Projection is the next constitutional consumer.
