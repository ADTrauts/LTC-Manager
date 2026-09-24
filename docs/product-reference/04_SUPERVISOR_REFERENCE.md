# Supervisor Reference

**Status:** Product reference — supervisor experience  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

---

## User goals

- Keep **10–20 locations** healthy during one operation.
- **Walk in risk order**, not habit order.
- **Close coverage gaps** before service fails.
- **Recover fast** without radio-only coordination.
- **Hand off** to manager only when decision exceeds authority.

---

## Default home

Supervisor lands **Today's Work** with **Walk list** prominent — not Operations Center.

Operations Center is **2–4 visits per morning**, not continuous residence.

---

## Managing many locations: product model

### Walk list

Ordered list of locations in supervisor's cluster for **active operation**.

Each row:

- Location name
- Readiness / health chip
- One reason if not healthy
- **Last visited** time (optional)
- Tap → Unit Workspace

**Sort:** Risk default. Manual pin allowed ("I'm staying at 4A").

### Coverage map (alternate view)

Grid: locations × required roles — gaps highlighted.

Toggle from Walk list — same data, different cognition for staffing crises.

### Exception feed

Chronological **since you last looked** — new failures, call-downs, handoff delays.

Feeds walk list re-sort.

---

## Operational rhythm (breakfast example)

| Time | Supervisor motion | Product surface |
|------|-------------------|-----------------|
| 5:30 | Arrive, scan open call-downs | Today's Work → Coverage |
| 5:35–6:15 | Walk high-risk locations | Walk list → Unit Workspace per stop |
| 5:50 | Confirm kitchen → porter handoff | Today's Work → Handoffs |
| 6:15 | Final pass blocked/in progress | Walk list |
| 6:30 | Execution — rotate trouble spots | Walk list + exception feed |
| 6:30–8:45 | Visit 4–8 locations per hour | Unit Workspace brief visits |
| 8:45 | Transition briefing | Today's Work → carry-forward note |
| 9:00 | Hand to manager or next shift | Shift transition (AI optional) |

---

## How often return to Operations Center?

| Trigger | Go to Center |
|---------|--------------|
| Escalation needed | Yes — manager decision |
| Site-wide issue (plant, delivery) | Yes — see full picture |
| Routine walk | No — Walk list sufficient |
| Manager asks "status?" | Optional — or send snapshot |
| End of operation review | Yes — 2 min with manager |

**Typical:** 2–4 Center visits in 3-hour breakfast window.

---

## Unit Workspace visits (supervisor)

Visits are **short** — 3–8 minutes.

Supervisor flow:

1. Tap location on walk list
2. Scan Layer 1 orientation — matches expectation?
3. If gap — fix: reassign, start recovery, complete check themselves
4. Mark **visited** (implicit on open or explicit button)
5. Back to walk list — next risk location

Supervisor does **not** live inside one Unit Workspace unless fixing.

---

## Decisions supervisor makes in product

| Decision | Where |
|----------|-------|
| Who covers call-down | Today's Work → Coverage |
| Accept workaround | Unit Workspace → acknowledge recovery |
| Escalate to manager | Any → Escalate (carries context) |
| Defer PM / non-critical | Issue → defer with reason |
| Handoff confirmed | Handoffs panel |
| Quality fail — hold service | Unit Workspace → block milestone + notify manager |

---

## Interaction philosophy

- **Interrupt-friendly** — walk list restores in one glance
- **Visited state** — supervisor knows what they haven't seen
- **Broadcast to locations** (manager-approved) — rare, supervisor-initiated note to cluster
- **No admin** — supervisor does not configure templates
- **Mobile-first** — same IA as tablet phone form factor

---

## Relationship to manager

| Manager | Supervisor |
|---------|------------|
| Operations Center home | Walk list home |
| Site-wide prioritize | Cluster execute |
| Escalation receiver | Escalation initiator |
| Assigns floaters cross-cluster | Assigns within cluster |

Shared picture — supervisor exceptions appear on Center within seconds.

---

## AI involvement

- **Walk order suggestion** — "Visit 4A, then kitchen handoff, then 3B"
- **Since you were at 3B** — delta summary on walk list open
- Not continuous chat

---

## Related documents

- [02_OPERATIONS_CENTER_REFERENCE.md](./02_OPERATIONS_CENTER_REFERENCE.md)
- [03_UNIT_WORKSPACE_REFERENCE.md](./03_UNIT_WORKSPACE_REFERENCE.md)
- [06_OPERATION_FLOW_REFERENCE.md](./06_OPERATION_FLOW_REFERENCE.md)
