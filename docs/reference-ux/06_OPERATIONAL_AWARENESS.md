# Operational Awareness

**Audience:** Managers, supervisors — all who must see the whole  
**Status:** Canonical awareness model  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

---

## Purpose

**Operational awareness** is knowing what is happening **now** — accurately, quickly, shared — so leaders act before problems become crises.

Awareness is **not reporting**. Reporting looks backward. Awareness looks **forward and present**.

Managers should **never hunt** for information the platform already has.

---

## User mindset

A manager with awareness feels **in control without micromanaging**.

A manager without awareness feels **behind** — walking to discover, radio-dependent, surprised by nursing, surprised by survey.

The platform replaces hunting with **orientation**.

---

## Awareness vs reporting

| Operational awareness | Reporting |
|----------------------|-----------|
| Now and next | Yesterday and last month |
| Exceptions first | Completeness first |
| Location-specific | Often site-aggregated |
| Drives immediate action | Drives review meetings |
| Updates continuously | Generated periodically |
| "4A is blocked" | "92% log completion" |

Reporting has a place — **after** operations, for trends and accountability. It must not be the **opening experience**.

---

## Canonical health states

Every location, operation segment, and site summary should map to **plain-language states** leaders already use.

### Ready

**Meaning:** This can start or continue with acceptable risk.

**Experience:** Calm confirmation — visible but not shouting when everything is ready.

**Not:** Paperwork 100% while floor is wrong.

---

### Not ready

**Meaning:** Preparation incomplete — service should not start here yet.

**Experience:** Clear gap list — what is missing; who typically resolves it.

**Example:** Opening checks incomplete; no staff assigned.

---

### Healthy

**Meaning:** Operation is **achieving its commitment** — service working, no active threat.

**Experience:** Green path — milestones met, no Tier 1 exceptions.

**Distinction from Ready:** Ready is **before** start. Healthy is **during** execution going well.

---

### At risk

**Meaning:** Service still possible but **degrading** — time, staffing, equipment, or supply pressure.

**Experience:** Yellow attention — "watch 4A — warmer intermittent, coverage thin."

**Requires:** Supervisor or manager glance; may not need immediate stop.

---

### Blocked

**Meaning:** Cannot meet commitment without **change** — recovery or escalation required.

**Experience:** Red stop — reason in one line; suggested recovery paths if known.

**Example:** Failed cooler temp; no cook on station; isolation hold without tray protocol.

---

### Recovered

**Meaning:** Was at risk or blocked; **workaround or fix in place** — operation continuing with documented variance.

**Experience:** Visible recovery — not erased to green silently.

**Example:** "Running simplified menu on 3B until 8:30 — plant en route."

---

### Escalated

**Meaning:** Floor or supervisor raised beyond their authority — **manager decision pending or in progress**.

**Experience:** Distinct from blocked — ownership at manager level; timer visible.

**Example:** "Stop service on 2 North pending director approval."

---

## State relationships

```
Not ready → (preparation completes) → Ready
Ready → (execution starts) → Healthy
Healthy → (variance) → At risk
At risk → (recovery succeeds) → Recovered → Healthy
At risk → (recovery fails) → Blocked
Blocked → (recovery / escalation) → Recovered or Escalated
Escalated → (decision) → Recovered or operation stopped
```

States are **honest**. Recovering is not failure. Hidden failure is.

---

## Information hierarchy for awareness

### Level 1 — Site pulse (Operations Center)

One sentence: *"Lunch service: at risk — 2 locations need attention."*

### Level 2 — Location grid

Each location: state + one reason if not healthy/ready.

### Level 3 — Drill-down

Open work, people, issues, recovery history — only when acting.

**Never invert** — Level 3 on open is hunting.

---

## What awareness combines

Awareness is **synthetic** — it merges signals managers otherwise assemble mentally:

| Signal | Awareness contribution |
|--------|------------------------|
| Staffing coverage | Gap → not ready / at risk |
| Readiness checks | Incomplete → not ready |
| Milestones | Missing → at risk during execution |
| Open issues | Severity → blocked / at risk |
| Supply shorts | Operational impact → at risk |
| Call-downs | Uncovered → blocked / at risk |
| Compliance failures | Safety gate → blocked |
| Handoff delays | Downstream → at risk |
| Recovery in progress | State → recovered |

---

## Temporal awareness

Awareness is **time-bound**:

- **Stale awareness is false confidence.** Breakfast health does not imply lunch health.
- **Phase-aware:** preparation emphasizes not ready; execution emphasizes healthy/at risk.
- **Since last look:** managers benefit from **what changed** — new blocker, new recovery.

---

## Shared awareness

Two leaders with different pictures **make conflicting decisions**.

The platform is the **shared picture** — supervisor and manager see compatible states, scoped by role.

- Supervisor: my locations.
- Manager: whole site.
- Employee: this location — not full site anxiety.

---

## UX principles (Operational Awareness)

1. **States in plain language** — not codes, not percentages alone.
2. **One reason when wrong** — not a dump of all failures.
3. **Exceptions dominate** — ready locations recede visually.
4. **Recovery is visible** — not binary green after yellow.
5. **Awareness decays** — show freshness; highlight change.
6. **Reporting is separate door** — not the front door.
7. **Health over paperwork** — failed operation with complete logs still shows unhealthy.

---

## Cross-industry states (same words, different content)

| Industry | "Blocked" might mean |
|----------|---------------------|
| LTC | Isolation tray protocol not ready |
| Hospital | Nourishment room access restricted |
| K-12 | Line cooler failed |
| University | Retail outage during rush |
| Corporate | Market refrigerator down |
| EVS | Terminal clean pending — room unusable |
| Plant | Critical asset down for kitchen |
| Laundry | Distribution deadline missed |
| Hospitality | Event kitchen equipment failure |

---

## Anti-patterns

- Dashboard of all-green metrics while floor struggles.
- Awareness requiring five clicks across modules.
- States that only experts understand.
- Hiding recovered variance — tomorrow's repeat surprise.
- Equating awareness with exported PDF.

---

## Related documents

- [01_OPERATIONS_CENTER.md](./01_OPERATIONS_CENTER.md) — primary awareness surface
- [03_SUPERVISOR_WORKSPACE.md](./03_SUPERVISOR_WORKSPACE.md) — walk-list awareness
- [07_OPERATIONAL_RECOVERY.md](./07_OPERATIONAL_RECOVERY.md) — recovered state
- [09_OPERATIONAL_AI.md](./09_OPERATIONAL_AI.md) — AI summarizes awareness
