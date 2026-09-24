# Unit Workspace Reference

**Status:** Product reference — execution experience  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

---

## User goals

- Know **what operation** this location serves **right now**.
- Complete **what must happen here** before and during service.
- See **equipment and issues** that affect this place.
- **Report problems** without leaving.
- Feel **done** when work for this phase is complete.

---

## Entry paths

| Path | What user sees first |
|------|---------------------|
| Employee PIN sign-in (kiosk) | Unit Workspace immediately — no list |
| Employee PIN (multi-location) | Locations rail → tap → Unit Workspace |
| Supervisor walk list | Unit Workspace for chosen location |
| Manager drill from Center | Unit Workspace with **return to Center** preserved |
| Deep link / notification | Unit Workspace with highlighted exception or task |

---

## Screen structure (information architecture)

Unit Workspace has **three layers** that unfold in order — user never sees all at once on entry.

### Layer 1 — Orientation (always visible, top)

| Element | Purpose |
|---------|---------|
| Location name | Where am I |
| Active operation + phase | Breakfast service · Preparation |
| Readiness here | Ready / In progress / Blocked + one reason |
| Time cue | Service in 18 min · or · Service live |

**User goal answered:** *What world am I in?*

---

### Layer 2 — Next work (primary focus)

**Single promoted "Do this next"** — the highest-priority incomplete item.

Below it: **remaining work queue** — ordered, scannable, not overwhelming.

| Work item types | Examples |
|-----------------|----------|
| Check / log | Opening sanitizer test |
| Milestone | Mark meal ready |
| Confirmation | Handoff received from kitchen |
| Issue follow-up | Warmer workaround — confirm holding temp |

Each item shows: name, required yes/no, estimated effort (one line), expand for instructions.

**User goal answered:** *What do I do next?*

---

### Layer 3 — Context (available, not dominant)

Collapsed or secondary section **"About this location"**:

- Equipment that matters — status chips
- Open issues here
- Today's differences (menu mod, isolation)
- Location knowledge — one-line tips, expand for detail

**User goal answered:** *What do I need to know if something is weird?*

---

### Persistent action: Report problem

Always reachable — not buried in menu. Opens short flow, returns to Layer 2.

---

## How information unfolds over time

### Arrival (preparation phase)

1. Orientation shows **Not ready** or **In progress**.
2. Next work promotes **first opening check**.
3. User completes → next item promotes automatically.
4. Context layer silent unless equipment has known issue.

### Mid-preparation

1. Readiness updates as checks complete.
2. Milestone **Mark meal ready** promotes when prerequisites done.
3. If issue reported, Layer 1 shows **Degraded**; workaround in context.

### Execution phase

1. Orientation shows **Execution — Service live**.
2. Next work shifts to **in-service checks** and restock confirmations.
3. Milestone **Mark meal started** if not yet done.

### Completion / transition

1. Orientation shows **Closing** or **Transition to lunch prep**.
2. Next work shows shutdown checklist.
3. **Completion moment** — see below.

---

## Work progression rules

1. **One next action** — only one item visually primary.
2. **Queue is honest** — overdue items rise; failed items block milestone.
3. **Instructions on expand** — not before start unless safety-critical.
4. **Save partial** — user can leave mid-check; state preserved.
5. **No module jumps** — all work types in one queue.

---

## How completion feels

When all required work for **current phase** is done:

| State | Experience |
|-------|------------|
| **Ready for milestone** | Prominent confirm — "Mark meal ready?" |
| **Phase complete** | Clear message — "4A ready for breakfast service" — not silent green |
| **Operation ended here** | "Breakfast close-out complete" + what carries forward |
| **Blocked elsewhere** | Honest — "Your work here is done; site still at risk at 3B" (manager only) |

Completion is **satisfying** — brief positive acknowledgment, not confetti, not nothing.

Employee sees: *You're good here — next check at 11:30* or *Help at 2 North if you can* (only if supervisor broadcast).

---

## Supervisor vs employee in same workspace

Same IA; supervisor sees **additional**:

- Reassign / request coverage
- Override readiness with reason
- Full issue history at location

Employee never sees site-wide anxiety.

---

## Manager drill-in

When manager opens from Center:

- **Banner:** "Returned from Operations Center — Blocked: sanitizer"
- Same three layers
- **Back to Center** always visible
- Manager actions: escalate, acknowledge recovery, reassign — employee actions still available

---

## Interaction philosophy

- **Scroll is one direction** — orientation top, work middle, context bottom.
- **Tap work item → focus mode** — full screen check, submit, auto-return to queue.
- **Failed check → explain why + what now** — not red dead end.
- **Switch location** (if allowed) — confirm "leave incomplete work?" if items open.

---

## Kiosk constraints

- No Locations list
- Larger touch targets (philosophy, not pixels)
- Sign out visible
- Report problem one tap
- If wrong location login warning — continue with banner, not block (per Constitution)

---

## Related documents

- [05_EMPLOYEE_REFERENCE.md](./05_EMPLOYEE_REFERENCE.md)
- [07_OPERATIONAL_OBJECTS.md](./07_OPERATIONAL_OBJECTS.md)
- [06_OPERATION_FLOW_REFERENCE.md](./06_OPERATION_FLOW_REFERENCE.md)
