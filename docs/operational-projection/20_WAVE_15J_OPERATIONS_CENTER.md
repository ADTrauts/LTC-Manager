# 20 — Wave 15J Operations Center Cutover

Status: **implemented** (feature-flagged).  
Prior: Today's Work (15I).

---

## Projection integration path

```text
Trusted session / department lens
  → resolveSessionProjection({ purpose: OPERATIONS_CENTER })
  → adaptProjectionToOperationsCenter
  → ProjectedOperationsCenterScope
  → loadDashboardQueries({ projectedUnitIds })  // early scope
  → existing loaders + readiness + operation overlay
  → applyProjectedScopeToDashboard / call-down intersect
  → existing Operations Center UI (eligible cards only)
```

Package: `src/lib/operations-center/projection/`  
Server loader: `projection/load.ts` (import directly — not via `@/lib/operations-center` barrel)  
Page: `/dashboard`

---

## Operations Center adapter

`adaptProjectionToOperationsCenter` emits `ProjectedOperationsCenterScope`:

| Field | Role |
|-------|------|
| `facilityId`, `lensMode`, `lensKey`, `departmentKey` | Session lens |
| `departmentSections` | Labeled department contributions (Facility Overview) |
| `projectedUnitIds` / `projectedSpaceIds` | Location eligibility |
| `projectedAreaKeys` / `projectedExperiences` | Authored model |
| `experienceContributors` | Domains, tools, actions, readiness keys, contribution kinds |
| `queryScopesByDomain` | Domain → scopes |
| `allowedActions` / `destinationHandles` | Drill-downs (existing routes only) |
| `eligibleCardIds` | Which OC cards may render |
| `plantPolicy` | Plant provenance (`createsRoomAssignments: false`) |
| `diagnostics` / `performance` | Fail-closed + timing |

Does **not** interpret department strings or capability arrays. Consumes `ProjectionSnapshot` only.

---

## Experience contribution model

Contribution kinds are derived from Experience **contracts** (domains + tools + readiness signal keys + navigation):

- `readiness`, `outstanding_work`, `inspections`, `issues_repairs`
- `staffing`, `operations`, `compliance_logs`, `navigation`

OC cards map from kinds (not department switches):

| Card | Requires |
|------|----------|
| unit-exceptions | readiness / outstanding work / projected Units |
| open-repairs | `issues_repairs` |
| staffing-gaps / call-downs | `staffing` or `operations` |
| meal-boards | `operations` |
| compliance-summary / unit-log-board | `compliance_logs` or `inspections` |

Projection decides eligibility. Engines decide values. Empty Areas are suppressed.

---

## Department lens

- One projected department snapshot
- Only projected locations contribute operational data
- Only projected Experiences contribute cards/metrics
- No hardcoded Dietary / EVS / Plant branches in OC composition

---

## Facility Overview

Labeled composition of department projections (`departmentSections[].label`).

Never:

- flatten Experiences across departments
- merge readiness into unlabeled cards
- invent Facility Overview when Projection fails
- use Facility Overview as fallback for a missing department profile

Each department is scoped independently, then composed (Unit id union for aggregates; labels retained).

---

## Site Pulse

Composition unchanged. Input eligibility only:

- readiness / pulse counts use projected Units
- structural Floors/Neighborhoods may carry projected descendants via Projection tree
- no off-projection Unit contributes
- Facility Overview preserves department labels in scope

---

## Readiness overlay

Readiness remains engine-owned. Projection provides locations + readiness signal keys + lens.

On readiness failure (flag on): preserve projected shell; degrade Site Pulse; **never** broaden to all Units.

---

## Staffing / call-downs

- Schedule and override rows early-scoped (or intersected) to projected Units
- Call-downs contribute only when old/new Unit intersects projected scope
- Facility Overview keeps department staffing labeled in sections (UI not redesigned)
- Assignment summaries remain engine-owned

**Remaining broad query:** `loadCallDownList(facilityId)` still loads facility-wide, then intersects (documented for cleanup).

---

## Issues / repairs / assets / inspections / logs

Early `projectedUnitIds` on `loadDashboardQueries` for repairs, assets, PM, room status, logs.

Plant policy covers rooms without fake assignments. Plant does not receive Dietary meal or EVS cleaning Experiences.

No broad-then-hide department filtering when the flag is on.

---

## Operations Engine overlay

Current meal/service phase remains a live overlay on stable projected scopes.

Projection does **not** rebuild on meal period, issue mutations, log completion, or readiness changes.

---

## Morning Brief boundary

AI generation **unchanged** this wave.

- Existing `AI_BRIEF` flag + cache-peek / no SSR provider calls
- Brief is **not** rewired to projected OC scopes yet (would expand this milestone)
- Documented for the **AI Projection** wave

---

## Ordering and composition

| Owner | Owns |
|-------|------|
| Projection | Department order (FO), Area order, Experience order, card eligibility |
| Operations Center | Exception severity, urgency, density within a contribution |

Issue counts must not rewrite authored Area/Experience order.

---

## Navigation / drill-downs

Existing routes only (`/today`, `/today/walk`, `/today/coverage`, `/issues/[id]`, `/assets`, `/unit/[unitId]`, …).

Destination handles come from projected navigation where mapped; must stay within projected scope and RBAC.

---

## Feature flag / rollback

| Flag | Default | Behavior |
|------|---------|----------|
| `PROJECTION_OPERATIONS_CENTER_ENABLED` | **false** | Full legacy OC path |
| | true | Projection eligibility only; fail closed; **no union** |

Do **not** reuse `PROJECTION_TODAYS_WORK_ENABLED`.

---

## Failure behavior

Projection failure → calm “Operations Center unavailable”; safe chrome; **no** broad facility operational load; **no** Facility Overview fallback; structured diagnostics.

Partial engine failure → keep projected scope; degrade section only.

Empty Projection is valid (empty cards / zero counts).

---

## Legacy code retired (flag on)

- Capability / unit-type based card eligibility for OC display
- Broad facility Unit sets rendered under a department lens without Projection intersection
- Local department visibility switches for OC signal groups (replaced by contribution kinds)

## Legacy retained

- `loadOperationsCenterDashboard` / `loadDashboardQueries` / builders (scoped)
- Readiness, Operations Engine, call-down loader (intersect after)
- Flag-off full legacy path
- Morning Brief AI cache logic
- Shared dashboard query infrastructure

---

## Query / performance impact

1. One Projection Runtime resolve (`OPERATIONS_CENTER`)
2. One coordinated dashboard query pipeline with early `projectedUnitIds`
3. Parallel live overlays within scope (call-downs still broad → intersect)
4. Existing composition builders
5. Request-scoped memoization only (no Redis / materialized projections)

Measured on scope.performance: projection duration, dashboard query duration, composition duration, projected location/Experience counts.

---

## Known limitations

- Call-down list still facility-wide before intersection
- Morning Brief not yet Projection-scoped
- Facility Overview labels live in adapter/scope; OC UI not redesigned into department packs
- Birthdays / manager count remain facility-wide (secondary / onboarding chrome)

---

## Next wave

**Wave 15K — Business Workspace** Projection-scoped manager priorities — see [21_WAVE_15K_BUSINESS_WORKSPACE.md](./21_WAVE_15K_BUSINESS_WORKSPACE.md).
