# 19 — Wave 15I Today's Work Cutover

Status: **implemented** (feature-flagged).  
Prior: Unit Workspace (15H).

---

## Integration path

```text
Trusted session
  → resolveSessionProjection({ purpose: TODAYS_WORK })
  → adaptProjectionToTodaysWork
  → projected Unit ids + Experience contributors
  → existing walk / coverage / call-down / handoff engines
  → filter to projected Units
  → assemble Experience ↔ walk contributions
  → Today's Work UI
```

Package: `src/lib/todays-work/projection/`  
Pages: `/today`, `/today/walk`, `/today/coverage`, `/today/handoffs`

---

## Projection adapter

`adaptProjectionToTodaysWork` emits:

- `projectedUnitIds` / `actionableUnitIds`
- Area → Experience contributors (tools, actions, domains, query-scope unit ids)
- Facility Overview labeled department sections
- Plant policy passthrough (never invents locations)

---

## Work assembly model

| Owner | Responsibility |
|-------|----------------|
| **Projection** | Locations, Experiences, actions, permissions, query scopes, Area order |
| **Engines** | Readiness, coverage, call-downs, repairs, inspections, assignments, operations |
| **Today's Work** | Merge + filter to projected Units; priority **within** Experience |

`filterWalkListToProjectedUnits` / coverage / call-downs / handoffs — never broaden.

`assembleExperienceWalkContributions` — attach ranked walk items to Experiences without reordering Experiences.

---

## Ordering

1. Operational Area order (Projection / ACTIVE Profile)
2. Experience order (Projection)
3. Within Experience: engine walk ranking (attention / readiness)

---

## Feature flag / rollback

| Flag | Default | Behavior |
|------|---------|----------|
| `PROJECTION_TODAYS_WORK_ENABLED` | **false** | Legacy only |
| | true | Projection eligibility only; fail closed; **no union** |

---

## Failure

Projection error → calm unavailable state. Never Facility Overview fallback. Never restore broad facility walk while flag is on.

---

## Legacy removed (flag on)

- Broad walk/coverage/handoff Unit sets without Projection intersection
- Today's Work deciding Experience eligibility independently

**Retained:** engine loaders (`loadWalkList`, etc.) as content sources; flag-off legacy pages; AI shift summary overlay on handoffs.

---

## Remaining compatibility

- Operation context banner still from engines
- Assignment fulfillment strip on coverage still department-scoped separately
- Experience contribution UI is assembly chrome; full Tool Host later
- Engines may still load facility-wide then filter (display never broadens)

---

## Next wave

**Wave 15J — Operations Center** Projection-scoped aggregates and labeled facility exception packs.
