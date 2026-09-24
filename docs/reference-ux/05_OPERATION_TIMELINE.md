# Operation Timeline

**Audience:** All roles — shared mental model of operational time  
**Status:** Canonical rhythm reference  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

---

## Purpose

Physical operations run on **rhythm**, not on calendar modules.

The platform must understand **operational time** — phases that recur every day, every week, every season — and shape experience around **where the site is in that rhythm**.

This document is **not dietary-specific**. Meal periods are one example. The same phases apply to EVS rounds, plant PM windows, laundry turns, and hospitality service.

---

## User mindset

Workers and managers do not experience "the logs module at 6:45."

They experience:

- "Opening."
- "We're almost ready."
- "Service is live."
- "We're breaking down."
- "Lunch prep started."

The timeline is how people **talk about the day**. The platform should talk the same way.

---

## Canonical phases

Every operation moves through phases. Not all operations emphasize every phase equally.

```
Opening → Preparation → Execution → Support → Recovery → Transition → Closing
```

Phases may **overlap** — lunch preparation begins while breakfast executes. The platform shows **concurrent operations** without collapsing them into confusion.

---

### Opening

**What it means:** The site or location becomes **operational for the day** — systems on, access clear, baseline established.

**Human cues:** Lights on, equipment started, first staff arriving, initial walk-through.

**Platform experience:**

- Emphasize **what must exist before any operation can prepare** — critical equipment, access, announcements.
- Low detail at site level; increases at location level as workers arrive.

**Industries:** Kitchen hoods on, EVS unlock schedules, plant morning checks, laundry first load.

---

### Preparation

**What it means:** Getting **ready to fulfill the service commitment** before the customer-facing moment.

**Human cues:** Prep lists, staging carts, pre-service checks, staffing arriving at stations.

**Platform experience:**

- **Readiness work** dominates Unit Workspace.
- Supervisors see **walk lists** — locations not yet ready.
- Managers see **countdown** to service window and blocked locations.

**Industries:** Line setup, zone pre-clean, asset pre-check, stock staging.

---

### Execution

**What it means:** The **service commitment is live** — food served, rooms cleaned to standard, laundry distributed, event running.

**Human cues:** Lines moving, trays flying, rounds in progress, guests being served.

**Platform experience:**

- **Milestones** prominent — started, in service, on track.
- In-service checks surface **during** execution, not only before.
- Exceptions and recovery **interleave** — not deferred to closing.

**Industries:** Meal service, patient tray pass, lunch rush, banquet service, EVS concurrent clean.

---

### Support

**What it means:** **Parallel work** that keeps execution alive — plant, supply, coordination, clinical liaison.

**Human cues:** Mechanic en route, diet office adjusting counts, runner fetching domes.

**Platform experience:**

- Support items visible to **who needs to know** — manager sees plant ETA; floor sees "warmer workaround active."
- Not a separate module — **woven into operation status**.

**Industries:** Engineering response, catering coordination, nursing diet changes, chemical delivery.

---

### Recovery

**What it means:** **Adaptation** when the plan breaks — still inside the operation window.

**Human cues:** "We're short," "run simplified," "hold 4A," "borrow from 2."

**Platform experience:**

- Recovery state on locations and operations — **recovering**, not hidden until green.
- See [07_OPERATIONAL_RECOVERY.md](./07_OPERATIONAL_RECOVERY.md).

**Industries:** Universal — every vertical.

---

### Transition

**What it means:** **Closing one operation window** and **handing off** to the next — information and physical state carry forward.

**Human cues:** Breakfast breakdown, lunch prep overlap, shift change huddle.

**Platform experience:**

- Explicit **what ended / what is open / what starts next**.
- Highest-risk UX moment — platform must not reset context to zero.

**Industries:** Meal to meal, round to round, shift to shift, event to reset.

---

### Closing

**What it means:** **Formal end** of an operation at a location or site — shutdown checks, documentation complete, space left correct.

**Human cues:** Breakdown complete, logs done, dining room locked, equipment off.

**Platform experience:**

- Close-out work list — short, definite.
- Open items **carry** to next operation or next day with visibility.

**Industries:** Servery shutdown, post-service sanitation, end-of-day EVS status, laundry day close.

---

## Recurring rhythms (beyond the day)

### Daily rhythm

Operations repeat: opening cycle, primary service windows, afternoon cycle, close.

Platform **defaults to today** — operational clock, not generic calendar.

### Weekly rhythm

Different menus, PM schedules, deep cleans, delivery patterns.

Platform surfaces **this week's differences** on relevant days — not buried in settings.

### Event rhythm

Surveys, catering, holidays, move-ins, construction.

Platform elevates **event operations** on timeline — they reorder attention.

### Seasonal rhythm

Industry packs may define — flu season isolation protocols, summer camp dining, commencement week.

---

## Department movement through the day

Departments **enter and exit** the same timeline at different points.

| Department | Typical timeline involvement |
|------------|------------------------------|
| Food service | Preparation through closing each service window |
| EVS | Pre-access cleaning → concurrent support → post-service reset |
| Plant | Opening checks → on-call support → scheduled PM windows |
| Laundry | Pickup windows → processing → distribution deadlines |
| Housekeeping | Zone rounds aligned to property operations |
| Catering | Event-specific Preparation → Execution → Closing |

**Handoffs** occur at phase boundaries — platform makes **who owes what to whom** visible at transition.

---

## How experience changes by phase

| Phase | Operations Center emphasis | Unit Workspace emphasis |
|-------|---------------------------|-------------------------|
| Opening | Site coming alive, critical blockers | Baseline checks |
| Preparation | Locations not ready, coverage gaps | Readiness work, next milestones |
| Execution | At-risk locations, open recovery | In-service work, milestones |
| Support | Cross-department open items | Workarounds, waiting states |
| Recovery | Unresolved recoveries | What changed from plan |
| Transition | What carries forward | Close-out + next operation preview |
| Closing | Open items for tomorrow | Shutdown checklist |

---

## UX principles (Operation Timeline)

1. **Name phases in human language** — workers recognize their shift.
2. **Show concurrent operations** — breakfast and lunch prep coexist honestly.
3. **Time remaining matters** — "service in 12 minutes" not only timestamps.
4. **Phase drives defaults** — what is prominent changes automatically.
5. **Transitions are explicit** — never silent resets.
6. **Industry configures windows** — same phases, different labels and schedules.
7. **Yesterday is not today** — timeline always anchors to operational now.

---

## Cross-industry phase examples

| Industry | Operation | Preparation feels like | Execution feels like |
|----------|-----------|------------------------|----------------------|
| LTC | Breakfast | Serveries opening | Meal on floors |
| Hospital | Patient lunch | Tray line verify | Distribution |
| K-12 | School lunch | Lines staffed | Students through |
| University | Dinner rush | Stations stocked | Peak service |
| Corporate | Breakfast peak | Grab-and-go filled | Morning rush |
| EVS | Morning round | Zones cleared | Concurrent maintenance |
| Plant | Kitchen reliability | Morning plant check | On-call response |
| Laundry | Clean turn | Staging counted | Delivery window |
| Hospitality | Banquet 18:00 | Pantry prep | Plated service |

---

## Anti-patterns

- Flat "today" view with no sense of phase.
- Jumping to tomorrow before today's transition is visible.
- Hiding overlap — manager surprised lunch prep conflicted with breakfast recovery.
- Phase language that only makes sense to one industry in core UX.

---

## Related documents

- [OPERATION_MODEL.md](../platform-vision/OPERATION_MODEL.md) — lifecycle theory
- [01_OPERATIONS_CENTER.md](./01_OPERATIONS_CENTER.md) — manager view of timeline
- [06_OPERATIONAL_AWARENESS.md](./06_OPERATIONAL_AWARENESS.md) — health through phases
- [07_OPERATIONAL_RECOVERY.md](./07_OPERATIONAL_RECOVERY.md) — recovery within timeline
