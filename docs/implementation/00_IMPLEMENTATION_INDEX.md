# Implementation Program — Index

**Status:** Active — guides all production development  
**Date:** 2026-07-07  
**Planning phase:** CLOSED  
**Application code:** Not modified by this program

---

## Executive overview

Planning is **complete and certified**. The platform now enters **implementation** — incremental modernization of the existing `ltc-manager` Next.js monolith toward the certified product vision, without a rewrite.

This program is the **single execution authority** for engineers, designers, and Cursor agents. It translates certified planning documents into **ordered modernization waves**, **codebase maps**, **regression protection**, **release gates**, and **per-wave execution templates**.

**Do not create new planning or philosophy documents.** Amend certified upstream docs only through their governance process. All new work flows through this program.

---

## Certified planning stack (source of truth)

Implementation **must conform** to these documents. When conflicts arise, resolve upstream:

| Layer | Location | Governs |
|-------|----------|---------|
| Product Constitution | [docs/platform-vision/PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md) | Why the platform exists |
| Operation Model | [docs/platform-vision/OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) | How real-world operations work |
| Domain Model | [docs/platform-vision/DOMAIN_MODEL_TARGET.md](../platform-vision/DOMAIN_MODEL_TARGET.md) | Target entities (conceptual) |
| Architecture Decision Log | [docs/platform-vision/ARCHITECTURE_DECISION_LOG.md](../platform-vision/ARCHITECTURE_DECISION_LOG.md) | Non-negotiable technical decisions |
| Current vs Target | [docs/platform-vision/CURRENT_STATE_VS_TARGET_STATE.md](../platform-vision/CURRENT_STATE_VS_TARGET_STATE.md) | Preserve / refactor / missing |
| First Product Slice | [docs/platform-vision/FIRST_PRODUCT_SLICE.md](../platform-vision/FIRST_PRODUCT_SLICE.md) | Dietary Operational Mode scope |
| Reference Capabilities | [docs/reference-capabilities/](../reference-capabilities/) | What the business must do |
| Reference UX | [docs/reference-ux/](../reference-ux/) | How operational work should feel |
| Product Reference | [docs/product-reference/](../product-reference/) | Navigation, screens, flows |
| Architecture Review | [docs/architecture-review/](../architecture-review/) | Current codebase truth |

---

## The implementation lifecycle

```
Planning          →  COMPLETE (certified stack above)
       ↓
Modernization     →  12 waves in 01_MODERNIZATION_ROADMAP.md
       ↓
Implementation    →  One wave per Cursor session via 06_WAVE_EXECUTION_TEMPLATE.md
       ↓
Validation        →  Per-wave checklist in 03_REGRESSION_PROTECTION.md
       ↓
Release           →  Gates in 04_RELEASE_STRATEGY.md
```

| Phase | What happens | Owner artifact |
|-------|--------------|----------------|
| **Planning** | Vision, capabilities, UX, product reference | Certified docs (frozen) |
| **Modernization** | Wave selected; scope bounded; map drawn | `01`, `02`, `03` |
| **Implementation** | Code, schema, UI changes in `ltc-manager/` | Wave prompt + `05`, `06` |
| **Validation** | Manual + automated checks; regression pass | `03`, wave completion report |
| **Release** | Internal → pilot → beta → production | `04`, git tag / milestone |

---

## How future work is organized

### One wave at a time

Each Cursor implementation session executes **exactly one modernization wave** (or an explicitly scoped sub-milestone within a wave). Do not start the next wave until the current wave's validation and completion report are done.

### Wave selection order

Waves are **sequential by default**. See [01_MODERNIZATION_ROADMAP.md](./01_MODERNIZATION_ROADMAP.md) for dependencies. The highest-priority wave is **Wave 1: Application Shell & Navigation** (see [07_PROJECT_STATUS.md](./07_PROJECT_STATUS.md)).

**Exception:** Wave 6 (Readiness Engine) v0 — computed readiness without new tables — may ship as part of Wave 2 per [FIRST_PRODUCT_SLICE.md](../platform-vision/FIRST_PRODUCT_SLICE.md). Document the split in the wave completion report.

### Every session follows the same template

Copy [06_WAVE_EXECUTION_TEMPLATE.md](./06_WAVE_EXECUTION_TEMPLATE.md) into the implementation prompt. Fill in wave number, certified references, affected files (from [02_CODEBASE_MAPPING.md](./02_CODEBASE_MAPPING.md)), and validation steps (from [03_REGRESSION_PROTECTION.md](./03_REGRESSION_PROTECTION.md)).

### Standards apply to all code changes

[05_DEVELOPMENT_STANDARDS.md](./05_DEVELOPMENT_STANDARDS.md) is binding for every wave. Preserve working behavior unless intentionally replaced.

### Status tracking

Update [07_PROJECT_STATUS.md](./07_PROJECT_STATUS.md) when a wave completes: mark wave status, note git milestone, record blockers.

---

## Program documents

| # | Document | Purpose |
|---|----------|---------|
| 00 | This index | Executive overview and lifecycle |
| 01 | [MODERNIZATION_ROADMAP](./01_MODERNIZATION_ROADMAP.md) | 12 waves: purpose, deliverables, effort, risk |
| 02 | [CODEBASE_MAPPING](./02_CODEBASE_MAPPING.md) | Per-wave file, route, model, service map |
| 03 | [REGRESSION_PROTECTION](./03_REGRESSION_PROTECTION.md) | Critical workflows, testing, rollback per wave |
| 04 | [RELEASE_STRATEGY](./04_RELEASE_STRATEGY.md) | Internal → pilot → beta → production gates |
| 05 | [DEVELOPMENT_STANDARDS](./05_DEVELOPMENT_STANDARDS.md) | Implementation rules for all waves |
| 06 | [WAVE_EXECUTION_TEMPLATE](./06_WAVE_EXECUTION_TEMPLATE.md) | Copy-paste prompt structure per wave |
| 07 | [PROJECT_STATUS](./07_PROJECT_STATUS.md) | Maturity snapshot and current wave priority |

---

## Application root

All implementation occurs in:

```
/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager/
```

Stack: Next.js 16 App Router, React 19, Prisma 6, PostgreSQL, Server Actions, JWT + PIN auth.

---

## Architectural guardrails (from ADL)

These decisions are **not revisited** during implementation waves unless the Architecture Decision Log is formally amended:

| ADL | Rule |
|-----|------|
| ADL-001 | No greenfield rewrite — extend existing monolith |
| ADL-002 | `Unit` remains operational anchor (UI: Location) |
| ADL-003 | `Facility` remains tenancy root until Wave 11 |
| ADL-005 | Dietary Operational Mode is first wedge |
| ADL-007 | Log framework stays; Task unification is Wave 7+ |
| ADL-009 | Monolith first; no microservices split |

---

## What this program does not authorize

- New planning or philosophy documents
- Parallel product redesign outside certified references
- Breaking changes without regression checklist and rollback plan
- Skipping validation at wave end

---

## Starting implementation

**Next action:** Begin **Wave 1 — Application Shell & Navigation** using [06_WAVE_EXECUTION_TEMPLATE.md](./06_WAVE_EXECUTION_TEMPLATE.md).

Wait for explicit wave prompt before writing application code.
