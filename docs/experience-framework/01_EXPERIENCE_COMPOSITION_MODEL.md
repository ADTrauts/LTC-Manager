# 01 — Experience Composition Model

## Decision

An Experience is a **declarative operational application** assembled from a fixed hierarchy of structural layers. Developers do not invent page layouts; they declare composition descriptors that the framework renders.

---

## Structural layers

```text
┌─────────────────────────────────────────────────────────────┐
│ EXPERIENCE                                                  │
│  Identity · contracts · config · query scopes · actions     │
├─────────────────────────────────────────────────────────────┤
│ LAYOUT REGIONS (descriptors)                                │
│  Header · Primary · Secondary · Aside · Footer · Overlay    │
├─────────────────────────────────────────────────────────────┤
│ SECTIONS                                                    │
│  Overview · Status · Work · Tools · Resources · …           │
├─────────────────────────────────────────────────────────────┤
│ CARDS                                                       │
│  Consistent interactive containers within sections          │
├─────────────────────────────────────────────────────────────┤
│ WIDGETS                                                     │
│  Atomic display / input / signal units                      │
├─────────────────────────────────────────────────────────────┤
│ TOOLS (hosted)                                              │
│  Logs · Forms · Knowledge · Checklists · Tasks · …          │
├─────────────────────────────────────────────────────────────┤
│ RUNTIME OVERLAY                                             │
│  Engine data bound to widget/card slots (immutable Proj.)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer classification

| Layer | Required | Optional | Forbidden |
|-------|----------|----------|-----------|
| **Header** | Yes | — | Custom chrome that bypasses header contract |
| **Status** | If readiness/work signals declared | Otherwise omit | Owning readiness evaluation |
| **Overview** | Yes (may be compact) | Rich cards | Second Operations Center |
| **Sections** | ≥1 content section beyond header | Many | Unlimited ad-hoc section IDs outside registry |
| **Cards** | Yes inside sections that show content | Zero when section empty/suppressed | Cards as top-level nav peers |
| **Widgets** | Typical inside cards | Simple text-only cards | Widgets that fetch without scopes |
| **Tools** | Optional | Bound tools | Top-level tool modules |
| **Metrics** | Optional | Declared metric widgets | Facility warehouse inside Experience |
| **Actions** | If mutations exist | Read-only Experiences | Ungoverned client actions |
| **History** | Optional | Bounded | Unlimited export UI as shell core |
| **AI** | Optional | Assist section | Chatbot home; inventing work |
| **Settings** | Optional | Admin deep link | Floor users editing Facility Builder |
| **Resources** | Optional | Equipment/assets cards | Cross-dept asset admin |
| **Bespoke full-page layout** | — | — | **Forbidden** as primary pattern |
| **Module-specific page tree** | — | — | **Forbidden** long-term |

---

## Declarative application (mental model)

```text
ExperienceDeclaration
  layout: LayoutContract
  sections: SectionDeclaration[]
  cards: CardDeclaration[]     # keyed under sections
  widgets: WidgetDeclaration[] # keyed under cards
  tools: ToolHostBinding[]
  actions: ActionDeclaration[]
  overlaySlots: OverlaySlot[]  # where runtime binds
```

This is architecture, not a TypeScript schema mandate — but implementation waves must preserve this shape.

---

## Ownership recapitulation

| Concern | Owner |
|---------|-------|
| Which Experience exists here | Projection |
| What sections/cards/widgets mean | Experience Catalog + Framework declarations |
| Density / which sections show in a home | Home adaptation profile |
| Live values | Runtime overlay ← engines |
| Pixels | Component Registry implementations |

---

## Non-negotiable rules

1. No bespoke Experience pages outside the framework shell.  
2. Projection never emits React components.  
3. New operational UI = new declarations + registered components — not new home logic.  
4. Empty optional sections/cards are suppressed.  
5. Cross-Experience UI uses soft links, not nested full shells.
