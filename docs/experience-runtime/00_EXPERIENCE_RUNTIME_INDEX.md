# 00 — Experience Runtime Index

**Wave:** 15AA — Experience Runtime Architecture  
**Status:** Architecture only — no production code  
**Depends on:** Waves 14A–14C (Registry, Profiles, Admin), Wave 15A (Operational Projection architecture)  
**Position:** Constitutional definition of **Experience** as the primary operational building block

---

## Why this package exists

Facility Builder owns the building.  
Department Administration owns how departments operate.  
Operational Profiles are certifiable.  
Projection architecture defines *which* Experiences appear.

**Missing:** a constitutional definition of the Experience *itself* — its anatomy, contracts, tools, lifecycle, and boundaries with engines and homes.

Without this layer, Projection would project an undefined noun. Implementation would invent ad-hoc “module” behavior again.

---

## Document map

| # | Document | Focus |
|---|----------|--------|
| 01 | [Constitution](./01_EXPERIENCE_CONSTITUTION.md) | What an Experience is / is not; platform stack |
| 02 | [Definition](./02_EXPERIENCE_DEFINITION.md) | Distinctions; ownership of concerns |
| 03 | [Anatomy](./03_EXPERIENCE_ANATOMY.md) | Internal shell; required/optional/forbidden sections |
| 04 | [Contracts](./04_EXPERIENCE_CONTRACTS.md) | Canonical contribution contracts |
| 05 | [Composition](./05_EXPERIENCE_COMPOSITION.md) | Who assembles Overview → Tools → History |
| 06 | [Tools Model](./06_EXPERIENCE_TOOLS_MODEL.md) | Logs, Forms, Knowledge, Checklists, etc. |
| 07 | [AI Model](./07_EXPERIENCE_AI_MODEL.md) | Experience-scoped intelligence |
| 08 | [Analytics Model](./08_EXPERIENCE_ANALYTICS_MODEL.md) | Metrics ownership |
| 09 | [Permission Model](./09_EXPERIENCE_PERMISSION_MODEL.md) | Dept → Experience → Action → Tool → Room |
| 10 | [Engine Boundary](./10_EXPERIENCE_ENGINE_BOUNDARY.md) | Experience vs live engines |
| 11 | [Projection Relationship](./11_EXPERIENCE_PROJECTION_RELATIONSHIP.md) | What Projection projects |
| 12 | [Workspace Relationship](./12_EXPERIENCE_WORKSPACE_RELATIONSHIP.md) | BW, Unit, OC composition |
| 13 | [Expansion Model](./13_EXPERIENCE_EXPANSION_MODEL.md) | Plug-in without platform surgery |
| 14 | [Migration Model](./14_MIGRATION_MODEL.md) | Modules / Logs / Knowledge / capabilities |
| 15 | [Implementation Recommendations](./15_IMPLEMENTATION_RECOMMENDATIONS.md) | Ordered waves after architecture |
| 16 | [Certification](./16_CERTIFICATION.md) | Readiness score and gates |
| 17 | [Wave 16A Experience Shell](./17_WAVE_16A_EXPERIENCE_SHELL.md) | Reusable shell, Tool Host, registry |

---

## Six-layer stack (updated)

```text
WHERE / WHO     Facility Builder
HOW             Department Administration → Operational Profile
WHAT EXISTS     Experience Catalog + Experience Runtime   ← this package
HOW ASSEMBLED   Experience Composition Framework          ← docs/experience-framework/
WHICH           Operational Projection
WHERE SHOWN     Homes (Workspace / OC / Today / Unit) + navigation
WHAT IS TRUE    Operational Engines (live truth)
```

Wave 15A described Experiences as projected descriptors. This package defines the **runtime meaning** of those descriptors. Wave 15AB defines **how they are assembled into UI**.

---

## Relationship to prior packages

| Package | Relationship |
|---------|--------------|
| `docs/department-administration/03` | Catalog *governance*; this package adds *runtime anatomy & contracts* |
| `docs/department-operational-profiles/03` | Product Experience model; this package is the constitutional runtime |
| `docs/operational-projection/` | Projection delivers Experiences; does not define Experience internals |
| `docs/experience-framework/` | **How** Experiences assemble (sections/cards/widgets/shell) — Wave 15AB |
| Wave 14A `src/lib/experiences/` | Registry foundation; this package is the architecture it must grow into |

---

## Non-goals

- No production code, Prisma, routes, Projection implementation, Admin UI, or Facility Builder changes.
- No new schema for Experiences as persisted runtime entities (catalog remains code-owned; profiles remain selection/config).

---

## Completion gate

Wave 15AA is complete when all documents exist, answer the twenty architecture questions, certify readiness, and land in one documentation-only commit.
