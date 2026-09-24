# Reference UX Program — Index

**Status:** Canonical UX source of truth  
**Date:** 2026-07-07  
**Governed by:** [PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md), [OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md)

---

## Purpose

This program defines **how operational work should feel** on the platform — not how it is built.

Architecture describes structure. The Product Constitution describes principles. The Operation Model describes how work happens in the real world. **This program describes the experience** of running that work through the platform.

Every future module, industry pack, and feature must conform to these experiences before it conforms to legacy navigation patterns or module boundaries.

---

## What this program is

- A **canonical reference** for user mindset, goals, decision-making, information hierarchy, operational flow, and UX principles.
- A **shared language** for product, design, and engineering when debating what to build next.
- An **experience contract** across industries: long-term care, hospitals, universities, K-12, corporate dining, environmental services, plant operations, laundry, hospitality.

## What this program is not

- A visual design system (no colors, typography, or layout specs).
- An implementation plan (no APIs, databases, components, or screens).
- A feature backlog.

---

## The three workspaces and one center

Operational roles experience the platform through distinct but connected surfaces:

| Document | Primary audience | Core question |
|----------|------------------|---------------|
| [01_OPERATIONS_CENTER.md](./01_OPERATIONS_CENTER.md) | Managers, department heads | *How is the site doing right now — and what needs me?* |
| [02_UNIT_WORKSPACE.md](./02_UNIT_WORKSPACE.md) | Frontline staff at a location | *What do I do here, for this operation, right now?* |
| [03_SUPERVISOR_WORKSPACE.md](./03_SUPERVISOR_WORKSPACE.md) | Supervisors spanning locations | *Where should I be — and what is slipping?* |
| [04_EMPLOYEE_WORKSPACE.md](./04_EMPLOYEE_WORKSPACE.md) | All floor participants | *Where am I, what's next, and how do I get help?* |

**Operations Center** is the manager's home. **Unit Workspace** is the execution home. Supervisors **bridge** both. Employees **live** in Unit Workspace with minimal cognitive load.

---

## Cross-cutting experience documents

| Document | Subject |
|----------|---------|
| [05_OPERATION_TIMELINE.md](./05_OPERATION_TIMELINE.md) | How operational time rhythms through a day |
| [06_OPERATIONAL_AWARENESS.md](./06_OPERATIONAL_AWARENESS.md) | Health states, attention hierarchy, awareness vs reporting |
| [07_OPERATIONAL_RECOVERY.md](./07_OPERATIONAL_RECOVERY.md) | Disruption and recovery as normal experience |
| [08_OPERATIONAL_KNOWLEDGE.md](./08_OPERATIONAL_KNOWLEDGE.md) | Knowledge at the moment of work |
| [09_OPERATIONAL_AI.md](./09_OPERATIONAL_AI.md) | AI as operational partner, not chatbot |

---

## Certification

[10_REFERENCE_CERTIFICATION.md](./10_REFERENCE_CERTIFICATION.md) summarizes canonical experiences, terminology, journeys, and decision hierarchy. Use it to validate new work.

---

## Foundational alignment

All reference UX documents inherit from:

1. **Operations before documentation** — capture during work, not after.
2. **Software where work happens** — floor-first, location-first.
3. **Role- and location-scoped experience** — see only what matters for this job, place, and time.
4. **Operational awareness** — now and next before history.
5. **Knowledge attached to work** — not buried in libraries.
6. **Resilience during disruption** — recovery is visible and supported.
7. **Industry-aware, not industry-locked** — same experiences, configurable language.

---

## How to use this program

**When designing a feature**, ask:

1. Which workspace does it belong to?
2. Which operational question does it answer?
3. Does it respect the information hierarchy for that role?
4. Does it support recovery, not only the happy path?
5. Does it attach knowledge to the work moment?

**When reviewing a feature**, ask:

1. Would a manager find this in the Operations Center or be forced to hunt?
2. Would an employee feel overwhelmed or guided?
3. Does it strengthen operational awareness or add noise?

If answers fail, the feature does not yet meet the reference standard.

---

## Document index

| # | Document | One-line summary |
|---|----------|------------------|
| 00 | This index | Program overview and governance |
| 01 | Operations Center | Manager situational awareness and prioritization |
| 02 | Unit Workspace | Location-scoped execution |
| 03 | Supervisor Workspace | Multi-location oversight and recovery |
| 04 | Employee Workspace | Floor participant clarity and calm |
| 05 | Operation Timeline | Daily and recurring operational rhythm |
| 06 | Operational Awareness | Health states and attention |
| 07 | Operational Recovery | Disruption as first-class experience |
| 08 | Operational Knowledge | Contextual teaching and memory |
| 09 | Operational AI | Intelligent operational partner |
| 10 | Reference Certification | UX source of truth summary |

---

## Relationship to other docs

| Layer | Location |
|-------|----------|
| Current implementation | [docs/architecture-review/](../architecture-review/) |
| Product principles | [docs/platform-vision/PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md) |
| Operational concepts | [docs/platform-vision/OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) |
| Domain entities | [docs/platform-vision/DOMAIN_MODEL_TARGET.md](../platform-vision/DOMAIN_MODEL_TARGET.md) |
| **User experience** | **docs/reference-ux/** (this program) |

Experience sits between **what work is** (Operation Model) and **how it is built** (architecture). Changes to experience require updating this program. Changes to principles require updating the Constitution first.
