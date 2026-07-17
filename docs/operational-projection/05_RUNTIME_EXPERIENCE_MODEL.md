# 05 — Runtime Experience Model

## Decision

Projection resolves and emits **Operational Areas → Experiences → tools**, matching Department Administration authorship. Consumers never regroup Experiences into Areas independently.

---

## Resolution spine

```text
Department (lens)
  → ACTIVE Operational Profile
    → Operational Areas (ordered)
      → Experiences (ordered, active)
        → tools / actions / query scopes / readiness keys / nav contributions
```

Per room:

```text
Room + Department
  → archetype (binding | Plant default | gap)
  → archetype Experience set + configuration
  → sparse exceptions
  → Area grouping (empty Areas dropped)
  → permission intersection
  → projected Experiences at that room
```

Department-wide Experiences (Menus, Recipes, department Knowledge library, staffing overview) attach at **department scope**, not forged onto every room.

---

## Experience descriptor (projected)

Each projected Experience carries:

```text
experienceKey          # catalog identity
areaKey                # owning Operational Area
departmentId / key
configuration          # effective merged config
tools[]                # in-Experience tools (log templates, forms, …)
actionKeys[]           # permission-narrowed
locationBindings[]     # physical nodes where active
queryScopeHandle
readinessSignalKeys[]
navigationContributions[]
workspaceHandles[]
sourceProvenance       # PROFILE | ARCHETYPE | ROOM_EXCEPTION | PLANT_POLICY_DEFAULT
```

Descriptors state what may be composed and loaded. UI components remain downstream.

---

## Experiences vs live domain objects

| Experience | Domain owner (live) |
|------------|---------------------|
| Meal Service | meal events / operation context |
| Temperature Monitoring | log submissions |
| Repairs / Work Orders | issues / repairs |
| Assets / PM | assets / schedules |
| Inspections | definitions / occurrences / submissions |
| Knowledge (tool) | knowledge articles + associations |
| Assignments (Experience) | operational assignments |

Projection activates the Experience and supplies scope. Engines own records.

---

## Tools

Tools are not top-level navigation peers. A temperature log is a tool inside Temperature Monitoring inside Food Safety. Projection may emit tool descriptors only under their Experience.

Legacy “Logs” / “Knowledge” modules migrate to tool or Experience placement per Department Administration constitution — Projection must not resurrect module-shaped top-level filtering.

---

## Capability supersession

Configurable capability arrays are **not** runtime operational truth once a department’s ACTIVE profile path is certified.

During migration:

- legacy capabilities may feed **shadow comparison** and one-way translation diagnostics;
- Projection runtime path reads Profiles;
- never dual-write Profiles back into capability arrays as permanent behavior.

---

## Unavailable Experiences

If an Experience’s product dependency is absent (flag off, domain unavailable):

- mark `unavailable` in diagnostics / descriptor state;
- do **not** silently enable a substitute;
- do **not** fall back to “all Experiences.”

---

## Facility lens

Facility mode keeps each Experience under its department and Area labels:

```text
Servery
  Dietary / Service / Meal Service
  EVS / Cleaning / Room Cleaning
  Plant / Preventive Maintenance / PM Schedules
```

No cross-department Experience merge.
