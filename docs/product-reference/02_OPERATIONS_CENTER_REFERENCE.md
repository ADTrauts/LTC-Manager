# Operations Center Reference

**Status:** Product reference — manager experience  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

---

## User goals

- Know if the site can deliver the **next service commitment**.
- Decide **where to go** or **whom to send** first.
- See **what changed** since last check.
- Initiate or confirm **recovery** without losing the thread.
- **Delegate** with shared facts, not verbal catch-up.

---

## Entry

Manager signs in on desktop or mobile → lands on **Operations Center** (Food Service mode if dietary manager).

Optional: **Morning Brief** card from AI (expandable, dismissible) — three sentences max before site pulse.

---

## Minute-by-minute: manager morning (breakfast service)

*Site: multi-location food service. Breakfast window 6:30–9:00. Manager arrives 5:45.*

### 5:45 — Open

**Sees (15-second test):**

| Element | Content |
|---------|---------|
| Operation header | **Breakfast service** — Preparation — starts 6:30 |
| Site pulse | **At risk — 2 locations need attention** |
| Top exception | **4A Servery — blocked** — failed sanitizer check |
| Location summary | 14 ready · 2 in progress · 2 blocked |
| Call-downs | 1 open — 2 North server, not covered |

**Decisions:** Do not leave screen yet. Read top exception and call-down.

**Actions:** Tap 4A blocked row → drill.

**Does not see prominently:** Birthdays, monthly reports, admin shortcuts.

---

### 5:47 — Drill to 4A

**Sees:** Unit Workspace context panel (drawer or page) — still inside Operations Center flow.

- Location: 4A Servery
- Blocker: Sanitizer check failed — retry or escalate
- Staff: Maria on station; supervisor Tom assigned cluster
- Open work: 2 checks remaining

**Decisions:** Can Maria retry now? Is Tom en route?

**Actions:** Tap "Notify supervisor" or message Tom (in-product note, not chat app). **Back to Center** — context preserved.

**Leaves screen?** No — drawer closes, Center visible.

---

### 5:52 — Center loop

**Sees:** Call-down still open. 3B now **in progress** (was not ready).

**Decisions:** Assign floater to 2 North or accept risk?

**Actions:** Open **Today's Work → Coverage** → create coverage assignment or confirm override. Return to Center — call-down shows "covering — Maria en route."

**Drill:** Coverage (full page acceptable for assignment).

---

### 6:05 — Delegation

**Sees:** Site pulse **At risk — 1 blocked** (4A if still failing). 12 ready.

**Decisions:** Walk self or trust supervisor?

**Actions:** Glance location grid — sort by risk. Send Tom to 4A via supervisor path (notification). Manager stays Center unless blocked count zero and gut check.

**Leaves screen?** Briefly if walking floor with mobile — mobile Center follows.

---

### 6:20 — Pre-service crunch

**Sees:** Operation phase still Preparation. Countdown **10 min to service**.

| Signal | State |
|--------|-------|
| 4A | Recovered — workaround documented |
| 2 North | Ready — coverage confirmed |
| Central kitchen | Handoff to porters **in flight** |

**Decisions:** Hold any servery?

**Actions:** None if no blocked. Watch handoff row — if not confirmed by 6:28, drill kitchen handoff.

---

### 6:30 — Execution begins

**Sees:** Header **Breakfast service — Execution**. Site pulse **Healthy — 1 at risk**.

- Milestone grid: serveries **meal ready** / **started** states
- 3B at risk: warmer workaround active

**Decisions:** Escalate 3B or accept degraded?

**Actions:** Tap 3B → see recovery in progress. If acceptable, acknowledge at-risk. If not, escalate to plant.

**Leaves screen?** Every 20–30 min during execution — quick Center glance. Between glances, supervisor owns floor.

---

### 7:15 — Mid-service

**Sees:** Most locations **Healthy**. New exception: supply short domes at 5 West.

**Decisions:** Substitute procedure or run to stores?

**Actions:** From exception → **Report recovery** — substitute in use. Issue visible; readiness at-risk not blocked.

**Drill:** Issue detail — not separate repairs module hunt.

---

### 8:45 — Transition preview

**Sees:** Footer or section **What's next: Lunch service — Preparation starts 8:30** (overlap shown honestly).

- Breakfast **closing** checklist count open at 3 locations
- Lunch prep readiness beginning on kitchen row

**Decisions:** Reassign afternoon staff now or at 9:00?

**Actions:** Open Today's Work → afternoon coverage preview. Optional shift change note.

---

### 9:00 — Leave Center?

**Manager may leave** when breakfast **closed** or handed to supervisor — site pulse shows **Breakfast complete — Lunch preparation**.

Center remains **anchor** — manager returns at lunch crunch. Between operations, Review zone acceptable for 10-min weekly pattern check — not default open.

---

## Information architecture (Operations Center)

### Fixed top: Operation context bar

- Active operation name, phase, time remaining/elapsed
- Mode switcher (if multi-department manager)
- Site name

### Primary panel: Site pulse

One sentence readiness + exception count.

### Second panel: Exception stack (Tier 1)

Ordered by decision hierarchy:

1. Blocked locations
2. Open uncovered call-downs
3. Critical issues
4. Failed compliance gates
5. Today's declared priority

Each row: **what · where · one reason · suggested action type**.

### Third panel: Location grid

All locations for active operation — readiness chip, one reason if not green.

Sort default: **risk** (blocked first). Toggle: alphabetical, department.

### Fourth panel: Milestones (during execution)

Meal ready / started or operation-specific milestones.

### Fifth panel: What's next

Next operation, transition items carried forward.

### Persistent: Locations rail

Quick enter Unit Workspace without losing Center.

---

## Decision hierarchy (on this screen)

```
1. Blocked → act or escalate now
2. Uncovered call-down → assign now
3. At risk with time pressure → supervisor or self
4. Handoff overdue → coordinate departments
5. In progress / healthy → monitor only
6. What's next → plan, don't panic
```

---

## When manager leaves Operations Center

| Destination | Why | Return trigger |
|-------------|-----|----------------|
| Unit Workspace | See floor truth | Back after action or 5 min |
| Today's Work → Coverage | Assign people | Back after save |
| Today's Work → Handoffs | Coordinate | Back after confirm |
| Issue detail | Plant follow-up | Back after note |
| Administration | Rare mid-service | Avoid during execution |
| Review | After operation closes | Scheduled, not impulse |

**Rule:** Leaving Center is **purposeful**. Back navigation restores scroll position and operation filter.

---

## Interaction philosophy

- **Tap exception → context**, not module.
- **Acknowledge** recovery decisions — manager ownership visible.
- **No refresh hunting** — live on open; stale indicator if sync delayed.
- **One primary action per exception row** — assign, drill, escalate, dismiss with reason.

---

## AI involvement (manager)

- **Morning Brief** on open (optional).
- **What changed since yesterday** on demand.
- **Walk order suggestion** when manager asks "where first?"
- AI never blocks Center — always secondary to site pulse.

See [08_AI_EXPERIENCE_REFERENCE.md](./08_AI_EXPERIENCE_REFERENCE.md).

---

## Related documents

- [01_NAVIGATION_SYSTEM.md](./01_NAVIGATION_SYSTEM.md)
- [06_OPERATION_FLOW_REFERENCE.md](./06_OPERATION_FLOW_REFERENCE.md)
- [reference-ux/01_OPERATIONS_CENTER.md](../reference-ux/01_OPERATIONS_CENTER.md)
