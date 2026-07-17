# 09 — Rendering Pipeline

## Complete runtime (constitutional)

```text
1. Projection
     → Areas → Experiences → contract descriptors
     → query scopes, actions (narrowed), tool bindings, layout hints
     → immutable snapshot

2. Home Adaptation
     → purpose → density profile
     → select layout template + section allowlist
     → does not broaden Experiences

3. Experience Shell
     → for each projected Experience:
          resolve LayoutContract for density

4. Sections
     → ordered declared sections ∩ density allowlist
     → suppress empty

5. Cards
     → instantiate card declarations
     → bind overlay slots

6. Widgets
     → render widget kinds from registry
     → bind overlay data

7. Tools
     → Tool Host resolves bindings
     → tool UI inside TOOL_HOST cards

8. Runtime Overlay
     → parallel scoped engine fetches
     → fill slots; refresh independently of Projection

9. Rendered UI
     → Component Registry output
     → actions wired to server mutations
```

---

## Stage responsibilities

| Stage | May | Must not |
|-------|-----|----------|
| Projection | Emit descriptors/scopes | Emit React, fetch issues |
| Home Adaptation | Drop sections, choose density | Add Experiences/actions |
| Shell | Orchestrate layout | Own eligibility |
| Cards/Widgets | Display + local UX state | Bypass scopes |
| Tools | Capture/submit in scope | Become modules |
| Overlay | Supply live truth | Mutate Projection snapshot |
| Registry | Map keys → UI | Decide department visibility |

---

## Failure in the pipeline

- Projection fail → fail closed (no shell).  
- Overlay fail → card error/empty; shell remains.  
- Missing registry key → diagnostic placeholder; fail tests in CI for known Experiences.  
- Tool unavailable → suppress tool section; mark availability diagnostic.
