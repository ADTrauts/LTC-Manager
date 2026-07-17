# 05 — Experience Composition

## Decision

**The Experience owns its internal composition.**  
**Projection owns presence and scope.**  
**The Workspace/home owns persona-shaped density and layout chrome.**

```text
Who decides Overview → Equipment → Logs → Knowledge → AI → History?

  Experience catalog/runtime   declares section order and bindings
  Projection                   decides this Experience is present here for this user
  Workspace / home             chooses compact vs full density; never reorders meaning
  Engines                      fill live content into declared slots
```

---

## Composition pipeline

```text
1. Catalog declares anatomy + default section order
2. Profile may tune config/tools (not arbitrary section invention)
3. Projection emits ProjectedExperience with sections still declared
4. Home adapter:
     - filters sections by purpose density
     - suppresses empty optional sections
     - mounts components via mount handles
5. Each section loader uses query scopes + tool bindings
6. Overlay live engine state
```

---

## Example — Temperature Monitoring assembly

```text
Temperature Monitoring
  ↓ Overview card          (workspace contract: OVERVIEW)
  ↓ Current Status         (readiness + log due signals)
  ↓ Equipment list         (assets scoped to Experience)
  ↓ Outstanding Logs       (LOGS tool + incomplete submissions)
  ↓ Knowledge              (KNOWLEDGE tool associations)
  ↓ AI Summary             (optional AI contract; grounded)
  ↓ History                (recent submissions)
```

Department Administration does **not** author this page tree per facility. It enables the Experience and configures templates/thresholds. Composition stays product-stable.

---

## What Projection must not do

- Choose React components.
- Reorder Experience sections into a different product meaning.
- Merge two Experiences into one shell.
- Flatten Areas away (Areas remain the grouping spine).

## What Workspace must not do

- Add Experiences Projection omitted.
- Invent Temperature Monitoring sections ad hoc for Dietary only.
- Bypass query scopes when loading section data.

## What Experience must not do

- Fetch facility-wide unrelated domains.
- Render other Experiences’ shells inside itself (use relationship links instead).
- Own global navigation zones.

---

## Cross-Experience composition

Homes may show **multiple** Experience shells side by side (Unit Workspace) or **cards** (Business Workspace). That is home composition of Experiences — not one Experience owning another’s anatomy.

Related Experiences use soft links (`04` relationships), e.g. Meal Service → “Open Temperature Monitoring” when both project.
