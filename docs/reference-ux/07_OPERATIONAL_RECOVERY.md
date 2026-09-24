# Operational Recovery

**Audience:** All roles — recovery is everyone's experience  
**Status:** Canonical recovery experience  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

---

## Purpose

**Recovery** is how operations continue when the plan breaks.

Disruption is **expected**. Software that treats variance as error trains organizations to hide problems. Software that treats recovery as **first-class** trains organizations to adapt in the open.

Recovery must feel **normal, supported, and visible** — not shameful, buried, or bureaucratic.

---

## User mindset

When something goes wrong, people feel:

- **Stress** — service clock still running.
- **Urgency** — decide now.
- **Fear** — blame, audit, customer impact.

The recovery experience must reduce stress by **making the next step obvious** and **recording enough without slowing action**.

---

## Disruptions the platform must support

| Disruption | Floor experience need |
|------------|----------------------|
| **Call-offs / staffing shortages** | Request coverage; see if anyone is coming |
| **Equipment failures** | Report fast; know if service can continue |
| **Late deliveries** | Flag shortage; reduce scope or substitute |
| **Unexpected surveys** | Elevate cleanliness/compliance priority today |
| **Customer / resident changes** | Surface count, diet, isolation changes affecting operation |
| **Supply shortages** | Report at point of use; manager sees impact |
| **Cross coverage** | Pull floater; temporary assignment visible to all |
| **Interdepartment delays** | Handoff late — downstream adapts |
| **Facility events** | Drill, outage, construction — operation adjusts |

Each disruption follows: **detect → respond → record → resolve or carry forward**.

---

## Recovery as normal workflow

Recovery is not an "exception module." It appears:

- On Operations Center when **open recovery** exists.
- On Unit Workspace when **this location** is recovering.
- On Supervisor Workspace as **active response**.
- In awareness states: **at risk → recovered → healthy**.

Completing recovery is as **satisfying** as completing preparation — visible closure.

---

## Recovery actions (experiential)

| Action | Who typically acts | Experience |
|--------|-------------------|------------|
| **Request coverage** | Supervisor, manager | Short form — location, operation, urgency |
| **Assign cross coverage** | Supervisor | Pick person; both locations see change |
| **Reduce scope** | Manager | Simplified service documented; locations notified |
| **Workaround equipment** | Supervisor, plant | "Using backup warmer" — time-bounded |
| **Escalate** | Supervisor → manager | Clear handoff of decision need |
| **Delay non-critical work** | Manager | Defer PM, optional checks — explicit |
| **Create follow-up** | Any | Issue for plant, supply order — linked to operation |
| **Communicate variance** | Manager | Nursing, diet office, customers — noted on operation |
| **Accept partial success** | Manager | Close with honest variance — not fake green |

---

## Call-offs and coverage

**Experience principles:**

- Call-down is **operational**, not HR-first on the floor.
- Uncovered call-down **stays visible** until someone confirms coverage.
- Coverage change **updates** what employees see at affected locations.
- Reason captured in **one line** — sick, family, no-show.

**Manager sees:** open call-downs with affected locations.  
**Supervisor sees:** who can float, what gap remains.  
**Employee sees:** "you are covering 4A for breakfast" — clear, not surprising.

---

## Equipment failures

**Experience principles:**

- Report from Unit Workspace in **under thirty seconds** of intent.
- Severity obvious — **can we still serve?**
- Open issue visible at location until resolved.
- Plant response status visible to **who is waiting** — not black hole.

**Recovery path:** workaround → repair in progress → resolved → remove workaround state.

---

## Late deliveries and supply shortages

**Experience principles:**

- Shortage reported where noticed — servery, store, line.
- Manager sees **which operations are impacted today**.
- Substitute or reduce scope is a **recovery decision**, recorded.
- Shortage without action stays **at risk**.

---

## Unexpected surveys and audits

**Experience principles:**

- Priority flag on today's operation — reorders supervisor walk list.
- Additional checks surface **without** hunting templates.
- Recovery is **intensified preparation** — not panic hidden from system.

---

## Resident / patient / customer changes

**Experience principles:**

- Changes that affect service appear on **relevant locations** — isolation, headcount, allergen.
- "What changed" on employee workspace — not only in clinical system.
- Recovery may mean **hold service** until protocol confirmed — blocked state honest.

---

## Cross coverage

**Experience principles:**

- Temporary assignment visible to **both** locations involved.
- Original location shows **degraded** if uncovered.
- End of coverage returns to plan — or prompts schedule correction.

---

## Resilience principles (UX)

1. **Never punish reporting** — fastest reporter is not the problem.
2. **Recovery visible** — at risk and recovered are first-class states.
3. **Minimal capture during crisis** — detail can follow.
4. **Clear ownership** — who is fixing this?
5. **Time bounds** — workarounds expire or review.
6. **Carry forward** — unresolved recovery transitions to next operation visibly.
7. **Learn later** — review attaches to operation, not blame archive.

---

## Recovery flow (conceptual)

```
Disruption occurs
    → Someone reports or system detects (missed staff, failed check)
    → Awareness state shifts (at risk / blocked)
    → Recovery action initiated (coverage, workaround, escalate)
    → State → recovered (variance documented)
    → Follow-up work if needed (plant, supply)
    → Operation continues or closes with honest outcome
```

---

## Role experiences in recovery

| Role | Recovery experience |
|------|---------------------|
| **Employee** | Report problem easily; see workaround; know if waiting |
| **Supervisor** | Initiate coverage; execute workaround; escalate with context |
| **Manager** | See open recoveries; approve scope reduction; clear escalations |
| **Support (plant, diet office)** | Receive issue with location + operation impact |

---

## Cross-industry examples

| Industry | Disruption | Recovery experience |
|----------|------------|----------------------|
| LTC | Cook call-off | Float from retail; simplified menu |
| Hospital | Elevator down | Tray reroute; delayed floor |
| K-12 | Milk delivery short | Substitute beverage; note compliance |
| University | Rush staffing gap | Cross-station pull |
| Corporate | Cooler failure | Close market; redirect |
| EVS | Isolation surge | Reprioritize zone order |
| Plant | Chiller alarm | Kitchen hold until cleared |
| Laundry | Dryer down | Redistribute turn priority |
| Hospitality | VIP late change | Menu scope adjust |

---

## Anti-patterns

- Recovery hidden until everything green.
- Requiring manager password to report warmer down.
- Call-down buried in schedule editor.
- Blame-oriented language on reports.
- Workarounds invisible — next shift surprised.
- Recovery that only exists in radio culture, not system.

---

## Related documents

- [06_OPERATIONAL_AWARENESS.md](./06_OPERATIONAL_AWARENESS.md) — recovered state
- [01_OPERATIONS_CENTER.md](./01_OPERATIONS_CENTER.md) — open recoveries
- [04_EMPLOYEE_WORKSPACE.md](./04_EMPLOYEE_WORKSPACE.md) — reporting problems
- [OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) — recovery theory
