# Operational Objects

**Status:** Product reference — object interaction model  
**Parent:** [00_PRODUCT_REFERENCE_INDEX.md](./00_PRODUCT_REFERENCE_INDEX.md)

These are **product objects** — how users perceive and interact with concepts. Not database tables.

---

## Object design principles

1. Every object **attaches to an operation or location** when relevant.
2. Objects have **state in plain language**.
3. Objects offer **one primary action** on list rows.
4. Drill-down **adds depth**, not a different product area.
5. Objects **link** — tap issue → see asset → see location.

---

## Location

**What user thinks:** A place where work happens — "4A Servery."

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Locations rail, grids, walk list |
| **States** | Ready, In progress, Not ready, Blocked, Healthy, At risk, Recovered |
| **Primary action** | Enter Unit Workspace |
| **Row shows** | Name · state chip · one reason |
| **Detail shows** | Operation context, work queue, equipment, issues, knowledge |
| **Create/edit** | Administration only |

**User mental model:** Location is **where I stand**.

---

## Operation

**What user thinks:** A service promise for a time window — "Breakfast service until 9:00."

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Center header, workspace orientation, timeline |
| **States** | Scheduled, Preparation, Execution, Closing, Complete |
| **Phases** | Opening, Preparation, Execution, Support, Recovery, Transition, Closing |
| **Primary action** | Filter all views to this operation |
| **Overlap** | Two operations shown honestly when concurrent |
| **Create/edit** | Templates in Administration; instances automatic |

**User mental model:** Operation is **what we're trying to deliver right now**.

---

## Work item (umbrella product object)

Checks, logs, milestones, confirmations — user sees **Work**, not separate product types.

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Unit Workspace queue |
| **States** | Due, In progress, Done, Failed, Missed |
| **Primary action** | Open → complete |
| **Failed** | Blocker reason + retry or escalate |
| **Attach** | Instructions, photos requirement |

Subtypes internally: compliance check, milestone, handoff confirm — **user label is human**.

---

## Issue

**What user thinks:** Something wrong that threatens work — "Warmer down."

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Center exceptions, workspace context, issue list |
| **States** | Open, In progress, Waiting, Recovered, Closed |
| **Types** | Equipment, Supply, Environment, Safety, Communication |
| **Primary action** | View impact · add update · recover |
| **Create** | Report problem flow (short) |
| **Row shows** | Title · location · impact on operation · age |
| **Detail shows** | Timeline of updates, linked asset, recovery actions, lessons |

**User mental model:** Issue is **what's broken or short**.

---

## Asset (equipment)

**What user thinks:** Equipment this location depends on — "Hot box 2."

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Workspace context, issue detail, admin registry |
| **States** | Working, Degraded, Out of service |
| **Primary action** | Report issue (from floor) |
| **Detail shows** | Notes, recent issues, PM due (supervisor+) |
| **Create/edit** | Administration |

**User mental model:** Asset is **the machine that can ruin the meal**.

---

## Supply

**What user thinks:** Something we run out of — "Tray domes."

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Shortage exceptions, workspace report |
| **States** | OK, Low, Critical short |
| **Primary action** | Report short · record substitute |
| **Detail shows** | PAR context (supervisor+), recovery |
| **Catalog** | Administration |

**User mental model:** Supply is **stuff we need at hand**.

---

## Person

**What user thinks:** Someone on the roster — "Maria."

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Coverage map, assignment rows, workspace "who's here" |
| **Operational view** | Role **for this operation** at **this location** |
| **Primary action** | Assign · reassign · call |
| **HR depth** | Administration — hire, credentials, union |
| **Floor** | First name + role only |

**User mental model:** Person is **who is working here today**.

---

## Call-down (coverage request)

Subtype of workforce object — first-class in UI.

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Center Tier 1, Coverage panel |
| **States** | Open, Covering, Closed |
| **Primary action** | Assign coverage |
| **Create** | Supervisor or manager — short form |

---

## Handoff

Commitment between departments or locations.

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Today's Work → Handoffs |
| **States** | Pending, Complete, Late |
| **Primary action** | Confirm sent / received |
| **Example** | Kitchen → porters |

---

## Knowledge

Not one list — **fragments attached** to location, asset, work item, issue, operation.

| Aspect | Product behavior |
|--------|------------------|
| **Seen on** | Expand on work item, location tips, issue history |
| **Types** | Tip, Procedure, Lesson, Policy link |
| **Primary action** | Read (inline) |
| **Author** | Supervisor+ for local tips |

---

## Object linking (navigation)

```
Operation
  └── Location
        ├── Work item
        ├── Issue → Asset
        ├── Supply short
        ├── Person (assigned)
        └── Knowledge tip
```

Tap always moves **deeper** with back stack. Never orphan object in wrong zone.

---

## Object list vs object detail pattern

| List | Detail |
|------|--------|
| Scannable rows | Full story |
| State + one reason | Timeline + actions |
| Sort by risk | Related objects |
| Primary action on row | Secondary actions in detail |

---

## Administration objects

Same entities — **edit mode** in Administration zone:

- Location registry
- Asset registry
- Supply catalog
- Person roster
- Operation templates
- Work templates

Floor never sees registry tables — only **instances**.

---

## Related documents

- [01_NAVIGATION_SYSTEM.md](./01_NAVIGATION_SYSTEM.md)
- [03_UNIT_WORKSPACE_REFERENCE.md](./03_UNIT_WORKSPACE_REFERENCE.md)
- [DOMAIN_MODEL_TARGET.md](../platform-vision/DOMAIN_MODEL_TARGET.md) — conceptual entities
