# Reference Capabilities Certification

**Status:** Canonical capability source of truth  
**Date:** 2026-07-07  
**Parent:** [00_REFERENCE_CAPABILITIES_INDEX.md](./00_REFERENCE_CAPABILITIES_INDEX.md)

This document certifies the **Reference Capabilities Program** as the enduring business capability standard for the operations platform. Product design, industry packs, and future modules **extend this model** — they do not replace it with isolated feature silos.

---

## Certification statement

The platform provides **nine canonical capabilities** that enable organizations to execute recurring physical service operations across industries.

Capabilities are **business abilities**, not software modules.

Implementation, experience, and industry configuration **express** capabilities — they do not redefine them.

---

## The conceptual stack (certified)

```
Platform          →  Mission and principles (Product Constitution)
Operations        →  What work is (Operation Model)
Capabilities      →  What the business must do (this program)
Experiences       →  How users feel it (Reference UX)
Implementation    →  How it is built (architecture, design, code)
```

**Product design begins** with capability conformance, then experience conformance, then implementation.

---

## Canonical capabilities

| ID | Capability | Operational promise |
|----|------------|---------------------|
| CAP-01 | [Operation Readiness](./01_OPERATION_READINESS.md) | Know if service can start or continue safely |
| CAP-02 | [Operation Execution](./02_OPERATION_EXECUTION.md) | Run recurring service commitments on rhythm |
| CAP-03 | [Workforce and Coverage](./03_WORKFORCE_AND_COVERAGE.md) | Right people, right place, right time |
| CAP-04 | [Issue and Recovery](./04_ISSUE_AND_RECOVERY.md) | Survive disruption and learn from it |
| CAP-05 | [Asset and Location](./05_ASSET_AND_LOCATION.md) | Places and equipment that enable work |
| CAP-06 | [Supply and Resources](./06_SUPPLY_AND_RESOURCES.md) | Physical resources present when needed |
| CAP-07 | [Operational Knowledge](./07_OPERATIONAL_KNOWLEDGE.md) | Institutional memory at point of work |
| CAP-08 | [Operational Intelligence](./08_OPERATIONAL_INTELLIGENCE.md) | Continuous understanding of operational state |
| CAP-09 | [Analytics and Continuous Improvement](./09_ANALYTICS_AND_CONTINUOUS_IMPROVEMENT.md) | Learn from completed operations |

---

## Capability hierarchy

Capabilities group into **three tiers** by operational dependency.

### Tier A — Enable (before and during)

Must be true for execution to succeed.

| Capability | Role |
|------------|------|
| Operation Readiness | Gate and monitor |
| Workforce and Coverage | People |
| Asset and Location | Place and equipment |
| Supply and Resources | Consumables |

### Tier B — Perform (the work)

| Capability | Role |
|------------|------|
| Operation Execution | Fulfill service commitment |

### Tier C — Adapt and learn (when plan breaks and after)

| Capability | Role |
|------------|------|
| Issue and Recovery | Disruption and resilience |
| Operational Knowledge | Memory and teaching |
| Operational Intelligence | Live understanding |
| Analytics and Continuous Improvement | Long-term learning |

**Execution** sits at the center. **Readiness** and **Enable** capabilities feed it. **Recovery** and **Learn** capabilities wrap and improve it.

---

## Capability relationships (certified)

```
                    ┌─────────────────┐
                    │   Operations    │
                    │  (conceptual)   │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │  Operation   │   │  Workforce   │   │    Asset     │
 │  Readiness   │   │  & Coverage  │   │  & Location  │
 └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
        │                  │                  │
        └────────┬─────────┴────────┬─────────┘
                 ▼                  ▼
          ┌──────────────┐   ┌──────────────┐
          │  Operation   │   │    Supply    │
          │  Execution   │◄──│  & Resources │
          └──────┬───────┘   └──────────────┘
                 │
                 ▼
          ┌──────────────┐
          │    Issue &   │
          │   Recovery   │
          └──────┬───────┘
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Operational│ │Operational│ │Analytics│
│ Knowledge │ │Intelligence│ │  & CI   │
└─────────┘ └─────────┘ └─────────┘
```

### Cross-capability flows (summary)

| From | To | Flow |
|------|-----|------|
| Workforce, Asset, Supply | Readiness | Inputs synthesized |
| Readiness | Execution | Gate and monitor |
| Execution | Issue | Disruption detected |
| Issue | Recovery | Response |
| Recovery | Readiness | State updated |
| All tiers | Intelligence | Live synthesis |
| Completed ops | Analytics | Historical learning |
| Analytics, Recovery | Knowledge | SOP and lesson updates |
| Knowledge | Execution, Readiness | Informed work |

---

## Capability dependency diagram (linear view)

Certified dependency chain for planning sequencing:

```
Operations
    ↓
Operation Readiness ←── Workforce and Coverage
    ↓              ←── Asset and Location
    ↓              ←── Supply and Resources
Operation Execution
    ↓
Issue and Recovery
    ↓
Operational Knowledge
    ↓
Operational Intelligence
    ↓
Analytics and Continuous Improvement
```

Earlier capabilities **must be coherent** before later capabilities deliver full value. Intelligence without readiness data is hollow. Analytics without execution outcomes is noise.

---

## Capability boundaries

What capabilities **are not**:

| Boundary | Clarification |
|----------|---------------|
| **Not HRIS** | Workforce covers operational placement; payroll/benefits are external or modular HR depth |
| **Not EMR/clinical** | Patient/resident clinical record out of scope; operational coordination in scope |
| **Not ERP inventory** | Supply covers operational sufficiency; full inventory is future extension of CAP-06 |
| **Not CMMS-only** | Asset includes maintenance but serves operations, not maintenance for its own sake |
| **Not BI replacement** | Analytics serves operational improvement; enterprise BI may integrate at maturity |
| **Not chatbot** | Intelligence includes AI partner grounded in operations |

### Module-to-capability mapping (illustrative)

Legacy "module" thinking maps to capabilities — **many modules may serve one capability**:

| Old module label | Primary capability |
|------------------|-------------------|
| Logs / compliance | Readiness + Execution |
| Staffing / schedule | Workforce and Coverage |
| Repairs / work orders | Issue and Recovery + Asset |
| Units / locations | Asset and Location |
| Dashboard | Operational Intelligence |
| Reports | Analytics |
| Menus / production | Execution (input content) |
| Employees / roster | Workforce (input) |

New features name **capability strengthened**, not module extended.

---

## Capability responsibilities (RACI-style)

| Capability | Manager | Supervisor | Employee | Support dept |
|------------|---------|------------|----------|--------------|
| Readiness | Accountable | Responsible | Informed | Consulted |
| Execution | Accountable | Responsible | Responsible | Consulted |
| Workforce | Accountable | Responsible | Informed | — |
| Issue & Recovery | Escalation | Responsible | Report | Responsible |
| Asset & Location | Accountable | Consulted | Report | Responsible (plant) |
| Supply | Accountable | Mitigate | Report | Responsible (stores) |
| Knowledge | Standards | Maintain local | Consume | — |
| Intelligence | Consume | Consume | — | — |
| Analytics | Consume | Informed | — | Consulted |

---

## Capability maturity roadmap (certified)

Platform evolution deepens **the same nine capabilities** — not new product lines.

### Core Platform

**Scope:** Single site.

**Capabilities:** Readiness (basic), Execution, Workforce (plan + override), Issue (corrective), Asset and Location (registry), Knowledge (attached notes), Intelligence (manual synthesis).

**Promise:** Run today's operations with shared picture.

---

### Operational Platform

**Scope:** Single site, full depth.

**Capabilities:** All nine at operational maturity — recovery first-class, supply shorts, intelligence synthesis, analytics for managers.

**Promise:** Resilient daily execution; improvement loop begins.

---

### Multi-site Platform

**Scope:** Organization with many sites.

**Capabilities:** Shared templates, org rollup intelligence, cross-site analytics, operator benchmarking within org.

**Promise:** Contract operator repeats excellence across accounts.

---

### Enterprise Platform

**Scope:** Large operators, integrations.

**Capabilities:** SSO governance, API ecosystem, advanced analytics export, SLA reporting, predictive intelligence.

**Promise:** Enterprise-grade operations at scale.

---

### Industry Platform

**Scope:** Vertical depth via packs.

**Capabilities:** Same nine — configured terminology, compliance rules, operation catalogs, benchmarks within vertical.

**Promise:** Industry-native feel without industry-locked architecture.

---

## Experience alignment (certified)

Each capability primary experience surface:

| Capability | Primary experience |
|------------|-------------------|
| Readiness | Operations Center, Unit Workspace |
| Execution | Unit Workspace, Operation Timeline |
| Workforce | Operations Center, Supervisor Workspace |
| Issue & Recovery | Operational Recovery, Unit Workspace |
| Asset & Location | Unit Workspace |
| Supply | Unit Workspace, Operations Center |
| Knowledge | Operational Knowledge, Employee Workspace |
| Intelligence | Operations Center, Operational AI |
| Analytics | Deliberate review — not open glance |

Full experience spec: [docs/reference-ux/](../reference-ux/).

---

## Conformance rules

Before certifying a feature or industry pack:

| # | Rule | Fail if |
|---|------|---------|
| 1 | **Maps to capability** | No capability ID |
| 2 | **Serves an operation** | Orphan admin tool |
| 3 | **Respects boundaries** | Pretends to be ERP/EMR |
| 4 | **Honors readiness states** | Paperwork green, service red |
| 5 | **Recovery visible** | Variance hidden |
| 6 | **Knowledge contextual** | Binder-only |
| 7 | **Intelligence ≠ analytics on open** | Historical report as home |
| 8 | **Industry configures** | Hardcoded vertical in core |
| 9 | **Extends don't fork** | New capability for one client |
| 10 | **Experience traceable** | Capability → UX doc reference |

Amendment to capabilities requires updating this certification and [00_REFERENCE_CAPABILITIES_INDEX.md](./00_REFERENCE_CAPABILITIES_INDEX.md).

---

## Executive summary

### What business is this platform actually in?

**Not:** Long-term care software.  
**Not:** A logs application.  
**Not:** A maintenance ticket system.  
**Not:** A staff scheduler.

**Yes:** The platform is in the business of **operational execution**.

Specifically:

> **Enabling sites and operating organizations to consistently deliver physical service commitments — across people, places, time, and disruption — by making readiness visible, execution coordinated, recovery supported, knowledge preserved, intelligence continuous, and improvement measurable.**

The platform helps organizations that **run on rhythm** — meals, rounds, turns, events, openings, closings — answer:

- **Can we perform?** (Readiness)
- **Are we performing?** (Execution, Intelligence)
- **Who is doing it?** (Workforce)
- **Where and with what?** (Asset and Location, Supply)
- **What broke and how did we adapt?** (Issue and Recovery)
- **What did we learn?** (Knowledge, Analytics)

Long-term care is where this promise is **first proven**. Hospitals, universities, K-12, corporate dining, environmental services, plant operations, laundry, and hospitality are where it **generalizes** — because the capabilities are universal even when the words differ.

The platform wins when operations **succeed in the real world**, not when modules check boxes.

---

## Program documents (complete)

| # | Document |
|---|----------|
| 00 | [REFERENCE_CAPABILITIES_INDEX](./00_REFERENCE_CAPABILITIES_INDEX.md) |
| 01 | [OPERATION_READINESS](./01_OPERATION_READINESS.md) |
| 02 | [OPERATION_EXECUTION](./02_OPERATION_EXECUTION.md) |
| 03 | [WORKFORCE_AND_COVERAGE](./03_WORKFORCE_AND_COVERAGE.md) |
| 04 | [ISSUE_AND_RECOVERY](./04_ISSUE_AND_RECOVERY.md) |
| 05 | [ASSET_AND_LOCATION](./05_ASSET_AND_LOCATION.md) |
| 06 | [SUPPLY_AND_RESOURCES](./06_SUPPLY_AND_RESOURCES.md) |
| 07 | [OPERATIONAL_KNOWLEDGE](./07_OPERATIONAL_KNOWLEDGE.md) |
| 08 | [OPERATIONAL_INTELLIGENCE](./08_OPERATIONAL_INTELLIGENCE.md) |
| 09 | [ANALYTICS_AND_CONTINUOUS_IMPROVEMENT](./09_ANALYTICS_AND_CONTINUOUS_IMPROVEMENT.md) |
| 10 | This certification |

---

## Governance chain (certified)

```
PRODUCT_CONSTITUTION.md     → Why we exist
OPERATION_MODEL.md          → What operations are
DOMAIN_MODEL_TARGET.md      → What entities exist (conceptual)
reference-capabilities/     → What we must be able to do  ← THIS PROGRAM
reference-ux/               → How it should feel
architecture-review/        → What exists today
(future product design)     → What we build next
```

Future capabilities extend through **certification amendment**, not shadow modules.

---

## Related documents

- [PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md)
- [OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md)
- [DOMAIN_MODEL_TARGET.md](../platform-vision/DOMAIN_MODEL_TARGET.md)
- [10_REFERENCE_CERTIFICATION.md](../reference-ux/10_REFERENCE_CERTIFICATION.md) — experience certification
- [docs/architecture-review/](../architecture-review/) — current implementation state
