# 11 — Runtime AI Integration

## Decision

**AI consumes Projection. AI never builds its own room or department context graph.**

Morning Brief, Shift Transition, Recovery Assistant, and future assistants receive a compact, labeled Projection-derived context package plus live engine overlays — the same eligibility truth as human surfaces.

---

## Why

If AI invents room context:

- it will disagree with Sidebar/Workspace;
- it may leak off-department Experiences;
- it reintroduces capability/heuristics drift;
- Recovery/Brief grounding becomes unauditable.

Projection is the constitutional answer to “what exists here for this department.”

---

## AI_CONTEXT purpose

```text
Projection purpose = AI_CONTEXT
  → compact snapshot:
      lens, areas, experiences, actionable location keys,
      query scope handles, provenance revisions
  → no live issue bodies, no PII beyond existing sanitizer rules
```

AI operational snapshot builders must:

1. resolve Projection for facility+department(+focus);
2. load live signals **only** through projected scopes;
3. sanitize via existing AI snapshot allowlists;
4. generate grounded text;
5. cache per existing Intelligence rules (facility+department+day, etc.).

---

## Moment placement (unchanged product model)

| Moment | Home | Projection role |
|--------|------|-----------------|
| Morning Brief | Operations Center (+ Workspace cache peek) | Site/department scopes for brief inputs |
| Shift Transition | Today's Work | Projected walk/coverage scopes |
| Recovery Assistant | Issue detail | Verify issue’s location+department still project; supply room Experience context |
| Future assistants | Existing homes only | Same rule — no AI chatbot zone |

Workspace remains **cache-peek only** for briefs — no generate/refresh from Workspace.

---

## Forbidden AI behaviors

- Building independent “all rooms of type Servery” graphs.
- Inferring Experiences from Unit type or legacy capabilities when ACTIVE profile exists.
- Inventing due times or work items.
- Broadening Facility Overview as fallback when Projection is empty.
- Treating AI cache as Projection cache.

---

## Knowledge + AI

Knowledge retrieval for assistants uses projected Knowledge tool/Experience scopes and existing associations. Assistants do not search the entire facility knowledge library unless Projection (and permissions) say the principal’s lens includes that department-wide Experience.

---

## Failure

If Projection cannot build for AI_CONTEXT: **do not generate**. Return safe empty/unavailable state consistent with fail-closed (`14`). Never “best effort all Units.”
