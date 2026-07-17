# 15 — Implementation Plan

## Status

Wave **15AB** (this package) = architecture only.

Implementation begins only in later authorized waves. Ordering below improves on the suggested list by putting **contracts before shell**, and **shell/tool host before home cutovers**, with Projection domain/services feeding descriptors.

---

## Recommended sequence

### 15AC — Experience Contract & Composition Expansion

- Expand Wave 14A registry with composition declarations: sections, cards, widgets, layout densities, actions, overlay slots.  
- Golden fixtures for Temperature Monitoring, Meal Service, Cleaning.  
- **No UI shell yet. No Projection. No Admin/FB changes.**

### 15AD — Experience Shell Framework

- Generic shell renderer + layout templates + card/widget registry stubs.  
- Driven by composition declarations (mock Projection descriptors acceptable in tests).  
- Feature-flagged; not wired to production homes yet.

### 15AE — Generic Tool Host

- LOGS / KNOWLEDGE / FORMS hosts behind the shell.  
- Scope-enforcing loaders.  
- Still no full Projection platform.

### 15AF — Projection Domain Model + Services

- Wave 15B/15C from `docs/operational-projection/` (may be numbered 15AF in program tracking).  
- Emit Experience contract + composition descriptors.  
- Shadow mode before cutover.

### 15AG — Sidebar + Locations

- Consume Projection trees; Area → Experience discoverability.  
- No bespoke Experience layouts here.

### 15AH — Unit Workspace

- First production home on FULL density shells + overlays.  
- Replace mega-loader department branches incrementally.

### 15AI — Business Workspace

- COMPACT density Experience cards into existing composition seam.

### 15AJ — Operations Center + Today's Work

- STATUS / ACTION densities; aggregate overlays.  
- AI moments consume Experience AI slots.

### Later

- Module route retargeting (Assets/Repairs/Knowledge).  
- Capability eligibility retirement.  
- Additional Experiences via catalog only.

---

## Dependency rationale

```text
Composition declarations (15AC)
  → Shell + registry (15AD)
    → Tool host (15AE)
      → Projection emits real descriptors (15AF)
        → Nav (15AG)
          → Homes (15AH–15AJ)
```

Shell before Projection implementation is OK **with mock descriptors**.  
Production home cutover **requires** Projection scopes (fail closed).

---

## Explicit non-work in 15AB

No code, schema, flags, routes, React, Projection, Admin, Facility Builder, or Registry edits in this commit.
