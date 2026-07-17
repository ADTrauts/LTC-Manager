# 03 — Experience Anatomy

## Decision

Every Experience shares a **common shell model**. Section *presence* is declared by the Experience; section *content* is filled by tools and engines within Projection scopes.

Homes do not invent a different anatomy per department. They mount the shell the Experience declares.

---

## Common shell

```text
┌─────────────────────────────────────────────────────────────┐
│ EXPERIENCE SHELL                                            │
│  Header: name · area · status chip · primary actions        │
├─────────────────────────────────────────────────────────────┤
│ Overview          purpose, current commitment relevance     │
│ Current Status    live signals (readiness / due / blockers) │
│ Outstanding Work  tasks, incomplete logs, open follow-ups   │
│ Primary Tools     logs / forms / checklists / records       │
│ Resources         equipment, assets, related records        │
│ Knowledge         contextual guidance                       │
│ AI Assist         optional grounded moment / summary        │
│ History           recent submissions / events               │
│ Reports           optional experience-scoped views          │
│ Settings link     admin/config deep link (entitled only)    │
└─────────────────────────────────────────────────────────────┘
```

Not every section renders every time. Empty optional sections are suppressed — same rule as empty Operational Areas.

---

## Worked example — Temperature Monitoring

```text
Temperature Monitoring  (Area: Food Safety)
├── Overview
│     Holding / receiving / dish machine temp program summary
├── Current Status
│     Due now · overdue · missed (from log + readiness engines)
├── Outstanding Work
│     Incomplete temperature logs for this operation / room
├── Equipment
│     Relevant cold/hot holding equipment in scope
├── Logs          ← LOGS tool
│     Temperature log templates bound to this Experience
├── Knowledge     ← KNOWLEDGE tool
│     HACCP / calibration SOP for this context
├── History
│     Recent submissions and corrective actions
├── Reports       (optional)
│     Compliance completion for selected window
└── Settings      (admin)
      Template bindings, thresholds (profile/config)
```

---

## Section classification

| Section | Shell policy |
|---------|--------------|
| Header | **Required** |
| Overview | **Required** (may be compact) |
| Current Status | **Required if** readiness/work signals declared; else omit |
| Outstanding Work | **Optional** |
| Primary Tools | **Optional** but typical |
| Resources (assets/equipment) | **Optional** |
| Knowledge | **Optional** |
| AI Assist | **Optional**; never invents work |
| History | **Optional** |
| Reports | **Optional** |
| Settings | **Optional**; never on floor PIN paths unless entitled |
| Notifications center | **Never** as in-shell inbox — notifications are system-level, Experience declares kinds only |
| Cross-facility analytics | **Never** inside Experience shell |

---

## Shared shell vs unique layout

**Shared:**

- section vocabulary and ordering defaults;
- header + status + tools + knowledge patterns;
- contract-driven mounting.

**Unique per Experience:**

- which sections are declared;
- which tools/templates bind;
- which engine adapters fill status/history;
- primary actions.

Experiences do **not** each invent unrelated page layouts that bypass the shell. Custom chrome must still map to declared sections/contracts.

---

## Density by home

| Home | Anatomy density |
|------|-----------------|
| Unit Workspace | Full shell for focused Experiences |
| Business Workspace | Overview + outstanding + actions (compact cards) |
| Operations Center | Status + exceptions only (aggregate) |
| Today's Work | Outstanding work + location ranking hooks |
| Deep link / tool focus | May open mid-shell (e.g., Logs section) without losing Experience context |

Opening a log never orphans the user into a “Logs module” — breadcrumbs retain Experience → Tool.
