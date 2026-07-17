# 17 — Wave 16A Experience Shell & Tool Host Foundation

Status: **implemented** (feature-flagged).  
Prior: Projection consumer cutovers (15F–15K).

---

## Goal

Reusable Experience runtime:

```text
Projection → Experience Shell → Sections → Cards → Widgets → Tool Host
                ↑
         Runtime overlays (separate; empty in 16A)
```

No Temperature Monitoring / Cleaning / Meal Service product UI.  
No module pages. Shell only.

---

## Experience Shell

Package (pure): `src/lib/experience-shell/`  
React surface: `src/components/experience-shell/`

`ExperienceShell` provides:

- Header (label, description, status chips, header actions)
- Section renderer (contract order)
- Card renderer (generic kinds)
- Widget renderer (descriptor + overlay slot)
- Tool Host embed
- Loading / empty / unavailable / unknown-component placeholders
- Extension via Component Registry (not switch statements)

---

## Tool Host

Supported kinds (embedded placeholders): LOGS · KNOWLEDGE · FORMS · TASKS · RECORDS.

Tool Host owns presentation chrome. No navigation to `/logs` etc. Real tool UIs attach in later waves.

---

## Component Registry

`resolveComponentRenderer(kind)` maps:

- `section:*` → DefaultSection  
- `card:*` → DefaultCard  
- `widget:*` → DefaultWidget  
- `tool:*` → DefaultToolHost  
- unknown → UnknownPlaceholder (never crash)

Overrides available for tests / future specialized widgets (`registerComponentOverride`).

---

## Projection integration

Unit Workspace Projection panels (Wave 15H) remain the eligibility source.

When `EXPERIENCE_SHELL_ENABLED=true` **and** Unit Workspace Projection is on:

- each projected Experience renders via `ExperienceShell`
- contracts drive sections/cards/widgets/tool hosts
- Projection-narrowed `allowedActionKeys` still apply

When shell flag is off: legacy placeholder panels unchanged.

Today’s Work / Operations Center / Business Workspace: **no UI changes** this wave — shell is available for future reuse.

---

## Placeholder strategy

- Experiences not yet implemented → complete shell + placeholder body line  
- Missing registry key → amber unknown-component placeholder  
- Overlay unbound → “Awaiting runtime overlay”  
- Unknown Experience key → unavailable state  

No broken layouts.

---

## Feature flag

| Flag | Default | Behavior |
|------|---------|----------|
| `EXPERIENCE_SHELL_ENABLED` | **false** | Legacy UW Projection placeholders |
| | true | Experience Shell for projected Experience panels |

No mixed rendering within a request.

---

## Performance

- One `resolveExperienceShellModel` per Experience (pure, sync)
- No per-widget network
- Overlays deferred (empty in 16A)
- Request memoization remains Projection’s concern

---

## Remaining work (Wave 16B+)

- Experience-specific widget implementations (Temperature, Cleaning, …)
- Live overlay loaders bound to Projection query scopes
- Rich Tool Host capture/list UIs
- Wire shell densities into OC / Today / BW cards
- Mount-handle specialized panels where certified

---

## Tests

`src/lib/experience-shell/experience-shell.test.ts` — shell model, registry, flag, overlays, home adaptation, unknown/loading.
