# Supervisor Workspace

**Primary audience:** Shift supervisors, leads, floaters with multi-location responsibility  
**Status:** Canonical supervisor experience  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

---

## User mindset

A supervisor **does not live in one room**. They live **between** rooms — walking, listening, fixing, redirecting.

Their mental model is continuous motion:

- Is 4A ready while I'm standing in 3B?
- Did the call-down get covered?
- Who needs me next?

They are neither the site-wide manager nor the single-location worker. They are the **connective tissue** of the operation — coverage, readiness, exceptions, recovery, quality, handoffs.

The supervisor experience must support **movement and interruption** without losing the thread.

---

## Goals

| Goal | Success feels like |
|------|-------------------|
| **Peripheral awareness** | I sense trouble at any of my locations without checking each one |
| **Efficient routing** | I know where to walk next |
| **Fast recovery** | I can initiate or complete coverage and workarounds on the move |
| **Quality assurance** | I catch drift before it becomes failure |
| **Clean handoffs** | Upstream and downstream know what changed |

---

## How supervisors differ from managers and employees

| Dimension | Manager | Supervisor | Employee |
|-----------|---------|------------|----------|
| **Scope** | Whole site, multiple operations | Cluster of locations, active operation | One location |
| **Primary surface** | Operations Center | Supervisor Workspace | Unit Workspace |
| **Time horizon** | Now + next + today | Now + next hour | Next few tasks |
| **Decision type** | Prioritize, delegate, escalate | Cover, fix, redirect, confirm | Execute, report |
| **Movement** | Mostly overview; selective drill | Constant movement between locations | Mostly stationary |

---

## Focus areas

### Coverage

Supervisors own **whether each location has the right people** for the active operation.

- See gaps before service starts — not when the line stalls.
- Initiate call-down response: who is coming, ETA, temporary workaround.
- Confirm floaters and overrides are **real**, not assumed.

**Experience:** Coverage is a **live map of people × locations** for this operation — gaps highlighted, not a full HR roster.

### Readiness

Supervisors validate readiness **by walking** — the platform tells them **where not to assume**.

- Locations degraded or blocked rise to the top.
- Readiness reasons are specific: no server, failed temp, warmer down.

**Experience:** A **walk list** ordered by risk — "check these first."

### Exceptions

Supervisors are the **first responder** to variance.

- Failed check, late porter, missing supply, unexpected isolation.
- Exceptions attach to location and operation — supervisor sees new ones since last round.

**Experience:** Exception feed filtered to **my locations** and **this operation** — newest and highest impact first.

### Recovery

Supervisors **execute** recovery managers authorize.

- Pull someone from another station, run a simplified service, hold a servery until plant responds.
- Recovery actions are quick to record — reason captured, not buried.

**Experience:** Recovery feels **supported**, not like admitting failure.

### Quality

Supervisors catch **drift** during execution — temps sliding, shortcuts forming, handoffs slipping.

- In-service checks due now at each location.
- Patterns: "3B always late on sanitizer refill."

**Experience:** Quality prompts appear **in the walk rhythm**, not only at open.

### Handoffs

Supervisors sit at **department joints** — kitchen to porter, porter to servery, EVS to dietary.

- See what was promised vs received.
- Mark handoff complete or flag delay.

**Experience:** Handoffs are **visible commitments** between parties — not verbal-only.

### Operational health

Supervisors answer: **Is this operation going well at my locations?**

- Not "are logs done?" but "is service actually working?"
- Health combines readiness, exceptions, coverage, and milestones.

**Experience:** Per-location health in one glance — healthy, at risk, blocked.

---

## Information hierarchy

### Always available (glanceable)

- Active operation and phase
- My locations — health summary each
- Top exception requiring attention
- Open coverage gaps

### On movement (per location visit)

- Unit Workspace depth for that location
- Open work remaining there
- Issues and equipment status there

### On demand (less frequent)

- Staffing grid for reassignment
- Issue detail for plant follow-up
- Brief notes for shift change

---

## A supervisor's day (operational flow)

### Before service — Preparation phase

1. Open supervisor view → scan location health for upcoming operation.
2. Walk list → visit degraded locations first.
3. Resolve coverage gaps → confirm call-downs or reassign.
4. Validate critical readiness → escalate blockers to manager.

### During service — Execution phase

1. Rotate through locations → peripheral awareness between visits.
2. Respond to new exceptions → recover or escalate.
3. Confirm milestones — service started, handoffs received.
4. Monitor quality checks due during service.

### Between operations — Transition phase

1. See what closed and what carried forward.
2. Brief next shift or next phase — open issues, coverage changes.
3. Preload next operation readiness at key locations.

### Throughout — Interruption tolerance

Supervisors are **interrupted constantly**. The workspace must:

- Restore context in one glance after interruption.
- Preserve "where was I?" — last location, open exception.
- Never punish quick entry — pin, short forms, defaults.

---

## Decision making

| Question | Supervisor experience |
|----------|----------------------|
| Where should I go next? | Walk list ranked by risk |
| Can this location start? | Readiness + blockers here |
| Who can cover? | Coverage map + available floaters |
| Is recovery working? | Recovery status on open exceptions |
| Do I escalate? | Clear threshold — safety, service stop, manager policy |

Supervisors **act** more than they **analyze**. The workspace favors **action paths** over dashboards.

---

## UX principles (Supervisor Workspace)

1. **Mobility first** — designed for walking, one hand, interruption.
2. **My locations only** — not the whole site unless role expands.
3. **Exceptions drive the walk** — not a fixed route every day.
4. **Bridge center and floor** — escalate up with context; execute down with clarity.
5. **Recovery in the flow** — not a separate "override module."
6. **Handoffs explicit** — verbal tradition backed by visible state.
7. **Health over paperwork** — surface failed service, not only failed forms.

---

## Cross-industry applicability

| Industry | Supervisor spans… | Typical walk |
|----------|-------------------|--------------|
| LTC | Multiple serveries + kitchen tie-in | Open breakfast serveries |
| Hospital | Floor service points + nourishment | Patient dining window |
| K-12 | Lines + satellite cafés | Lunch rush coverage |
| University | Retail + dining halls | Peak period rotation |
| Corporate | Floors / buildings | Peak lunch sites |
| EVS | Zone cluster | Pre-round readiness |
| Plant | Critical assets for today's ops | Morning reliability check |
| Laundry | Staging + distribution | Turn window handoff |
| Hospitality | Event + outlet cluster | Pre-service walk |

---

## Anti-patterns

- Supervisor view identical to manager Operations Center.
- Requiring desktop-only workflows for coverage changes.
- Losing context after each location switch.
- Full-site noise when supervisor owns four locations.
- Hiding handoff state — forcing radio-only coordination.

---

## Related documents

- [01_OPERATIONS_CENTER.md](./01_OPERATIONS_CENTER.md) — escalation target
- [02_UNIT_WORKSPACE.md](./02_UNIT_WORKSPACE.md) — execution depth per location
- [07_OPERATIONAL_RECOVERY.md](./07_OPERATIONAL_RECOVERY.md) — recovery patterns
- [06_OPERATIONAL_AWARENESS.md](./06_OPERATIONAL_AWARENESS.md) — health states
