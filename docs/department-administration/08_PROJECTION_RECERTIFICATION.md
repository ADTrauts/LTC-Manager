# 08 — Projection Recertification

## Why re-evaluate Projection

The prior projection design resolved:

```text
Department → Experiences → Workspace
```

Now that Operational Areas exist, the question is whether Projection should resolve:

```text
Department → Operational Area → Experiences → Workspace
```

This document is opinionated. It recommends the second, and specifies exactly what changes and what does not.

## Opinion: yes, Projection should resolve through Operational Areas

**Projection must resolve Department → Operational Area → Experiences → Workspace.**

Reasons:

1. **The Operational Area is now the manager's mental model.** If Projection skips the area, every consuming surface has to re-group Experiences on its own, and grouping logic leaks into Sidebar, Workspace, and Today's Work independently — guaranteeing divergence. Resolving through the area produces one authoritative grouping.
2. **The profile is authored in areas.** Department Administration organizes Experiences into areas. Projection should preserve that structure end-to-end, not flatten it and force downstream reconstruction.
3. **Navigation stability comes from areas.** Areas are stable; Experiences churn. A projection keyed on areas gives the Sidebar a stable spine.
4. **Empty-area suppression is a projection concern.** Whether an area appears at all depends on whether any of its Experiences project into the current context — exactly the kind of derivation Projection owns.

## What Projection now consumes

Projection reads the certified **Operational Profile** (`05`). It no longer interprets raw capabilities, and it does not re-derive the department model. Its inputs:

```text
Facility Builder:   the physical room + its classification + department assignment
Operational Profile: Areas → Experiences → Archetype behavior
Employee access:     which Experiences this user may see/act on
Operational state:   optional gating (e.g., an Experience inactive right now)
```

## The recertified resolution pipeline

```text
1. Resolve context
     room, department, user, time

2. Confirm ownership
     is this department assigned to this room?  (Facility Builder)

3. Resolve archetype
     room classification → department archetype  (Operational Profile)

4. Resolve active Experiences
     archetype's Experiences ∩ user access ∩ operational state

5. Group by Operational Area
     attach each surviving Experience to its area
     drop areas with no surviving Experiences

6. Emit projection
     Department
       → Operational Areas (non-empty, ordered)
           → Experiences (active, ordered)
               → workspace scope handles
```

The output is an **Operational Area-structured projection**: a department with its visible areas, each containing its visible Experiences, each pointing at the domain scope a workspace will render.

## Why this makes Projection simpler, not more complex

Adding a layer usually adds complexity. Here it removes it:

- **Before:** Projection resolved a flat Experience list and every consumer invented its own grouping. Grouping logic was duplicated and inconsistent.
- **After:** Projection resolves the grouping once, from the authored profile. Consumers render what they are given. The grouping rule lives in exactly one place.

Projection also stops interpreting capabilities entirely. The profile hands it resolved Experiences already assigned to areas; Projection filters by room, archetype, access, and state, then emits. The heavy "what does this department mean" work moved up into Department Administration, where it is authored once.

## Consumer impact (reference only — not implemented here)

- **Sidebar** renders Operational Areas as its top grouping, Experiences beneath. Modules disappear from navigation.
- **Workspace** opens at an Experience within its area context.
- **Today's Work / Operations Center** aggregate across areas but can still label work by area, giving managers their mental model in operational views.

## Boundary reaffirmed

Projection still owns only derivation:

- It decides **where/when/for whom** an area and its Experiences appear.
- It does **not** decide what the department does (that is the profile).
- It does **not** own live truth (that is the engines).
- It persists nothing operational.

## Recertification verdict

The projection model is **recertified with one structural change**: resolve through Operational Areas. This is a net simplification — grouping is authored once and derived once — and it keeps every ownership boundary intact. Projection implementation remains paused per the constraints of this package.
