# 12 — Extension Model

## Decision

Future developers extend the platform through **declared seams**, not by editing Projection, Sidebar core, or Facility Builder.

---

## Extension seams

| Seam | How to extend | Touches Projection? |
|------|---------------|---------------------|
| **New Experience** | Catalog + composition declaration + permissions | No (generic emit) |
| **New Section key** | Section registry + chrome + density maps | No |
| **New Card kind** | Card registry + renderer | No |
| **New Widget kind** | Widget registry + renderer | No |
| **New Tool kind** | Tool host + bindings contract | No |
| **New Mount handle** | Mount registry (escape hatch) | No |
| **New Action category** | Action model + permission keys | No |
| **New Layout template** | Layout registry + home density map | No |
| **New overlay loader** | Overlay loader registry keyed by slot | No |
| **New engine adapter** | Domain layer | No |

---

## Extension workflow

```text
1. Propose keys in architecture / catalog PR
2. Implement registry renderers/loaders
3. Declare usage on Experiences
4. Tests: registry completeness, density maps, scope enforcement
5. Ship behind implementation-wave flags (when coding begins)
```

---

## What requires a platform architecture wave

- New **contract kind** on Projection snapshots.  
- New **home** / nav zone.  
- Changing fail-closed / permission intersection rules.  
- Plant policy semantics.

Ordinary Experiences must not require those.

---

## Anti-patterns

- `if (experienceKey === 'X')` in Projection or Sidebar.  
- Copy-paste page for one department.  
- Home-specific tool forks.  
- Admin-uploaded executable UI.
