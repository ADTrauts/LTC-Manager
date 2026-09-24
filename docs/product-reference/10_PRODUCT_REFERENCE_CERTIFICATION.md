# Product Reference Certification

**Status:** Product source of truth — pre-implementation  
**Date:** 2026-07-07  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

This document certifies the **Product Reference Program**. Visual wireframes and production implementation **must conform** to what is defined here.

---

## Certification statement

The product is organized around **operations**, experienced through **three homes** (Operations Center, Unit Workspace, Supervisor path), navigated by **role and device**, interacting with **seven operational object families**, supported by **structured AI moments** — not modules.

Two independent design teams following this reference should produce **substantially the same** information architecture, flows, and decision hierarchy.

---

## Complete planning stack (certified)

```
Product Constitution
Operation Model
Domain Model (conceptual)
Reference Capabilities
Reference UX
Product Reference          ← CERTIFIED HERE
───────────────────────
Visual wireframes          (next phase)
Implementation             (next phase)
```

---

## Canonical navigation

### Permanent zones

| Zone | Default home |
|------|--------------|
| Operations Center | Manager |
| Locations → Unit Workspace | Employee |
| Today's Work | Supervisor |
| Review | Manager (deliberate) |
| Administration | Admin (deliberate) |

### Organizing principles (priority order)

1. **Operations** — time and commitment (manager header)
2. **Locations** — place (rail + workspace)
3. **Departments** — mode filter (lens)
4. **Roles** — capability gate

### Device behavior

| Device | Behavior |
|--------|----------|
| Kiosk locked | Unit Workspace only |
| Tablet roaming | Locations rail + Workspace |
| Desktop | Center + rail + panels |
| Mobile | Same IA, reduced density |

Full spec: [01_NAVIGATION_SYSTEM.md](./01_NAVIGATION_SYSTEM.md)

---

## Canonical screens

Screens are **product surfaces**, not implementation routes.

| Screen ID | Name | Primary user | Primary question |
|-----------|------|--------------|------------------|
| SCR-01 | Operations Center | Manager | Are we ready; what needs me? |
| SCR-02 | Unit Workspace | Employee, supervisor visit | What next here? |
| SCR-03 | Today's Work — Walk list | Supervisor | Where should I walk? |
| SCR-04 | Today's Work — Coverage | Supervisor, manager | Who covers gaps? |
| SCR-05 | Today's Work — Handoffs | Supervisor, manager | What is pending between teams? |
| SCR-06 | Issue detail | Supervisor, manager | What is wrong; what next? |
| SCR-07 | Locations list | Employee multi-site | Where am I going? |
| SCR-08 | Review | Manager | How did we perform over time? |
| SCR-09 | Administration hub | Admin | Configure site |
| SCR-10 | Work item focus | Employee | Complete one check/milestone |
| SCR-11 | Report problem | Employee, supervisor | Report disruption fast |

**No canonical "Logs screen" or "Staffing screen"** as primary morning home — those are Administration templates or embedded work/exceptions.

---

## Canonical interactions

| Interaction | Behavior |
|-------------|----------|
| Open app (manager) | Land SCR-01; optional Morning Brief |
| Open app (employee) | Land SCR-02 or SCR-07 |
| Open app (supervisor) | Land SCR-03 |
| Tap blocked location | SCR-01 → SCR-02 drawer/page, back preserves Center |
| Complete work item | SCR-10 → auto-promote next in SCR-02 |
| Report problem | SCR-11 → return SCR-02 with banner |
| Assign coverage | SCR-04 → updates Center Tier 1 |
| Escalate | Any → manager notification + SCR-01 highlight |
| Switch location | SCR-07 rail → full context swap |
| End operation | Shift transition AI + SCR-01 what's next |

---

## Canonical information hierarchy

### Operations Center (SCR-01)

```
1. Operation context bar
2. Site pulse (one sentence)
3. Exception stack (Tier 1)
4. Location grid (risk sorted)
5. Milestones (execution phase)
6. What's next
```

### Unit Workspace (SCR-02)

```
1. Orientation (operation, phase, readiness)
2. Next work (one promoted + queue)
3. Context (equipment, issues, knowledge) — collapsed
4. Report problem (persistent)
```

### Decision hierarchy (global)

```
1. Safety / blocked
2. Uncovered call-down
3. At-risk with time pressure
4. Handoff overdue
5. Healthy / monitor
6. Historical / admin
```

---

## Canonical object model (product)

| Object | User-facing states | Primary surfaces |
|--------|-------------------|------------------|
| Location | Ready, Not ready, Blocked, Healthy, At risk, Recovered | Rail, grid, workspace |
| Operation | Preparation, Execution, Closing, Complete | Header, filter |
| Work item | Due, Done, Failed | Workspace queue |
| Issue | Open, Recovered, Closed | Exceptions, detail |
| Asset | Working, Degraded, Down | Workspace context |
| Supply | OK, Short | Exception, report |
| Person | Assigned role at location | Coverage map |
| Call-down | Open, Covered | Center Tier 1 |
| Handoff | Pending, Complete | Today's Work |
| Knowledge | Tip, Procedure, Lesson | Inline expand |

Full spec: [07_OPERATIONAL_OBJECTS.md](./07_OPERATIONAL_OBJECTS.md)

---

## Canonical decision flow (manager morning)

```
Sign in
  → Operations Center (15-second orient)
  → If Tier 1 exception: drill or Today's Work
  → If clear: monitor / delegate supervisor
  → Loop 15–30 min during execution
  → Transition: what's next
  → Optional Review (not default)
```

Reference walkthrough: [06_OPERATION_FLOW_REFERENCE.md](./06_OPERATION_FLOW_REFERENCE.md)

---

## Canonical AI moments

| Moment | Surface |
|--------|---------|
| Morning Brief | SCR-01 open |
| Operational Summary | SCR-01 on demand |
| Recovery Assistant | SCR-06 |
| Decision Support | SCR-01 at-risk |
| Shift Transition | SCR-01 / SCR-03 close |
| Prediction | SCR-01 / SCR-03 badge |
| Knowledge Retrieval | SCR-02 Help, SCR-06 |

No global chat. Full spec: [08_AI_EXPERIENCE_REFERENCE.md](./08_AI_EXPERIENCE_REFERENCE.md)

---

## Capability mapping (product surfaces)

| Capability | Canonical screens |
|------------|-------------------|
| Operation Readiness | SCR-01, SCR-02 orientation |
| Operation Execution | SCR-02, SCR-10 |
| Workforce and Coverage | SCR-04, SCR-03 |
| Issue and Recovery | SCR-11, SCR-06, SCR-01 exceptions |
| Asset and Location | SCR-02 context, SCR-09 admin |
| Supply and Resources | SCR-11, SCR-01 exceptions |
| Operational Knowledge | SCR-02 Help, inline |
| Operational Intelligence | SCR-01, AI moments |
| Analytics | SCR-08 |

---

## Conformance rules (implementation phase)

Before shipping any screen or flow:

| # | Rule |
|---|------|
| 1 | Maps to canonical screen ID or amendment |
| 2 | Maps to ≥1 capability |
| 3 | Respects role device matrix |
| 4 | Honors information hierarchy for that screen |
| 5 | Offers next action — no dead ends |
| 6 | Does not introduce module-first navigation |
| 7 | Employee path stays simple (principle 10) |
| 8 | AI only in certified moments |
| 9 | Objects use canonical states |
| 10 | Amendment requires certification update |

Wireframes that violate hierarchy order (e.g., birthdays above blocked locations) **fail conformance**.

---

## Program documents (complete)

| # | Document |
|---|----------|
| 00 | [PRODUCT_REFERENCE_INDEX](./00_PRODUCT_REFERENCE_INDEX.md) |
| 01 | [NAVIGATION_SYSTEM](./01_NAVIGATION_SYSTEM.md) |
| 02 | [OPERATIONS_CENTER_REFERENCE](./02_OPERATIONS_CENTER_REFERENCE.md) |
| 03 | [UNIT_WORKSPACE_REFERENCE](./03_UNIT_WORKSPACE_REFERENCE.md) |
| 04 | [SUPERVISOR_REFERENCE](./04_SUPERVISOR_REFERENCE.md) |
| 05 | [EMPLOYEE_REFERENCE](./05_EMPLOYEE_REFERENCE.md) |
| 06 | [OPERATION_FLOW_REFERENCE](./06_OPERATION_FLOW_REFERENCE.md) |
| 07 | [OPERATIONAL_OBJECTS](./07_OPERATIONAL_OBJECTS.md) |
| 08 | [AI_EXPERIENCE_REFERENCE](./08_AI_EXPERIENCE_REFERENCE.md) |
| 09 | [DESIGN_PRINCIPLES](./09_DESIGN_PRINCIPLES.md) |
| 10 | This certification |

---

## What comes next

| Phase | Input | Output |
|-------|-------|--------|
| Visual design | This certification | Wireframes, visual system |
| Implementation | Wireframes + architecture | Code, schema, APIs |
| Validation | Conformance checklist | Sign-off per release |

**Product Reference is complete.** No implementation authorized by this document alone.

---

## Executive summary

This product moves people through **operational time** at **operational places**:

- **Managers** live in the Operations Center — exceptions first, locations second, history last.
- **Supervisors** live in the walk — Today's Work ordered by risk, Unit Workspace for minutes not hours.
- **Employees** live in one location — one next action, report problem always near.

Modules dissolve into **work items** and **exceptions**. AI appears in **briefing moments**, not chat. Administration waits offstage.

That is the product. Implementation must serve this movement — not legacy navigation.

---

## Related governance

| Document | Role |
|----------|------|
| [reference-capabilities/10_REFERENCE_CERTIFICATION.md](../reference-capabilities/10_REFERENCE_CERTIFICATION.md) | What we must do |
| [reference-ux/10_REFERENCE_CERTIFICATION.md](../reference-ux/10_REFERENCE_CERTIFICATION.md) | How it should feel |
| **This document** | How people move through it |
