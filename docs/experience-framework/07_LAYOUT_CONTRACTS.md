# 07 — Layout Contracts

## Decision

Experiences declare **layout descriptors** — abstract regions and density hints. Projection and Experience contracts **never** emit React components, JSX, or CSS.

---

## Layout regions

| Region | Role |
|--------|------|
| `HEADER` | Title, status chip, primary actions |
| `PRIMARY` | Main column — Overview, Status, Work, Tools |
| `SECONDARY` | Supporting column — Knowledge, AI, Metrics (when wide) |
| `ASIDE` | Optional contextual rail (rare; Unit large screens) |
| `FOOTER` | Tertiary actions / legal / last updated |
| `OVERLAY_MODAL` | Modal host for confirms / focused tools |
| `OVERLAY_DRAWER` | Drawer host for secondary flows |
| `TOAST` | Shell-owned feedback (not Experience-declared content) |

---

## Layout contract shape

```text
LayoutContract
  template: SINGLE_COLUMN | TWO_COLUMN | COMPACT_STACK | STATUS_STRIP | ACTION_STRIP
  regions:
    HEADER: { sections: [HEADER] }
    PRIMARY: { sections: ordered section keys }
    SECONDARY?: { sections: [...] }
  overlays:
    modalSlot | drawerSlot
  densityHints:
    FULL | COMPACT | STATUS | ACTION
```

Homes select which template/density applies; Experiences declare which sections map into regions for each density hint they support.

---

## How Experiences declare layout

In the workspace/composition contract:

```text
layout:
  supports: [FULL, COMPACT, STATUS, ACTION]
  full: TWO_COLUMN + section map
  compact: COMPACT_STACK + Overview/Status/Work only
  status: STATUS_STRIP + CURRENT_STATUS cards
  action: ACTION_STRIP + outstanding work cards
```

Missing density support → framework falls back to `COMPACT` or `FULL` subset — never invents sections.

---

## Projection relationship

Projection may pass through layout *hints already on the Experience contract* and purpose family. It does **not** choose React layout components. Home adaptation resolves `purpose → density → layout template`.
