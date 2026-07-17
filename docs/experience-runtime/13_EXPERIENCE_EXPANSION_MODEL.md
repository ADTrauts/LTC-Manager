# 13 — Experience Expansion Model

## Goal

Adding a brand-new Experience requires **no changes** to:

- Facility Builder  
- Projection **core** (pipeline/pruning/Plant policy)  
- Sidebar **core** adapter  
- Department Administration **framework** (only catalog data + optional baseline seed)

Experiences are a **plug-in architecture** via catalog + contracts.

---

## Additive path for a new Experience

```text
1. Publish Experience to catalog
   - identity, anatomy sections, contracts, tools, permissions, engines used

2. Register baseline placement (optional)
   - default Area in system department baseline

3. Facility activates via Department Administration
   - select Experience, place in Area, bind archetypes, configure tools
   - certify + activate profile

4. Projection automatically
   - resolves new key like any other
   - emits contracts if profile+room+permissions allow

5. Homes automatically
   - mount via generic Experience shell + mount handles
   - no per-Experience Sidebar hardcoding

6. Engines
   - already exist or ship domain adapters referenced by contract
```

---

## What “no Projection change” means

Projection core understands **generic** Experience descriptors. It must not contain `if (experienceKey === 'TEMPERATURE_MONITORING')` eligibility logic.

Experience-specific behavior lives in:

- catalog contracts (query scope rules, sections);  
- engine adapters;  
- shell section components registered by mount handle.

Adding Meal Service v2 config fields = catalog/profile schema — not Facility Builder rooms.

---

## Demonstration — “Nourishments” Experience

| Layer | Change? |
|-------|---------|
| Facility Builder | **No** |
| Projection pipeline | **No** |
| Sidebar core | **No** (renders projected Area→Experience) |
| Dept Admin UI framework | **No** (picks new catalog key) |
| Catalog | **Yes** — add definition + contracts |
| Baseline seed | **Optional Yes** |
| Log templates / knowledge | **Yes** — bindings |
| Permission keys | **Yes** — grant to roles |

---

## When platform change *is* required

Only when inventing a **new contract kind** or **new tool kind** (e.g., first-class AR tool). That is a platform wave — rare. Ordinary operational expansion must not require it.

---

## Future departments

Laundry, Security, Transportation, etc. compose existing or new catalog Experiences into new Areas — zero Facility Builder module work (`department-administration/06` affirmed).
