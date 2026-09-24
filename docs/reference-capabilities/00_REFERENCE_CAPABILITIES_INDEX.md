# Reference Capabilities Program — Index

**Status:** Canonical capability source of truth  
**Date:** 2026-07-07

This program defines the **enduring business capabilities** of the operations platform — the bridge between philosophy and software.

It is the final conceptual layer before product design begins.

---

## The conceptual stack

```
Platform
    ↓
Operations
    ↓
Capabilities
    ↓
Experiences
    ↓
Implementation
```

| Layer | Documented in | Defines |
|-------|---------------|---------|
| **Platform** | [PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md) | Mission, principles, what we optimize for |
| **Operations** | [OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) | How real-world service work happens |
| **Capabilities** | **docs/reference-capabilities/** (this program) | What the business must be able to do |
| **Experiences** | [docs/reference-ux/](../reference-ux/) | How users experience those abilities |
| **Implementation** | [docs/architecture-review/](../architecture-review/), future design | How it is built |

**Capabilities are not modules.** A module is an implementation packaging choice. A capability is an **enduring organizational ability** that survives product reorganizations.

Logs, staffing, and repairs are not capabilities — they may **express** capabilities. **Operation Readiness** and **Issue and Recovery** are capabilities.

---

## Purpose of this program

Define what the platform **must enable organizations to do** — consistently, across industries — to deliver physical service operations successfully.

Every capability document describes:

- Purpose
- Operational promise
- Inputs
- Outputs
- Users
- Relationships to other capabilities
- Operational rules
- Success criteria
- Future extensibility

This program does **not** describe databases, APIs, screens, or code.

---

## Canonical capabilities

| # | Capability | One-line promise |
|---|------------|------------------|
| 01 | [Operation Readiness](./01_OPERATION_READINESS.md) | Know if service can start or continue safely |
| 02 | [Operation Execution](./02_OPERATION_EXECUTION.md) | Run recurring service commitments on rhythm |
| 03 | [Workforce and Coverage](./03_WORKFORCE_AND_COVERAGE.md) | Right people, right place, right time |
| 04 | [Issue and Recovery](./04_ISSUE_AND_RECOVERY.md) | Survive disruption and learn from it |
| 05 | [Asset and Location](./05_ASSET_AND_LOCATION.md) | Places and equipment that enable work |
| 06 | [Supply and Resources](./06_SUPPLY_AND_RESOURCES.md) | Physical resources present when needed |
| 07 | [Operational Knowledge](./07_OPERATIONAL_KNOWLEDGE.md) | Institutional memory at point of work |
| 08 | [Operational Intelligence](./08_OPERATIONAL_INTELLIGENCE.md) | Continuous understanding of operational state |
| 09 | [Analytics and Continuous Improvement](./09_ANALYTICS_AND_CONTINUOUS_IMPROVEMENT.md) | Learn from completed operations |

Certification: [10_REFERENCE_CERTIFICATION.md](./10_REFERENCE_CERTIFICATION.md)

---

## Alignment

| Source | Role |
|--------|------|
| [PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md) | Principles capabilities must honor |
| [OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) | Operations capabilities serve |
| [DOMAIN_MODEL_TARGET.md](../platform-vision/DOMAIN_MODEL_TARGET.md) | Entities capabilities manipulate (conceptually) |
| [docs/reference-ux/](../reference-ux/) | Experiences capabilities surface through |

---

## Capability dependency diagram

Capabilities form a **dependency chain** — not a menu. Later capabilities assume earlier ones.

```
                    Operations
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   Operation        Workforce      Asset and
   Readiness        and Coverage    Location
         │              │              │
         └──────┬───────┴───────┬──────┘
                ▼               ▼
         Operation         Supply and
         Execution           Resources
                │               │
                └───────┬───────┘
                        ▼
                 Issue and Recovery
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
  Operational      Operational      Analytics and
  Knowledge        Intelligence   Continuous Improvement
```

**Readiness** and **Workforce** and **Asset/Location** feed **Execution**.  
**Supply** enables **Execution** and triggers **Recovery** when short.  
**Execution** generates **Issues**; **Recovery** restores flow.  
**Knowledge** strengthens all execution capabilities.  
**Intelligence** synthesizes live state across capabilities.  
**Analytics** learns from completed operations over time.

---

## Capability maturity roadmap

Platform capabilities mature in layers — each layer adds scope, not a different product.

```
Core Platform
    │  Single site. Recurring operations. Readiness, execution,
    │  workforce, issues, locations, basic knowledge.
    ▼
Operational Platform
    │  Full capability chain. Intelligence. Recovery as first-class.
    │  Supply awareness. Cross-department handoffs.
    ▼
Multi-site Platform
    │  Organization owns many sites. Shared standards, rollup awareness,
    │  cross-site analytics, template distribution.
    ▼
Enterprise Platform
    │  SSO, governance, advanced analytics, API ecosystem,
    │  operator-grade benchmarking across accounts.
    ▼
Industry Platform
    │  Industry packs: terminology, compliance presets, typical operations,
    │  benchmarks within vertical — same capabilities, configured depth.
```

Maturity is **breadth and depth of the same capabilities**, not new module silos.

---

## Executive summary

### What business is this platform actually in?

This platform is in the business of **operational execution** — helping organizations that deliver **recurring physical services** consistently fulfill their service commitments across people, places, time, and disruption.

It is **not** long-term care software. It is **not** a logs app, a CMMS, or a scheduling tool. Those are partial expressions of capabilities.

It **is**:

> **An operational execution platform that enables sites and operating organizations to see whether service can happen, run service when it can, adapt when it cannot, preserve what they learn, and improve over time — regardless of industry.**

Long-term care dining is the first proving ground. Hospitals, universities, K-12, corporate dining, environmental services, plant operations, laundry, and hospitality share the **same capability needs** with different labels and compliance depth.

The platform wins when a manager can answer in fifteen seconds: **Are we ready? Where should I go? What changed?** — and when a floor worker can answer: **What do I do next here?** — because the **capabilities underneath** are coherent, not because a module checklist is complete.

---

## How to use this program

**When scoping product work**, name the capability(ies) strengthened.

**When rejecting scope**, name the capability not served or violated.

**When adding industry packs**, configure capability inputs and rules — do not fork capabilities.

**When designing experience**, trace: Capability → Experience (Reference UX) → Implementation.

---

## Document index

| # | Document |
|---|----------|
| 00 | This index |
| 01 | Operation Readiness |
| 02 | Operation Execution |
| 03 | Workforce and Coverage |
| 04 | Issue and Recovery |
| 05 | Asset and Location |
| 06 | Supply and Resources |
| 07 | Operational Knowledge |
| 08 | Operational Intelligence |
| 09 | Analytics and Continuous Improvement |
| 10 | Reference Certification |

---

## Governance

Capabilities change **rarely**. New capabilities require certification amendment.

Features that do not map to a capability require explicit justification.

Implementation must not redefine capability boundaries for convenience.
