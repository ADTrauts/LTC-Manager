# 03 — Projection Pipeline

## Overview

```text
Persistence adapters
        ↓
Normalize physical graph
        ↓
Select lens
        ↓
Resolve department scope (assignment + Plant policy)
        ↓
Resolve active Operational Profiles
        ↓
Resolve room archetypes + Experiences (Area-structured)
        ↓
Intersect principal permissions
        ↓
Mark actionability + prune structural tree
        ↓
Build query scopes + navigation + workspace handles
        ↓
Emit snapshot + diagnostics
        ↓
Surface adapters → live engine overlays
```

The pipeline is pure after source load. Side effects belong only in adapters (DB read) and consumers (DB read of live truth).

---

## Stage 0 — Load ProjectionSource

Batched repository read:

- facility + vocabulary;
- Units (floors, neighborhoods, legacy) + UnitSpaces;
- room↔department assignments;
- ACTIVE profiles (+ area/experience/archetype/binding/exception graphs);
- Plant policy constant/version;
- principal Unit access set;
- revision tokens.

Exclude staged Units and undesignated rooms from operational eligibility at the adapter using the shared operational visibility predicate.

Prefer **one coordinated source query family** per request (or cache hit), not N per surface.

---

## Stage 1 — Normalize physical graph

- Index by physical key.
- Connect Floor → Neighborhood → Room (and LEGACY compatibility nodes).
- Reject cycles/orphans from operational output (diagnose).
- Attach vocabulary labels for presentation only.

---

## Stage 2 — Select lens

- **DEPARTMENT:** resolve one entitled department; load its ACTIVE profile.
- **FACILITY:** for each active operational department with an ACTIVE profile, run stages 3–7 independently; compose labeled results.

No ACTIVE profile → empty department contribution + diagnostic (`PROFILE_INACTIVE_OR_MISSING`).

---

## Stage 3 — Resolve department physical scope

For each placed, active room:

```text
include if:
  (room assigned to this department via Facility Builder)
  OR (department is Plant AND plant facility-wide policy covers the room)
```

Plant policy coverage:

- room is placed and active;
- not staged/undesignated;
- policy does **not** create `UnitSpaceResponsibility` rows;
- direct archetype bindings take precedence when present;
- unbound covered rooms use policy `defaultArchetypeKey` (e.g. `serviceable_space`);
- Experiences granted are only those present in the Plant ACTIVE profile.

Principal Unit/PIN access then **narrows** the included set. It never adds rooms.

---

## Stage 4 — Resolve Areas → Experiences per room

For each in-scope room:

```text
1. Resolve Department Room Archetype
     direct binding → else Plant default archetype → else configuration gap
2. Resolve Experiences via profile semantics
     (equivalent to resolveDepartmentRoomProfile)
3. Apply sparse room exceptions
4. Group by Operational Area; drop empty Areas
5. Attach department-wide Experiences at department scope (not every room)
```

Missing archetype on an assigned room → room may appear as a **configuration gap** diagnostic node for admin surfaces; operational homes treat it as non-actionable unless policy/profile says otherwise. Never guess Experiences from legacy capabilities at runtime once profile path is certified for that department.

---

## Stage 5 — Intersect principal permissions

For each Experience / action / navigation contribution:

```text
keep if Experience remains after Stage 4
AND principal has required route/action permissions
AND domain entitlement rules pass
```

Permissions may remove Experiences, tools, or actions. They may **never** add Experiences the profile did not activate.

Hidden Experiences stay hidden. Projection must not emit descriptors for Experiences the principal cannot use, then rely on UI to hide them.

---

## Stage 6 — Actionability and structural pruning

- Node is **ACTIONABLE** if ≥1 Experience survives for this lens+principal.
- Retain physical ancestors as **STRUCTURAL**.
- Remove empty branches.
- Floors/Neighborhoods never gain work controls merely by being visible.

---

## Stage 7 — Query scopes, navigation, workspace handles

Each Experience contributes:

- domain query constraints (unitIds / spaceIds / departmentId / config);
- readiness signal keys (evaluation remains Readiness engine);
- navigation contributions;
- workspace mount handles;
- allowed action keys.

Projection **assembles**; Experience contracts **define** scope rules. Projection does not invent Meal vs PM semantics.

---

## Stage 8 — Diagnostics

Always emit:

- missing ACTIVE profile;
- assigned rooms without archetypes;
- unknown Experience keys (should be impossible post-certification);
- Plant policy applied count;
- assignments pointing outside projected scope;
- principal empty result reasons.

Diagnostics are for logs, tests, and Department Administration — not operational queues.

---

## Where filtering happens (authoritative)

| Layer | Allowed |
|-------|---------|
| Projection pipeline | **Decide** eligibility, Experiences, scopes |
| Loaders | **Enforce** supplied scopes |
| Composition | Choose among allowed descriptors for surface purpose |
| Navigation | Render allowed destinations |
| Components | Display only |

If a component contains `if (department === 'DIETARY')` for visibility of whole Experiences, that logic is illegal after migration and must move upstream or be deleted.
