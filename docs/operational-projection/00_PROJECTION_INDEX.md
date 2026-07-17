# 00 — Operational Projection Index

**Wave:** 15A — Operational Projection Platform Architecture  
**Status:** Architecture only — no production code  
**Depends on:** Waves 14A–14C (Experience Registry, Operational Profiles, Department Administration)  
**Prior art:** `docs/location-projection/` (capability-era Stage 3A — superseded for operational inputs; engine boundary retained)

---

## Purpose

This package defines the **Operational Projection Platform**: the runtime operating system that composes every operational surface in LTC Manager.

Projection is not another feature. After this wave, every operational surface should consume Projection rather than inventing department-specific visibility logic.

---

## Document map

| # | Document | Answers |
|---|----------|---------|
| 01 | [Constitution](./01_OPERATIONAL_PROJECTION_CONSTITUTION.md) | What Projection is / is not; ownership; invariants |
| 02 | [Runtime Projection Model](./02_RUNTIME_PROJECTION_MODEL.md) | Inputs, outputs, identity, request/response contract |
| 03 | [Projection Pipeline](./03_PROJECTION_PIPELINE.md) | Resolution stages end to end |
| 04 | [Runtime Location Model](./04_RUNTIME_LOCATION_MODEL.md) | Physical vs projected locations; Plant policy merge |
| 05 | [Runtime Experience Model](./05_RUNTIME_EXPERIENCE_MODEL.md) | Areas → Experiences → tools in projection |
| 06 | [Runtime Workspace Model](./06_RUNTIME_WORKSPACE_MODEL.md) | How homes compose projected Experiences |
| 07 | [Runtime Navigation Model](./07_RUNTIME_NAVIGATION_MODEL.md) | Sidebar, Locations, deep links |
| 08 | [Runtime Permission Model](./08_RUNTIME_PERMISSION_MODEL.md) | Where permissions apply; hidden Experiences |
| 09 | [Runtime Refresh Model](./09_RUNTIME_REFRESH_MODEL.md) | Rebuild vs overlay refresh; every trigger |
| 10 | [Runtime Caching Model](./10_RUNTIME_CACHING_MODEL.md) | Cache tiers, keys, invalidation |
| 11 | [Runtime AI Integration](./11_RUNTIME_AI_INTEGRATION.md) | AI consumes Projection; never invents room context |
| 12 | [Runtime Query Strategy](./12_RUNTIME_QUERY_STRATEGY.md) | How loaders use query scopes |
| 13 | [Runtime Performance Model](./13_RUNTIME_PERFORMANCE_MODEL.md) | Preferred load/resolve/cache strategy |
| 14 | [Runtime Failure Model](./14_RUNTIME_FAILURE_MODEL.md) | Fail closed, safe mode, degradation |
| 15 | [Implementation Program](./15_IMPLEMENTATION_PROGRAM.md) | Certification waves 15B+; migration order |
| 16 | [Certification](./16_CERTIFICATION.md) | Readiness score and gates |
| 17 | [Wave 15G Sidebar Cutover](./17_WAVE_15G_SIDEBAR_CUTOVER.md) | Sidebar Projection consumer (implementation) |

---

## Constitutional stack (recap)

```text
WHERE   Facility Builder           physical structure + room↔department assignment
WHO     Facility Builder           who owns a room
HOW     Department Administration  Areas → Experiences → Archetypes → Profile
WHICH   Projection                 which Areas/Experiences appear here, now, for whom
WHAT    Operational Engines        live truth inside a projected Experience
```

---

## Relationship to prior packages

| Package | Relationship |
|---------|--------------|
| `docs/location-projection/` | Engine boundary, pruning, fail-closed, and consumer migration order remain valid. Capability-as-truth and Stage 3B implementation are **superseded**. |
| `docs/department-operational-profiles/` | Profile/Experience model is upstream input. Projection Impact (`08`) is the bridge this package completes. |
| `docs/department-administration/` | Recertification (`08`) requires Area-structured output. This package is that contract. |
| `docs/experience-runtime/` | What an Experience is; Projection emits its contracts |
| `docs/experience-framework/` | How Experiences assemble (sections/cards/widgets); Projection never emits React — only descriptors the framework renders |
| `docs/product/` | Philosophy, homes, navigation, and decision model constrain consumer placement. Projection does not invent new homes. |

---

## Non-goals (this wave)

- Do not implement Projection.
- Do not modify Sidebar, Locations, Workspace, loaders, or engines.
- Do not change schemas.
- Do not activate feature flags for runtime consumers.

---

## Completion gate

Wave 15A is complete when:

1. All documents in this index exist and answer the fifteen architecture questions.
2. Certification (`16`) records a readiness score.
3. Recommended Wave 15B is explicit.
4. One documentation-only commit lands.
