# Operations Center

**Primary audience:** Managers, department heads, site leaders  
**Status:** Canonical manager experience  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

---

## User mindset

A manager opens the platform **already carrying mental load**: staffing gaps heard on the phone, a text about a broken warmer, a survey rumor, a late delivery, three locations to open before service.

They are not looking for software. They are looking for **certainty**:

- Can we deliver the next service commitment?
- Where will failure hurt first?
- What changed since I last looked?

The Operations Center must feel like **walking into the kitchen and seeing the whole board** — not opening six different binders.

---

## Goals

| Goal | Success feels like |
|------|-------------------|
| **Situational clarity** | Within seconds, I know if we are ready or in trouble |
| **Prioritized attention** | I see what needs me first — not everything at once |
| **Confident delegation** | I can send a supervisor to the right place with shared facts |
| **Calm under variance** | Problems are visible early; recovery is in motion |
| **Transition between operations** | I see what ended, what is active, what is coming next |

---

## The fifteen-second test

Within **fifteen seconds** of opening the application, a manager should know:

1. **Which operation is active** — or which two overlap (e.g., breakfast executing while lunch prepares).
2. **Whether the site is ready, at risk, or blocked** for that operation — not site-wide averages that hide a failing wing.
3. **The single most urgent exception** — if any exists.
4. **How many locations are not ready** — and whether that number is zero.

If fifteen seconds pass and the manager is still **assembling a picture**, the Operations Center has failed.

---

## Information hierarchy

Information is ordered by **decision urgency**, not module convenience.

### Tier 1 — Immediate attention (always visible)

Demands action or decision **before or during** the active operation.

| Signal | Manager question answered |
|--------|---------------------------|
| **Operational readiness (site and locations)** | Are we ready? |
| **Blocked locations** | What cannot start or continue? |
| **Active call-downs without coverage** | Who is not coming — and is anyone covering? |
| **Critical open issues** | What equipment or environment failure threatens service now? |
| **Failed compliance gates** | What safety or policy blockers exist for this operation? |
| **Today's top priority** | What did leadership or events make non-negotiable today? |

### Tier 2 — Situational context (one glance away)

Shapes decisions but rarely requires instant intervention.

| Signal | Manager question answered |
|--------|---------------------------|
| **Staffing coverage by location** | Who should be where for this operation? |
| **Active operations list** | What is running now and what is next? |
| **Supply shortages affecting today** | What are we missing at point of use? |
| **Open issues (non-critical)** | What is broken but worked around? |
| **Compliance due soon** | What must be completed before the next phase? |
| **Handoffs in flight** | What is waiting between departments? |

### Tier 3 — Background and planning (deliberate drill-down)

Important for the day but not for the opening glance.

| Signal | Manager question answered |
|--------|---------------------------|
| **Tomorrow's operations** | What should I worry about tonight? |
| **Schedule for later shifts** | Is the afternoon covered? |
| **Historical patterns** | What keeps repeating? |
| **Administrative completeness** | Are roster, templates, and configuration current? |

**Rule:** Tier 3 never competes visually with Tier 1. Birthdays, anniversaries, and nice-to-know belong below operational survival.

---

## Surfacing operational dimensions

### Operational readiness

Readiness appears as a **plain-language site summary** plus **per-location status**.

- Site: *Ready for lunch service* / *At risk — 2 locations blocked* / *Not ready — do not start*
- Locations: each named place shows ready, in progress, degraded, or blocked — with **one reason** when not ready.

Readiness is **operation-scoped**. Breakfast readiness and lunch readiness are different pictures.

### Staffing

Staffing appears as **coverage for the active operation**, not a full roster.

- Gaps first: locations with no assigned role for this window.
- Overrides and call-downs visible as **open loops** until covered.
- Names appear when drilling into a location — not as a wall of names on open.

### Active operations

The manager sees **what is live now** and **what starts next** on a timeline aligned to the site's operational clock.

- Current operation name and phase (preparation, execution, support).
- Time remaining or elapsed in human terms.
- Which departments are participating.

### Equipment issues

Issues threatening the active operation appear in Tier 1. Others in Tier 2.

- Linked to **location** and **impact on operation** — not abstract ticket numbers.
- Status: open, in progress, waiting, resolved — with whether service is blocked.

### Supply shortages

Shortages appear when they affect **today's operation at a location**.

- Item, location, severity — not warehouse inventory theory.
- Shortage without recovery action surfaces as at-risk.

### Call-downs

Call-downs are **first-class**, not buried in schedule editing.

- Who called off, what location/operation is affected, whether coverage is confirmed.
- Unanswered call-downs escalate visually — they are operational risks, not HR paperwork.

### Compliance risks

Compliance appears as **gates on readiness**, not a separate compliance module on open.

- Failed or overdue checks that block or degrade service.
- Due-soon checks that will block if ignored.

### Open issues (general)

Non-equipment issues — environment, safety, coordination — surface when they affect operational health.

### Today's priorities

A small, explicit set of **leadership-declared or event-driven priorities** for the day.

- Survey today. Catering for 200. New isolation protocol on 4 West.
- Priorities **reorder attention** — they do not replace readiness logic.

---

## Manager decision making

The Operations Center exists to support **five decisions**:

| Decision | Experience support |
|----------|-------------------|
| **Are we ready?** | Site and location readiness summary |
| **Where should I go?** | Ranked list of locations by risk and impact |
| **What changed?** | Since-last-visit or since-yesterday delta — staffing, issues, priorities |
| **What is blocked?** | Explicit blockers with reason and owner |
| **What is next?** | Next operation, phase transition, preparation deadlines |

### Decision flow (typical morning)

1. Open Operations Center → read site readiness for upcoming operation.
2. If **ready** → scan Tier 2 for soft risks; delegate supervisor walk.
3. If **at risk** → identify highest-impact location; drill to Unit Workspace context or send supervisor.
4. If **blocked** → read blocker; initiate recovery (call-down, escalate issue, reduce scope).
5. Glance **what is next** → mentally preload transition (breakfast → lunch prep).

Managers **decide**, they do not **search**. Search is a failure mode for Tier 1 information.

---

## Operational flow through the center

The Operations Center is **not a destination for doing work** — it is the **command view**.

```
Open → Orient (active operation, readiness)
     → Prioritize (exceptions Tier 1)
     → Decide (go / delegate / recover)
     → Drill (location, staffing, issue — only as needed)
     → Return to center (loop every 15–30 minutes during service)
```

Between active operations, the center emphasizes **transition**: what closed, what carried forward, what prepares next.

---

## UX principles (Operations Center)

1. **Exceptions before completeness** — show what is wrong before what is fine.
2. **Locations before modules** — organize by place, not by logs vs repairs vs staffing.
3. **Now before later** — active operation dominates the view.
4. **One reason** — when something is blocked, say why in plain language.
5. **Actionable density** — every Tier 1 item suggests what a manager might do next.
6. **No hunting** — if it matters for today's operation, it is here or one intentional drill-down away.
7. **Honest variance** — partial success and recovery in progress are visible, not hidden until green.

---

## Cross-industry applicability

| Industry | Operations Center answers |
|----------|---------------------------|
| Long-term care | Are serveries ready for this meal? |
| Hospital | Are service points ready for patient dining this window? |
| K-12 | Are cafés and lines ready for this lunch period? |
| University | Are retail and dining halls ready for the rush? |
| Corporate | Are cafés and micro-markets ready for peak? |
| EVS | Are zones ready for the round before clinical access? |
| Plant | Are critical assets reliable for today's operations? |
| Laundry | Is turn ready for the next distribution window? |
| Hospitality | Is service ready for this meal period or event? |

Same experience. Industry packs change labels and typical operations — not the hierarchy of attention.

---

## Anti-patterns

- Opening to a blank dashboard that requires configuration to be useful.
- Equal visual weight for birthdays and blocked serveries.
- Forcing managers into module tabs to assemble readiness.
- Showing 100% log completion when operations are failing.
- Historical reports masquerading as situational awareness.
- Requiring managers to refresh mentally what "today" means.

---

## Related documents

- [06_OPERATIONAL_AWARENESS.md](./06_OPERATIONAL_AWARENESS.md) — health states
- [03_SUPERVISOR_WORKSPACE.md](./03_SUPERVISOR_WORKSPACE.md) — floor-level counterpart
- [05_OPERATION_TIMELINE.md](./05_OPERATION_TIMELINE.md) — operational rhythm
- [07_OPERATIONAL_RECOVERY.md](./07_OPERATIONAL_RECOVERY.md) — recovery flows
