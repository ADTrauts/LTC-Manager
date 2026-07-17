# 12 — Experience ↔ Workspace Relationship

## Navigation model

Primary operational navigation becomes:

```text
Department lens
  → Operational Area
    → Experience
      → Tool (optional deep focus)
```

Not:

```text
Module → Page
```

Sidebar/Locations still show **places**; Area→Experience is the **work** spine. Both come from Projection.

---

## Business Workspace

**Question:** What should I personally do next?

**Composition:**

```text
Projection (BUSINESS_WORKSPACE)
  → for each relevant Experience (manager-scoped):
       compact Overview + Outstanding Work + primary actions
  → optional Department Health rollups (Area/Experience metrics)
  → cached AI peek only
```

Business Workspace **composes Experience cards/sections**. It does not own Experience eligibility or anatomy. Preferences may reorder cards, not add off-projection Experiences.

---

## Unit Workspace

**Question:** What do I do standing here?

**Composition:**

```text
Projection (UNIT_WORKSPACE, focus)
  → Areas (non-empty)
    → Experiences (full shell density)
      → tools / status / history within scopes
  → operation header from Operations Engine
  → readiness overlay
```

Unit Workspace is the primary full-anatomy host. PIN flows remain location-locked; Experiences still permission-narrowed.

---

## Operations Center

**Question:** What is wrong across the site right now?

**Composition:**

```text
Projection (OPERATIONS_CENTER)
  → aggregate readiness/work/exception signals
       from Experiences that declare readiness/work contributions
  → pack exceptions by Area / Experience labels
  → Morning Brief consumes Experience AI/brief signals
```

OC does not mount full shells. It aggregates **contracts** (status/exceptions). Drill-down lands in Unit Workspace or Experience deep link.

---

## Today's Work

Ranks projected locations using Experience outstanding-work + readiness overlays; assignments prioritize within Projection.

---

## Density matrix

| Home | Shell density |
|------|----------------|
| Unit Workspace | Full |
| Business Workspace | Compact cards |
| Operations Center | Status/exception chips |
| Today's Work | Outstanding + walk |
| Module-compatibility routes | Experience-scoped lists during migration |
