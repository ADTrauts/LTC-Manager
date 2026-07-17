# 03 — Card Model

## Decision

Every content-bearing Section contains **Cards**. Cards are the consistent interactive container across all Experiences — the operational equivalent of a design-system surface for work.

---

## Card anatomy (canonical)

```text
Card
  identity          cardKey, sectionKey, experienceKey
  title             required
  description       optional
  status            optional (Ready / In Progress / Needs Attention / Due / …)
  badges            optional (count, severity)
  primaryActions[]  optional
  secondaryActions[] optional
  body              widgets[] | toolHostRef | empty/error/loading
  expansion         collapsed | expanded | none
  live              overlaySlot refs
```

---

## Consistency rules

| Concern | Rule |
|---------|------|
| **Title** | Always present; product language, not route names |
| **Description** | One short supporting line max in compact density |
| **Status** | Uses shared status vocabulary (product/design system) |
| **Actions** | Right/header of card; primary ≤2 visible; rest overflow |
| **Expansion** | Optional; expanded state may load deferred overlay |
| **Loading** | Skeleton within card bounds — never blank page |
| **Empty** | Explicit empty copy + optional CTA action |
| **Error** | Card-local error; does not crash Experience shell |
| **Live updates** | Via overlay refresh on slot; card identity stable |

---

## Card kinds (registry)

| Kind | Use |
|------|-----|
| `SUMMARY` | Overview / purpose |
| `STATUS` | Current state / compliance |
| `WORK_QUEUE` | Outstanding items list |
| `RESOURCE_LIST` | Equipment/assets |
| `TOOL_HOST` | Embeds a tool surface |
| `KNOWLEDGE` | Guidance list/preview |
| `METRIC` | KPI display |
| `HISTORY` | Timeline / recent rows |
| `AI` | Assistive summary |
| `ACTION_STRIP` | Dense action-only (Today density) |

Experiences compose kinds; they do not invent incompatible one-off card chrome.

---

## Cards and “no cards in hero” product rule

Product frontend design rules discourage decorative cards on marketing heroes. **Operational Cards are interaction containers** — they remain required for work surfaces. They must still avoid nested card-in-card clutter and multi-shadow chrome.

---

## Ownership

- **Declaration:** Experience catalog/framework.  
- **Presence:** Projection (Experience present) + density + empty suppression.  
- **Data:** Runtime overlay.  
- **Look:** Design system + Card kind implementation in Component Registry.
