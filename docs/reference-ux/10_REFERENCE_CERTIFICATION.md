# Reference Certification

**Status:** UX program certification — source of truth summary  
**Date:** 2026-07-07  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

This document certifies the **Reference UX Program** as the canonical experience standard for the operations platform. Future features, modules, and industry packs **conform here first**.

---

## Program scope

The Reference UX Program defines **how operational work should feel** for:

- Long-term care
- Hospitals
- Universities
- K-12
- Corporate dining
- Environmental services
- Plant operations
- Laundry
- Hospitality

Focus: **operational execution**, not industry-specific software silos.

Aligned with:

- [PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md) — principles
- [OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) — what operations are
- [DOMAIN_MODEL_TARGET.md](../platform-vision/DOMAIN_MODEL_TARGET.md) — entities (experience layer only)

---

## Canonical experiences

Five experiences form the platform. Every feature maps to at least one.

| Experience | Primary user | Core question | Document |
|------------|--------------|---------------|----------|
| **Operations Center** | Manager | How is the site doing — what needs me? | [01](./01_OPERATIONS_CENTER.md) |
| **Unit Workspace** | Floor at location | What do I do here for this operation? | [02](./02_UNIT_WORKSPACE.md) |
| **Supervisor Workspace** | Supervisor | Where should I be — what is slipping? | [03](./03_SUPERVISOR_WORKSPACE.md) |
| **Employee Workspace** | All floor staff | Where am I — what's next? | [04](./04_EMPLOYEE_WORKSPACE.md) |
| **Operation Timeline** | All roles | Where are we in today's rhythm? | [05](./05_OPERATION_TIMELINE.md) |

**Execution home:** Unit Workspace.  
**Command home:** Operations Center.  
**Bridge:** Supervisor Workspace.

---

## Canonical cross-cutting models

| Model | Purpose | Document |
|-------|---------|----------|
| **Operational awareness** | Health states and attention hierarchy | [06](./06_OPERATIONAL_AWARENESS.md) |
| **Operational recovery** | Disruption as normal | [07](./07_OPERATIONAL_RECOVERY.md) |
| **Operational knowledge** | Teaching at point of work | [08](./08_OPERATIONAL_KNOWLEDGE.md) |
| **Operational AI** | Partner, not chatbot | [09](./09_OPERATIONAL_AI.md) |

---

## Canonical terminology

Use these terms in product copy, specs, and reviews unless an industry pack provides a configured alias.

| Term | Meaning | Avoid |
|------|---------|-------|
| **Operation** | Service commitment in a time window | "Module," "workflow" |
| **Site** | One campus/building where operations run | Industry-only facility jargon as platform default |
| **Location** | Place work happens | Treating as secondary to org chart |
| **Operations Center** | Manager situational home | "Dashboard" as generic module dump |
| **Unit Workspace** | Location execution surface | "Unit page" without execution meaning |
| **Readiness** | Can start or continue with acceptable risk | Log completion % alone |
| **Operational health** | Service actually working | Paperwork complete |
| **Recovery** | Adaptation when plan breaks | Hidden variance |
| **Call-down** | Coverage request for operation | Schedule edit only |
| **Issue** | Something wrong threatening work | Ticket number as primary identity |
| **Awareness** | Now and next | Historical report on open |
| **Phase** | Opening, preparation, execution, etc. | Clock time without operational meaning |

**Health states (canonical):** Ready, Not ready, Healthy, At risk, Blocked, Recovered, Escalated.

---

## Canonical user journeys

### Manager morning

1. Open **Operations Center**.
2. Pass **fifteen-second test** — active operation, readiness, top exception.
3. Decide: ready / delegate / recover.
4. Drill to location or staffing only as needed.
5. Loop during service; watch **transition** to next operation.

### Supervisor service window

1. Open **Supervisor Workspace** — location health map.
2. Walk **risk-ordered** locations.
3. Resolve coverage, exceptions, handoffs.
4. Initiate **recovery** when needed; escalate if blocked.
5. Brief transition — what carries forward.

### Employee shift

1. Sign in fast — land at **location**.
2. See **operation + next action**.
3. Complete work; hit milestones.
4. **Report problems** without leaving.
5. See **what changed** when operation shifts.

### Recovery (any role)

1. Disruption occurs — report or detect.
2. Awareness shifts to at risk / blocked.
3. Recovery action — coverage, workaround, escalate.
4. State → recovered — variance visible.
5. Follow-up if needed; operation continues honestly.

### Knowledge moment

1. Worker reaches unfamiliar or risky step.
2. **Contextual knowledge** surfaces — location, equipment, task.
3. Work continues — no binder hunt.
4. Optional: lesson captured on issue close for next time.

---

## Canonical decision hierarchy

When information competes for attention, this order governs:

```
1. Safety and service stop (blocked, escalated)
2. Active operation readiness at locations
3. Uncovered call-downs and staffing gaps
4. Open recovery in progress
5. At-risk locations during execution
6. Compliance due now (gates readiness)
7. Supply and equipment affecting today
8. Handoffs overdue
9. Next operation preparation
10. Everything else (including historical reports, celebrations, admin)
```

Tier 1–4 belong on **Operations Center open**. Tier 10 never masquerades as Tier 1.

---

## Canonical UX principles (certified)

1. **Operations before documentation** — capture during work.
2. **Software where work happens** — location-first execution.
3. **Role- and scope-appropriate** — no overwhelm on floor.
4. **Exceptions before completeness** — show what is wrong first.
5. **Now before later** — active operation dominates.
6. **Locations before modules** — organize by place.
7. **Recovery is normal** — visible, supported, honest.
8. **Knowledge at point of work** — not document library first.
9. **Awareness not reporting** — on open, not yesterday's export.
10. **Health over paperwork** — outcomes over forms.
11. **Plain language** — phases and states humans use.
12. **Industry configures labels** — experience structure is universal.

---

## Conformance checklist

Before shipping a feature, certify:

| # | Question | Must be yes |
|---|----------|-------------|
| 1 | Does it map to an Operation or support one? | ✓ |
| 2 | Which workspace is primary? | Named |
| 3 | Does it respect decision hierarchy? | ✓ |
| 4 | Does it strengthen awareness or add noise? | Strengthen |
| 5 | Does floor experience stay calm? | ✓ |
| 6 | Is recovery supported, not punished? | ✓ |
| 7 | Is knowledge contextual, not orphaned? | ✓ |
| 8 | Would a manager hunt for this on Operations Center? | Should not |
| 9 | Is terminology canonical? | ✓ |
| 10 | Does it work across industries with config, not fork? | ✓ |

Failure on 1, 4, or 8 requires redesign or explicit program amendment.

---

## Program documents (complete)

| # | Document |
|---|----------|
| 00 | [REFERENCE_UX_INDEX](./00_REFERENCE_UX_INDEX.md) |
| 01 | [OPERATIONS_CENTER](./01_OPERATIONS_CENTER.md) |
| 02 | [UNIT_WORKSPACE](./02_UNIT_WORKSPACE.md) |
| 03 | [SUPERVISOR_WORKSPACE](./03_SUPERVISOR_WORKSPACE.md) |
| 04 | [EMPLOYEE_WORKSPACE](./04_EMPLOYEE_WORKSPACE.md) |
| 05 | [OPERATION_TIMELINE](./05_OPERATION_TIMELINE.md) |
| 06 | [OPERATIONAL_AWARENESS](./06_OPERATIONAL_AWARENESS.md) |
| 07 | [OPERATIONAL_RECOVERY](./07_OPERATIONAL_RECOVERY.md) |
| 08 | [OPERATIONAL_KNOWLEDGE](./08_OPERATIONAL_KNOWLEDGE.md) |
| 09 | [OPERATIONAL_AI](./09_OPERATIONAL_AI.md) |
| 10 | This certification |

---

## Governance

- **Reference UX** changes through explicit updates to this program.
- Features that contradict certified experiences require **program amendment**, not silent drift.
- Visual design systems implement these experiences — they do not redefine them.
- Implementation choices are evaluated against conformance — not the reverse.

---

## Certification statement

The Reference UX Program is **complete as the UX source of truth** for the operations platform as of 2026-07-07.

It defines **experience, not implementation**.

All future modules orbit **Operations**, experienced through **Operations Center**, **Unit Workspace**, and **Supervisor Workspace**, in rhythm with **Operation Timeline**, with **awareness**, **recovery**, **knowledge**, and **AI** as operational partners — across every industry the platform serves.

---

## Related governance documents

| Document | Role |
|----------|------|
| [PRODUCT_CONSTITUTION.md](../platform-vision/PRODUCT_CONSTITUTION.md) | Product principles |
| [OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) | Operational concepts |
| [ARCHITECTURE_DECISION_LOG.md](../platform-vision/ARCHITECTURE_DECISION_LOG.md) | Technical decisions |
| [docs/architecture-review/](../architecture-review/) | Current implementation state |
