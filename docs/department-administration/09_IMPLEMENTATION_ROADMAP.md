# 09 — Implementation Roadmap

## Scope

This is an **order of work**, not code. It sequences implementation so that each layer is built only after the layer it depends on is stable. Nothing here authorizes implementation; it defines the path once implementation is approved.

## Guiding principle

Build **bottom-up in dependency order**: the vocabulary before the organization, the organization before the derivation, the derivation before the surfaces. Never build a consumer before its source of truth exists.

## Recommended order

```text
1. Experience Registry
2. Operational Areas
3. Department Administration
4. Operational Profiles
5. Projection Engine
6. Locations
7. Sidebar
8. Workspace
9. Today's Work
10. Operations Center
```

### 1. Experience Registry

The shared catalog (`03`). The atomic vocabulary everything else references. Includes the tool-vs-Experience classification (Logs, Knowledge, Forms are tools). Nothing above can be built until Experiences have stable identity.

**Done when:** every Experience has a stable identifier, description, tool set, and archetype hints.

### 2. Operational Areas

The grouping vocabulary (`02`). Defines how Experiences aggregate into the manager's mental model. Depends on the registry existing.

**Done when:** areas exist as named groupings that can hold Experiences, with the standard department vocabularies drafted.

### 3. Department Administration

The authoring layer (`01`, `07`). Where areas and Experiences are assembled per department. Depends on both the registry and areas.

**Done when:** a department's areas + Experiences + archetypes can be authored as a draft model.

### 4. Operational Profiles

The bound, certified configuration (`05`, `04`). The four configuration layers, archetypes, certification, activation, versioning. Depends on Department Administration.

**Done when:** a facility department has exactly one certified, versioned active profile that composes baseline + facility + archetype + exception.

### 5. Projection Engine

The derivation layer (`08`). Resolves Department → Area → Experiences → Workspace scope from a certified profile. Depends on profiles existing to consume.

**Done when:** given a room, department, user, and time, Projection emits an area-structured projection.

### 6. Locations

The first consumer: physical/operational location views driven by projection. Depends on Projection.

### 7. Sidebar

Navigation rebuilt on Operational Areas as the top grouping; modules removed. Depends on Projection.

### 8. Workspace

Experience workspaces opened within area context. Depends on Sidebar/Projection.

### 9. Today's Work

Cross-area aggregation of actionable work, labeled by area. Depends on Projection + Workspace.

### 10. Operations Center

Manager-level rollups across areas and departments. Built last because it aggregates everything below.

## Why this order

- **Registry and Areas first** because they are the vocabulary; every layer references them.
- **Department Administration and Profiles next** because the profile is the single source of truth Projection consumes.
- **Projection in the middle** because it depends on profiles and everything visual depends on it.
- **Consumers last**, innermost (Locations, Sidebar) before aggregators (Today's Work, Operations Center), so aggregation is built on settled surfaces.

## Sequencing rules

1. No layer starts before its dependency is stable.
2. The Experience Registry is the first and most foundational unit of work.
3. Projection is not built until at least one certified profile exists to consume.
4. Consumer surfaces are not built until Projection emits area-structured output.
5. Each layer is independently reviewable before the next begins.

## Recommended first implementation wave

The first wave is **Experience Registry + Operational Areas**. Together they establish the vocabulary and the grouping model — the foundation every later layer references — and they can be validated with fixtures long before any UI exists.
