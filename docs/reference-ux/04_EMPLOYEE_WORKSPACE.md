# Employee Workspace

**Primary audience:** All floor participants — staff, aides, porters, utility, line workers  
**Status:** Canonical employee experience  
**Parent:** [00_REFERENCE_UX_INDEX.md](./00_REFERENCE_UX_INDEX.md)

---

## User mindset

Employees arrive to **work**, not to **use software**.

Many are:

- Standing, gloved, interrupted.
- New or floating — unfamiliar with this exact location.
- Anxious about doing the wrong thing or missing a step.
- Skeptical of "another system" that slows them down.

The employee experience must feel **calm, obvious, and respectful of their time**.

Overwhelm is not a training problem — it is a **design failure**.

---

## Goals

| Goal | Success feels like |
|------|-------------------|
| **Immediate clarity** | I know where I am working and what matters now |
| **Single next step** | I am not choosing from twenty tasks |
| **Confidence** | Help appears when I need it — not judgment when I ask |
| **Speed** | Documentation takes seconds, not minutes |
| **Safety** | Reporting problems is normal, not risky |

---

## Core questions answered

The application must always answer — without the employee searching:

| Question | Experience |
|----------|------------|
| **Where am I working?** | Location name prominent; if floating, clear which place is active |
| **What operation am I part of?** | Plain language — "Breakfast service until 9:00," not internal codes |
| **What do I do next?** | One primary next action; secondary work visible but subordinate |
| **What changed?** | Today's differences at this location — menu, procedure, equipment |
| **What help is available?** | Procedure hint, supervisor contact, equipment note — contextual |
| **How do I report problems?** | One obvious path — equipment, supply, need supervisor |

---

## Relationship to Unit Workspace

**Unit Workspace** defines what a **location** shows.  
**Employee Workspace** defines how a **person** experiences it.

The employee layer adds:

- **Role-appropriate simplification** — porter sees porter work; server sees server work.
- **Calm defaults** — minimal chrome, no admin, no site-wide anxiety.
- **Trust** — the system does not expose them to blame-oriented metrics on open.

Every employee lands in Unit Workspace. Employee Workspace is the **principles** that shape that landing.

---

## Information hierarchy (employee)

### Tier 1 — Never buried

- Where am I?
- What operation is active?
- What do I do next?

### Tier 2 — Visible, not shouting

- What else is due before this operation ends?
- What changed today?
- What equipment should I know about?

### Tier 3 — Available on intent

- Report a problem
- See procedure detail
- Switch location (if allowed)

### Never on open (employee)

- Site-wide statistics
- Other locations' problems (unless covering)
- Schedule for next week
- Administrative HR
- Manager prioritization boards

---

## Knowledge appears automatically

Employees should not **go find** a manual.

Knowledge surfaces when:

- They open a check that has **instructions attached**.
- They touch equipment with a **known quirk note**.
- They are at a location with a **first-day hint**.
- They report an issue and see **what others tried before**.

This emulates **shadowing a experienced coworker** — "Oh, that warmer runs hot" — not reading a PDF in the break room.

---

## Operational flow (employee)

```
Sign in → Land at my location (or assigned location)
       → See operation + next action
       → Complete work in sequence
       → Hit milestone if role requires (ready, started, complete)
       → Problem? → Report in place → continue or wait for help
       → Operation transitions → clear prompt what changed
```

Sign-in must be **fast** — PIN, badge, or persistent session on shared device. Authentication is a **turnstile**, not an interview.

---

## Floating and coverage

When an employee covers an unfamiliar location:

- Workspace shows **location-specific knowledge** prominently.
- Role for this operation is clear — "you are server today at 4A."
- Variance is acknowledged — "you are not usually assigned here" — without blocking work when policy allows.

---

## Reporting problems (employee experience)

Reporting must feel:

- **Fast** — few fields, sensible defaults (location pre-filled).
- **Safe** — no implication of blame.
- **Useful** — confirmation that someone will see it.
- **Optional detail** — can add more later; minimum gets help moving.

Categories the employee understands: **equipment**, **supplies**, **need help**, **safety** — not internal taxonomies.

---

## UX principles (Employee Workspace)

1. **Calm over complete** — show less, guide more.
2. **One next thing** — reduce choice paralysis.
3. **Plain language** — operation names humans use on the floor.
4. **No guilt** — missed work is visible for recovery, not punishment on open.
5. **Help in context** — knowledge attached to the task, location, or equipment.
6. **Respect interruption** — save state implicitly; return is effortless.
7. **Floor speed** — every extra tap is felt; design for gloves and hurry.

---

## Role variations (same principles)

| Role | Next action examples |
|------|---------------------|
| Server | Opening checks → meal ready → service logs |
| Cook | Prep checks → production temps → handoff ready |
| Porter | Pickup confirmed → delivery → return |
| EVS aide | Zone status → issue report |
| Utility | Equipment check → issue report |
| Retail | Stock/temp check → service ready |

Same hierarchy. Different work content.

---

## Cross-industry applicability

| Industry | Employee at… | Must not feel… |
|----------|--------------|----------------|
| LTC | Servery | Like compliance software |
| Hospital | Nourishment room | Like clinical documentation |
| K-12 | Café line | Like a test |
| University | Dining hall station | Like corporate bureaucracy |
| Corporate | Market floor | Like IT ticketing |
| EVS | Patient floor zone | Like an afterthought |
| Plant | Respond to kitchen call | Like CMMS only |
| Laundry | Fold/stage station | Like inventory ERP |
| Hospitality | Banquet service | Like back-office POS |

---

## Anti-patterns

- Employee opens to site dashboard.
- Wall of overdue items from other shifts with no prioritization.
- Forcing navigation through department org chart.
- Training videos required before any action.
- Error messages that sound accusatory.
- Hiding who to ask for help.

---

## Related documents

- [02_UNIT_WORKSPACE.md](./02_UNIT_WORKSPACE.md) — location execution surface
- [08_OPERATIONAL_KNOWLEDGE.md](./08_OPERATIONAL_KNOWLEDGE.md) — contextual teaching
- [07_OPERATIONAL_RECOVERY.md](./07_OPERATIONAL_RECOVERY.md) — employee role in recovery
- [03_SUPERVISOR_WORKSPACE.md](./03_SUPERVISOR_WORKSPACE.md) — who receives escalations
