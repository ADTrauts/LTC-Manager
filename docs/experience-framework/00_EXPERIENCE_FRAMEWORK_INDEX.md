# 00 — Experience Framework Index

**Wave:** 15AB — Experience Composition Framework  
**Status:** Architecture only — no production code  
**Depends on:** Wave 15AA (Experience Runtime), Wave 15A (Operational Projection)  
**Position:** How developers **assemble** Experiences — the operational equivalent of a design system

---

## Why this package exists

15AA defined **what** an Experience is (constitution, contracts, tools, engines).  
15A defined **which** Experiences appear (Projection).

**Still missing:** how an Experience is **built and rendered** consistently — sections, cards, widgets, actions, layout descriptors, component registry, home density, runtime overlays.

Without this framework, every Experience becomes a bespoke page. With it, an Experience is a **declarative operational application**.

---

## Composition hierarchy (constitutional)

```text
Experience
  → Sections
    → Cards
      → Widgets
        → Tools (hosted) / Runtime data / Actions
          → Rendered UI (via Component Registry)
```

Projection emits **descriptors and contracts** — never React components.

---

## Document map

| # | Document | Focus |
|---|----------|--------|
| 01 | [Composition Model](./01_EXPERIENCE_COMPOSITION_MODEL.md) | Structural layers; required/optional/forbidden |
| 02 | [Section Model](./02_SECTION_MODEL.md) | Canonical sections and rules |
| 03 | [Card Model](./03_CARD_MODEL.md) | Card anatomy and consistency |
| 04 | [Widget Model](./04_WIDGET_MODEL.md) | Widget hierarchy and kinds |
| 05 | [Action Model](./05_ACTION_MODEL.md) | Action categories and ownership |
| 06 | [Tool Hosting](./06_TOOL_HOSTING_MODEL.md) | How tools attach and communicate |
| 07 | [Layout Contracts](./07_LAYOUT_CONTRACTS.md) | Layout descriptors (not React) |
| 08 | [Component Registry](./08_COMPONENT_REGISTRY.md) | Registration without Projection changes |
| 09 | [Rendering Pipeline](./09_RENDERING_PIPELINE.md) | Projection → UI end to end |
| 10 | [Home Adaptation](./10_HOME_ADAPTATION_MODEL.md) | Density per home |
| 11 | [Runtime Overlay](./11_RUNTIME_OVERLAY_MODEL.md) | Live data without mutating Projection |
| 12 | [Extension Model](./12_EXTENSION_MODEL.md) | Extension seams |
| 13 | [Design Language](./13_DESIGN_LANGUAGE.md) | Architectural visual rhythm (not CSS) |
| 14 | [Migration Model](./14_MIGRATION_MODEL.md) | Legacy pages → framework |
| 15 | [Implementation Plan](./15_IMPLEMENTATION_PLAN.md) | Waves 15AC+ |
| 16 | [Certification](./16_CERTIFICATION.md) | Readiness score |

---

## Relationship to prior packages

| Package | Relationship |
|---------|--------------|
| `docs/experience-runtime/` | **What** an Experience is; this package is **how it assembles** |
| `docs/operational-projection/` | Eligibility + contract emission; this package consumes descriptors |
| Design system (UI) | Visual tokens/components; this package is **operational** composition |

---

## Non-goals

No production code, Prisma, routes, React, feature flags, Projection, Admin, Facility Builder, or Registry implementation changes.

---

## Completion gate

All documents exist, fifteen questions answered, indexes updated, one documentation-only commit.
