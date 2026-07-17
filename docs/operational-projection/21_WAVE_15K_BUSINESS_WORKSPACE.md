# 21 — Wave 15K Business Workspace Cutover

Status: **implemented** (feature-flagged).  
Prior: Operations Center (15J).

---

## Projection integration path

```text
Trusted session / active lens
  → resolveSessionProjection({ purpose: BUSINESS_WORKSPACE })
  → adaptProjectionToBusinessWorkspace
  → ProjectedBusinessWorkspaceScope
  → loadBusinessWorkspaceInputs({ projectedUnitIds })  // early scope
  → intersectInputsToProjectedScope
  → resolveProjectedCompositionConfig
  → existing pure builders + preferences
  → existing Business Workspace UI
```

Package: `src/lib/business-workspace/projection/`  
Server loader: `projection/load.ts` (import directly — **not** via `@/lib/business-workspace` barrel)  
Page: `/workspace`

---

## Workspace adapter

`adaptProjectionToBusinessWorkspace` emits `ProjectedBusinessWorkspaceScope`:

| Field | Role |
|-------|------|
| `departmentSections` | Labeled Facility Overview contributions |
| `projectedUnitIds` / `projectedSpaceIds` | Location eligibility |
| `managerSignalContributors` | Domains, tools, actions, contribution kinds |
| `allowedQuickActionIds` | Quick Action eligibility |
| `showLogCompletion` / `showMealContext` | Performance / meal chrome |
| `plantPolicy` | Plant provenance (`createsRoomAssignments: false`) |
| `diagnostics` / `performance` | Fail-closed + timing |

Consumes `ProjectionSnapshot` only — no capability arrays, Unit types, or hardcoded department module lists as eligibility.

---

## Manager Focus contribution model

Projection decides which signal families may contribute (`staffing`, `inspections`, `issues_repairs`, `operations`, `compliance_logs`, …).

Existing `buildManagerFocus` ranks live problems inside already-scoped inputs.

Department copy registries remain presentation-only.

---

## Agenda / Quick Actions / Health / Performance / Activity

| Section | Projection role | Engine / builder role |
|---------|-----------------|------------------------|
| Agenda | Eligible Experiences/locations via scoped inputs | Facility-time buckets unchanged |
| Quick Actions | `allowedQuickActionIds` from Experience contracts | Role filter (supervisor subset) |
| Department Health | Projected department keys + Units | Readiness summarize |
| Performance | `showLogCompletion` + scoped counts | Existing metric math |
| Recent Activity | Department + kind intersection | Bounded sort |

Compatibility route mappings (e.g. `/assets`, `/evs`) are marked on destination handles when Experience destinations are not yet Tool Host–backed.

---

## Today’s Work / OC links

Shared home links remain when composition config includes them. Destinations are existing routes only; Workspace does not invent location eligibility.

---

## Cached Morning Brief boundary

AI generation **unchanged**. Workspace remains cache-peek only.

When Projection is on:

- Facility Overview → brief suppressed
- Department lens → peek only when cache matches projected department

Full AI Projection scoping deferred.

---

## Facility Overview / Plant / Preferences / Permissions

- FO: labeled `departmentSections`; no flatten; no FO failure fallback
- Plant: policy from Projection only; no meal/EVS cleaning signals
- Preferences: reorder/hide allowed sections only; never broaden
- RBAC unchanged (Supervisor limited sections; Staff/Lead denied)

---

## Feature flag / rollback

| Flag | Default | Behavior |
|------|---------|----------|
| `PROJECTION_BUSINESS_WORKSPACE_ENABLED` | **false** | Full legacy pipeline (`scopeInputsForContext`) |
| | true | Projection eligibility only; fail closed; **no union** |

Do **not** reuse OC or Today's Work flags.

---

## Failure

Projection error → calm “Workspace unavailable”; **no** broad facility load; **no** Facility Overview fallback.

Empty Projection is valid (calm healthy/configuration guidance via existing builders on empty inputs).

---

## Legacy retired (flag on)

- `scopeInputsForContext` as eligibility source
- Department-key `COMPOSITIONS` quick-action / metric eligibility
- Broad readiness/location sets without Projection intersection

## Legacy retained

- Pure builders, preference composition, WorkspaceContext labels/copy
- Flag-off full pipeline
- Compatibility route mappings
- Shared dashboard query helpers

**Remaining broad queries:** knowledge activity still facility-wide then department-filtered; null-unit inspections loaded then intersected.

---

## Query / performance

1. One Projection Runtime resolve  
2. One coordinated Workspace input pipeline with early `projectedUnitIds`  
3. Existing pure builders  
4. Request memoization only  

---

## Known limitations

- Knowledge activity not early Unit-scoped
- Morning Brief not Projection-scoped beyond lens match
- Experience destinations still compatibility-mapped to module routes

---

## Next consumer wave

Supporting module cutovers, Experience Shell / Tool Host, or **AI Projection** (Morning Brief scopes).
