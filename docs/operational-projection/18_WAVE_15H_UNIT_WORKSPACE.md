# 18 — Wave 15H Unit Workspace Cutover

Status: **implemented** (feature-flagged).  
Prior: Locations (15F), Sidebar (15G).

---

## Integration path

```text
Trusted session + /unit/[unitId]
  → resolveSessionProjection({ purpose: UNIT_WORKSPACE, focus: UNIT })
  → ProjectionSnapshot
  → adaptProjectionToUnitWorkspace(unitId)
  → Area → Experience panels
  → ProjectedUnitWorkspaceBody (existing Unit Workspace chrome)
```

Package: `src/lib/unit-workspace/projection/`  
Page: `src/app/(protected)/unit/[unitId]/page.tsx`  
UI: `src/components/unit-workspace/projected-experience-panels.tsx`

---

## Workspace adapter

`adaptProjectionToUnitWorkspace`:

- Collects location ids for the focus Unit (UNIT + SPACE children).
- Keeps Experiences whose `locationIds` or query scopes hit that Unit.
- Groups into Areas from the snapshot (Profile order).
- Suppresses empty Areas.
- Emits tools (registry), actions (permission-narrowed), status keys, density.
- Facility Overview → labeled department sections (never flattened).

Workspace does **not** filter departments, interpret Plant, or invent Experiences.

---

## Area / Experience / tool rendering

| Layer | Behavior |
|-------|----------|
| Operational Area | Section header; Profile order |
| Experience | Panel: title, description, status keys, tools, actions, placeholder body |
| Tools | Embedded entry chips (Logs, Knowledge, Forms, Tasks, Records) — not top-level pages |
| Actions | Labels from contracts ∩ `allowedActionKeys` |

No Experience Shell / Tool Host in this wave.

---

## Legacy removal (flag on)

When `PROJECTION_UNIT_WORKSPACE_ENABLED=true`:

- Does **not** call `loadUnitWorkspace` (no broad module composition).
- Does **not** show Workspace / Logs top tabs as module roots.
- Does **not** mix legacy panels with projected Experiences.

When flag **off** (default): exclusive legacy Unit Workspace unchanged.

---

## Feature flag / rollback

| Flag | Default | Behavior |
|------|---------|----------|
| `PROJECTION_UNIT_WORKSPACE_ENABLED` | **false** | Legacy only |
| | true | Projection only; fail closed; no union |

---

## Failure

Projection error or Unit not in projection:

- Calm “Workspace unavailable” state.
- Never restore legacy modules while the flag is on.

---

## Remaining compatibility

- Route `/unit/[unitId]` unchanged (no room routes).
- Operation / readiness live overlays not fully re-attached in Projection mode (header is orientation-only); engines remain for legacy path and later overlay waves.
- Experience runtime bodies are placeholders until Tool Host / Experience Shell waves.
- `loadUnitWorkspace` retained for flag-off and regressions.

---

## Performance

- One `UNIT_WORKSPACE` resolve with request-scoped memo.
- Shared `resolveSessionProjection` with Locations/Sidebar (purpose/focus differ in memo key).
- No second eligibility pass; no legacy broad load when flag on.

---

## Next steps

- Wave **15I — Today's Work** Projection ranking.
- Re-attach readiness / operation overlays onto projected panels.
- Wire tool chips to existing loaders via query scopes (still no Tool Host redesign).
