# 11 — Runtime Overlay Model

## Decision

**Projection snapshots are immutable for a resolve.** Live operational truth attaches through a **Runtime Overlay** bound to declared slots — never by mutating Projection.

---

## What enters via overlay

| Domain | Overlay role |
|--------|--------------|
| **Assignments** | Rank/highlight work; never broaden eligibility |
| **Readiness** | Status chips / aggregate state |
| **Operations** | Current commitment labels / time window |
| **Issues / Repairs** | Open items in Experience scope |
| **Assets** | Equipment lists/condition in scope |
| **Knowledge** | Article previews for tool bindings |
| **Logs** | Due/complete submissions |
| **Tasks** | Work Engine projections |
| **Inspections** | Occurrence/submission state |
| **AI** | Cached/generated summaries for AI slots |
| **Metrics** | Fact values for metric widgets |

---

## Attachment model

```text
ProjectionSnapshot (immutable)
  Experience
    Card/Widget
      overlaySlotId → OverlayBinding
            loaderKey
            queryScopeHandle
            refreshPolicy

RuntimeOverlay
  values[overlaySlotId] = LivePayload | Loading | Error
```

Shell merges: `viewModel = declare(Projection) + overlay.values`.

---

## Refresh without Projection rebuild

Per `docs/operational-projection/09`:

- Structural changes → rebuild Projection.  
- Live record changes → refresh overlay slots only.  
- Overlay fetch always constrained by Projection scopes.

---

## Forbidden

- Writing readiness into the Projection object.  
- Overlay fetch using “all facility units” when scope is narrow.  
- Treating AI cache as Projection cache.  
- Client forging overlay payloads to reveal hidden Experiences.
