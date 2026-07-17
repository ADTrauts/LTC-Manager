# 12 — Runtime Query Strategy

## Decision

Projection emits **Experience-specific domain query scopes**. Loaders enforce those scopes. Prefer one Projection resolve per request, then parallel scoped domain queries — not one mega-query that returns unrelated departments’ worlds.

---

## Query scope contract

```text
OperationalQueryScope
  unitIds
  spaceIds
  byExperience[experienceKey] → { unitIds, spaceIds, departmentId, config }
  byDomain[domain] → { unitIds, spaceIds, departmentId, constraints }
```

Examples:

- Meal Service → Dietary meal records for Servery (and linked Units).
- Cleaning Logs → EVS rooms with Cleaning Logs Experience.
- Preventive Maintenance → Plant PM via Plant scopes (policy-covered spaces + assets).
- Knowledge → department articles + room associations in scope.
- Repairs → department-responsible issues within projected locations.

Domain ownership does not transfer. Scope only decides relevance.

---

## Preferred request strategy

```text
1. Resolve Projection snapshot (L0/L1/L2 cache)
2. Fan out N scoped domain queries in parallel
3. Compose surface view model
4. Overlay readiness / operation
```

### One query? Two? Cached?

| Approach | Verdict |
|----------|---------|
| Single SQL join inventing eligibility | **Rejected** — duplicates Projection rules in SQL |
| Broad fetch all facility domains then filter in JS | **Rejected** as primary — today’s drift source |
| **One Projection source load + pure resolve + N scoped queries** | **Preferred** |
| Cached Projection + scoped queries | **Preferred at scale** |
| Materialized Projection tables | Deferred — only if proven necessary |
| Lazy Experience panels | Allowed: resolve Projection first; defer domain fetch until panel open **within** scopes |

---

## Loader migration rule

Every migrated loader accepts an explicit scope (or Projection snapshot handle). Loaders may:

- intersect additional safety filters (facilityId, tenancy);
- reject empty/missing scope (fail closed);

Loaders may not:

- expand unitIds/spaceIds beyond Projection;
- ignore department lens;
- reintroduce capability string interpretation as eligibility once profile path is active.

---

## Shadow mode

During migration, dual-run:

```text
legacyScope vs projectionScope
→ compare IDs / counts / diagnostics
→ never serve union to clients
```

Serve Projection only when flag enabled and parity acceptable.

---

## Module pages (Assets, Repairs, Knowledge, Assignments)

Module routes remain, but list/detail queries take Projection scopes for the active lens. This removes “Assets shows everything while Dietary lens is active” contradictions without deleting routes.
