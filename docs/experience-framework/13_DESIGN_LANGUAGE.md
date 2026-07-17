# 13 — Design Language (Architectural)

## Decision

Every Experience should **feel identical** in structure and interaction rhythm. This document defines architectural design language — **not CSS, colors, or fonts**.

Visual tokens remain the product Design System. This framework constrains **operational composition**.

---

## Structural rhythm

| Element | Rule |
|---------|------|
| **Section spacing** | Consistent vertical band gaps; one purpose per section |
| **Headers** | Experience header once; section headers quieter; no competing H1s |
| **Badges** | Count/severity only; not decorative stickers on media |
| **Status language** | Shared Ready / In Progress / Needs Attention (+ Due/Overdue where declared) |
| **Action placement** | Primary in header/card top-right; destructive confirmed; overflow for tertiary |
| **Tool placement** | In declared tool sections — never floating orphan modules |
| **Loading** | Card-local skeletons; preserve layout |
| **Errors** | Card-local; shell continues |
| **Warnings** | Alert widgets inside status/work cards |
| **Success** | Toast or inline confirmation — not full-page celebration |
| **Empty** | One sentence + optional action |
| **Density** | Compact removes description lines and secondary actions first |

---

## Interaction sameness

- Expanding a card behaves the same across Experiences.  
- Submitting a tool always returns to Experience context.  
- Soft-linking to related Experiences uses the same entity-link pattern.  
- AI blocks always labeled assistive / grounded.

---

## What this is not

- Not a second design-system token file.  
- Not permission to introduce purple/glow/dashboard clutter.  
- Not license for card-in-card nesting or multi-layer shadows as decoration.

Operational Cards exist for **interaction**, not ornament.
