# Product Reference — Index

**Status:** Product source of truth (pre-implementation)  
**Date:** 2026-07-07

Architecture planning is **complete**. This program begins **Product Reference Design** — the last planning layer before visual wireframes and production implementation.

---

## The planning stack

```
Product Constitution     →  Why the platform exists
Operation Model          →  How real-world operations work
Domain Model             →  What entities exist (conceptual)
Reference Capabilities   →  What the business must be able to do
Reference UX             →  How operational work should feel
Product Reference        →  How people move through the product  ← THIS PROGRAM
(future) Visual design   →  Wireframes, visual system
(future) Implementation  →  Code, schema, APIs
```

| Layer | Answers |
|-------|---------|
| **Architecture** | What the platform is structurally |
| **Capabilities** | What it can do |
| **UX Reference** | How it should feel emotionally and cognitively |
| **Product Reference** | How users navigate, decide, and complete work |

Two design teams reading only this program should build **nearly the same application** — same navigation, same screens, same flows, same decision order — without seeing each other's work.

---

## Certified upstream sources

This program **conforms to** and does not override:

| Document | Location |
|----------|----------|
| Product Constitution | [docs/platform-vision/PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md) |
| Operation Model | [docs/platform-vision/OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) |
| Domain Model | [docs/platform-vision/DOMAIN_MODEL_TARGET.md](../platform-vision/DOMAIN_MODEL_TARGET.md) |
| Reference UX | [docs/reference-ux/](../reference-ux/) |
| Reference Capabilities | [docs/reference-capabilities/](../reference-capabilities/) |
| Architecture (current state) | [docs/architecture-review/](../architecture-review/) |

---

## What Product Reference defines

Every document describes:

- **User goals** — what the person is trying to accomplish
- **Navigation** — how they move between areas
- **Information architecture** — what appears where and in what order
- **User flow** — sequence of actions through time
- **Decision hierarchy** — what matters first
- **Interaction philosophy** — how choices behave, not how they look

Product Reference does **not** define: CSS, components, APIs, database schema, wireframes, or pixel layout.

---

## Program documents

| # | Document | Defines |
|---|----------|---------|
| 00 | This index | Program scope and stack |
| 01 | [NAVIGATION_SYSTEM](./01_NAVIGATION_SYSTEM.md) | Permanent nav, role/device behavior |
| 02 | [OPERATIONS_CENTER_REFERENCE](./02_OPERATIONS_CENTER_REFERENCE.md) | Manager home — minute-by-minute |
| 03 | [UNIT_WORKSPACE_REFERENCE](./03_UNIT_WORKSPACE_REFERENCE.md) | Location execution surface |
| 04 | [SUPERVISOR_REFERENCE](./04_SUPERVISOR_REFERENCE.md) | Multi-location oversight rhythm |
| 05 | [EMPLOYEE_REFERENCE](./05_EMPLOYEE_REFERENCE.md) | Floor simplicity |
| 06 | [OPERATION_FLOW_REFERENCE](./06_OPERATION_FLOW_REFERENCE.md) | Full breakfast service walkthrough |
| 07 | [OPERATIONAL_OBJECTS](./07_OPERATIONAL_OBJECTS.md) | Product objects users interact with |
| 08 | [AI_EXPERIENCE_REFERENCE](./08_AI_EXPERIENCE_REFERENCE.md) | AI as operational partner |
| 09 | [DESIGN_PRINCIPLES](./09_DESIGN_PRINCIPLES.md) | Product decision guide |
| 10 | [PRODUCT_REFERENCE_CERTIFICATION](./10_PRODUCT_REFERENCE_CERTIFICATION.md) | Certification and canonical model |

---

## Three homes

The product organizes around **three primary places** users live:

| Place | Who | Product question |
|-------|-----|------------------|
| **Operations Center** | Manager | *How is the site doing — what needs me?* |
| **Unit Workspace** | Employee (and supervisor on visit) | *What do I do here, now?* |
| **Supervisor Path** | Supervisor | *Where should I be — what is slipping?* |

Administration (roster, templates, permissions, site setup) is **fourth** — entered deliberately, exited back to operations.

---

## Interaction philosophy (program-wide)

1. **Operations before administration** — daily work is default; config is intentional.
2. **One screen, one decision** — each view resolves one primary question.
3. **Exceptions first** — problems surface before completeness.
4. **No dead ends** — every state offers *what next* or *go back*.
5. **Context travels** — drilling down carries operation, location, and reason.
6. **Floor ≠ office** — employees get less, not a dumbed-down manager app.

Full principles: [09_DESIGN_PRINCIPLES.md](./09_DESIGN_PRINCIPLES.md).

---

## First product slice alignment

The first implemented product slice is **Dietary Operational Mode** — breakfast/lunch/dinner rhythm at a multi-location site. Product Reference is **industry-neutral**; dietary is the **reference operation** in [06_OPERATION_FLOW_REFERENCE](./06_OPERATION_FLOW_REFERENCE.md).

---

## Governance

- Visual wireframes and implementation **must conform** to [10_PRODUCT_REFERENCE_CERTIFICATION.md](./10_PRODUCT_REFERENCE_CERTIFICATION.md).
- Conflicts resolve upstream: Constitution → Operation Model → Capabilities → UX → **Product Reference**.
- Amendments to canonical navigation or screens require certification update.

---

## How to use this program

**Product managers** — scope features against canonical screens and flows.  
**Designers** — wireframe from these references, not from legacy module names.  
**Engineers** — implement behaviors and IA described here; technical choices are downstream.

If a proposed feature cannot be placed in navigation, flow, and object model — it is not ready to build.
