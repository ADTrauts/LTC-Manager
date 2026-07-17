# 08 — Component Registry

## Decision (architecture only)

The platform maintains a **Component Registry** that maps stable keys to implementations:

```text
layout templates
section chrome
card kinds
widget kinds
tool hosts
mount points
```

Projection never imports this registry. The **Experience Shell / Renderer** does.

---

## Registration model

```text
ComponentRegistry
  layouts[templateKey] → LayoutRenderer
  sections[sectionKey] → SectionChrome?
  cards[cardKind] → CardRenderer
  widgets[widgetKind] → WidgetRenderer
  tools[toolKind] → ToolHostRenderer
  mounts[mountHandle] → optional specialized panel
```

Keys are stable strings governed by architecture. Implementations live in the app UI layer.

---

## How new components become available without modifying Projection

```text
1. Add declaration keys to Experience Framework / Catalog contracts
2. Register renderer in Component Registry
3. Reference keys from Experience composition declarations
4. Projection continues to emit opaque descriptors/handles
5. Renderer resolves keys at mount time
```

Projection code paths stay unaware of new Temperature-specific widgets.

---

## Mount points

Mount handles from Experience Runtime contracts resolve here:

```text
mountHandle: "temperature.compliance_card"
  → CardKind STATUS + widget set
```

Prefer **kind-based** composition over one-off mounts. One-off mounts are escape hatches requiring certification — not the default.

---

## Governance

- Registry is platform-owned.  
- Experiences cannot register arbitrary runtime code from Admin.  
- Feature flags may gate renderer availability (implementation wave) — not defined in this architecture wave’s deliverables as code.
