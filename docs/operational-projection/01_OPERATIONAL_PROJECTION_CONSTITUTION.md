# 01 — Operational Projection Constitution

## Purpose

This constitution defines **Operational Projection** as the runtime operating system of LTC Manager. Every operational surface after Wave 15A is expected to consume Projection. No surface may reinvent department visibility, Experience eligibility, or location scope.

---

## What exactly is a Projection?

> **A Projection is a deterministic, read-only, ephemeral runtime snapshot that answers:**  
> *For this facility, department lens (or facility lens), principal, and surface purpose — which physical places are operationally relevant, which Operational Areas and Experiences are active there, what navigation and workspace composition they authorize, and which domain query scopes may load live data.*

A Projection:

- **derives** from authoritative upstream models;
- **persists nothing** as operational truth;
- **composes** every operational surface;
- **filters once** so components never filter again;
- **never duplicates** live operational state.

Projection is the **WHICH** layer in the five-layer stack:

```text
WHERE / WHO   Facility Builder
HOW           Department Administration (Operational Profile)
WHICH         Projection                         ← this constitution
WHAT          Operational Engines (live truth)
```

---

## Constitutional definition (formal)

```text
Projection(request) → immutable OperationalProjectionSnapshot

where request includes:
  facility, lens, principal, purpose, optional physical focus, optional operation context

and snapshot includes:
  projected location tree (actionable + structural)
  Operational Areas → Experiences (ordered, non-empty)
  navigation descriptors
  workspace composition handles
  Experience-specific domain query scopes
  provenance + diagnostics
  revision tokens for caching
```

The snapshot is **identity-preserving**: every projected node retains its Facility Builder physical identity. Projection never creates a second location ID, a `DepartmentLocation` table, or a foreign-key target.

---

## What is NOT Projection?

| Not Projection | Why |
|----------------|-----|
| Facility Builder | Owns physical truth and room↔department assignment |
| Operational Profile / Department Administration | Owns how a department operates; Projection only reads ACTIVE profiles |
| Experience Catalog | Platform governance of what Experiences exist |
| RBAC / route permissions | Authoritative authorization; Projection intersects, never replaces |
| Readiness | Live state: Ready / In Progress / Needs Attention |
| Operations Engine | Live bounded commitment (Breakfast / Lunch / …) |
| Work Engine / Tasks | Live assignable work dual-write substrate |
| Issues / Repairs / Assets / Inspections / Logs | Live domain records |
| Assignments | Live people placement for the day |
| AI Moments | Live or cached summaries of existing state |
| Preferences / layouts | User chrome — may order presentation, never broaden eligibility |
| UI components / Sidebar / Workspace | Consumers only |
| Persisted denormalized “DepartmentLocation” rows | Forbidden — creates stale second truth |
| A generalized rules/policy DSL | Forbidden — explicit profile + typed Plant policy is enough |

---

## Ownership rules

1. **Projection owns filtering.** Not components. Not Workspace. Not Sidebar. Not Locations. Not Today's Work. Not Operations Center. Not Knowledge browsers. Not module pages.
2. **Projection owns derivation only.** It never authors Experiences, never edits rooms, never mutates engines.
3. **Projection never owns live truth.** It may attach *handles* and *scopes* that loaders use to fetch live truth.
4. **Loaders enforce Projection scopes.** They do not invent alternate eligibility.
5. **Composition chooses among already-allowed descriptors.** Surfaces may rank, group for their purpose, or hide empty chrome — they may not add Experiences Projection omitted.
6. **Navigation renders Projection destinations.** It never grants access by showing a link.
7. **RBAC can only narrow.** Permissions never invent Experiences absent from the profile+room resolution.
8. **Facility Overview is labeled composition**, not a synthetic department and not an error fallback.

---

## Invariants

1. Deterministic for identical authoritative inputs and principal access class.
2. Physical identity never changes by department.
3. No hierarchy node is copied per department.
4. Vocabulary labels presentation; it does not change eligibility logic.
5. Only ACTIVE certified Operational Profiles drive Projection. Draft/CERTIFIED-but-inactive never do.
6. Experiences replace configurable capabilities as operational truth. Legacy capability arrays are migration inputs only.
7. Projection resolves **Department → Operational Area → Experiences**.
8. Empty Areas are suppressed.
9. Staged Units and undesignated rooms never appear.
10. Plant facility-wide coverage is policy-derived — never copied room assignments.
11. Assignments may prioritize presentation; they never broaden department location eligibility.
12. AI consumes Projection; AI never builds independent room context.
13. Fail closed: repository failure does not fall back to “all locations.”
14. Existing Unit IDs and routes remain compatibility anchors throughout migration.

---

## Manager mental model

A Director understands:

> “I configured how Dietary works in Department Administration. When I open the floor, Projection shows me only the places and work areas Dietary actually runs — organized the way I set them up.”

They should never need to understand cache keys, query scopes, or capability strings.

---

## Projection mental model (engineering)

```text
Authoritative inputs (slow-changing)
        ↓
Projection Platform (derive once)
        ↓
Surface adapters (purpose-shaped views)
        ↓
Live engines (overlay current truth onto projected scopes)
```

If a new feature asks “where should we filter by department?”, the answer is always: **in Projection**, then consume.

---

## Supersession

This constitution **supersedes** capability-as-truth in `docs/location-projection/` for operational inputs. It **retains** that package’s engine boundary, pruning, security posture, Plant-without-copied-rows, and consumer migration discipline.
