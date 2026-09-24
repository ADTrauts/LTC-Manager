# Development Standards

**Status:** Binding for all implementation waves  
**Date:** 2026-07-07  
**Applies to:** `ltc-manager/` application code

These rules govern every code change during modernization. Certified planning documents define **what** to build; this document defines **how** to build it without destroying working production behavior.

---

## Core principles

### 1. Preserve existing functionality unless intentionally replaced

- **Production-ready** features ([04-existing-features.md](../architecture-review/04-existing-features.md)) must continue to work after every wave unless the wave explicitly replaces them with certified behavior.
- When replacing behavior (e.g., Dashboard → Operations Center), provide **equivalent or better** access to the same data and actions.
- Deprecate URLs with redirects — do not break bookmarks without announcement.

### 2. No duplicate implementations

- **One source of truth** per domain operation. Extend existing server actions and lib modules; do not copy-paste parallel logic.
- Example: readiness computation lives in `src/lib/readiness/` — not reimplemented in dashboard and sidebar separately.
- Example: Task sync (Wave 7) uses adapters — logs page does not maintain separate task creation logic.

### 3. Prefer modernization over rewrites

- **ADL-001:** No greenfield rewrite. Incremental refactor only.
- Change the minimum surface to meet certified references.
- A 200-line targeted refactor beats a 2000-line replacement.

### 4. Reuse existing components where possible

- Extend `app-shell.tsx`, `left-sidebar.tsx`, `drawer.tsx`, existing form patterns.
- Match styling conventions: Tailwind v4, square/rounded-md tabs (see `AGENTS.md` assets sub-tab note).
- New shared components go in `src/components/` with clear names (`readiness-chip.tsx`, not `NewChip_v2`).

### 5. Refactor incrementally

- One wave may contain multiple commits, but each commit should be **reviewable and revertible**.
- Schema changes in dedicated commits separate from UI wiring when possible.
- Feature flags for half-complete backend work — do not expose broken UI.

### 6. One feature per commit

Each commit should represent **one logical change**:

| Good | Bad |
|------|-----|
| `feat(nav): add Operations Center zone label` | `feat: wave 1 everything` |
| `feat(readiness): add blocked rule for failed logs` | `fix: misc cleanup and nav and dashboard` |

Commit message format:

```
type(scope): imperative summary

Optional body: why, not what. Reference wave number.
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### 7. Every wave ends with validation

- Complete wave-specific checklist from [03_REGRESSION_PROTECTION.md](./03_REGRESSION_PROTECTION.md)
- Global workflows G-01–G-10 must pass
- Do not mark wave complete with known regressions in critical paths

### 8. Documentation updated after implementation

- Update [07_PROJECT_STATUS.md](./07_PROJECT_STATUS.md) on wave completion
- Update [02_CODEBASE_MAPPING.md](./02_CODEBASE_MAPPING.md) if new routes/models added
- **Do not** create new planning/philosophy docs — only implementation program maintenance
- Inline code comments only for non-obvious business rules (see user code principles)

---

## Architecture standards

### Monolith and patterns (ADL-009)

| Pattern | Standard |
|---------|----------|
| Data fetching | Server Components + Prisma in page or lib |
| Mutations | Server Actions in co-located `actions.ts` |
| Validation | Zod at action boundary |
| Auth | Check role in action + rely on `proxy.ts` for routes |
| Tenancy | Always filter by `facilityId` from session until Wave 11 |

### Domain anchors (ADL-002, ADL-003, ADL-007)

| Concept | Rule |
|---------|------|
| Unit / Location | UI says Location; code uses `Unit` until deliberate migration |
| Facility / Site | UI may say Site; code uses `Facility` until Wave 11 |
| Logs | Keep LogTemplate → LogSubmission pipeline; extend, do not replace |
| Repairs | Extend toward Issue (ADL-008); no big-bang rename |

### Database (Prisma)

- **Never edit applied migrations** — forward-only new migrations
- **Never suggest `prisma migrate reset`** on shared/production databases
- After schema change: `prisma generate` + restart dev server
- Menu reads: use `loadFacilityMenuData` from `menu-db.ts` (see AGENTS.md)
- Scope new unique constraints per `facilityId` when adding codes (learn from global `assetCode` debt)

### API routes

- Prefer Server Actions for app mutations
- API routes only for: auth, onboarding, billing, webhooks, file streaming, external integrations (AI)
- New REST endpoints require justification in wave completion report

---

## UI / UX standards

Implementation must conform to certified references:

| Concern | Authority |
|---------|-----------|
| Navigation zones | [01_NAVIGATION_SYSTEM.md](../product-reference/01_NAVIGATION_SYSTEM.md) |
| Manager home | [02_OPERATIONS_CENTER_REFERENCE.md](../product-reference/02_OPERATIONS_CENTER_REFERENCE.md) |
| Floor workspace | [03_UNIT_WORKSPACE_REFERENCE.md](../product-reference/03_UNIT_WORKSPACE_REFERENCE.md) |
| Supervisor | [04_SUPERVISOR_REFERENCE.md](../product-reference/04_SUPERVISOR_REFERENCE.md) |
| Design decisions | [09_DESIGN_PRINCIPLES.md](../product-reference/09_DESIGN_PRINCIPLES.md) |

**UX rules:**

- **Exceptions first** — problems before completeness
- **One screen, one decision** — primary question obvious
- **Floor ≠ office** — PIN users get less chrome, not broken features
- **No dead ends** — every state offers next action or back
- **Context travels** — drill-down preserves operation, location, date

---

## Security standards

- Preserve existing auth: JWT email sessions, PIN HMAC, device binding, rate limits
- Every server action: verify session + role + facility scope
- Do not expose cross-facility IDs in URLs without scope check (critical for Wave 11)
- Do not commit secrets, `.env`, API keys
- AI prompts (Wave 10): no employee PII without explicit policy; log redacted audit

---

## Testing standards

| Layer | Expectation |
|-------|-------------|
| Unit tests | Required for pure logic: readiness rules, routing, permissions, adapters |
| Existing tests | Must pass: `route-permissions.test.ts`, `credential-policy.test.ts` |
| Integration | Manual wave checklists mandatory |
| E2E | Add when stable surface (post Bundle A); not required every wave |

New lib modules (`readiness/`, `work/`, `operations/`) ship with unit tests for business rules.

---

## Performance standards

- Dashboard and sidebar aggregations: avoid N+1 — batch queries or single raw SQL when needed
- Page load: target &lt; 3s on seeded facility for Operations Center and Unit Workspace
- Background jobs (Wave 6+): must not block request path
- AI calls (Wave 10): async, non-blocking, timeout with fallback

---

## Copy and terminology (ADL-006)

| Layer | Language |
|-------|----------|
| New UI copy | Neutral: site, location, operation, issue, food service |
| Existing Prisma enums | Do not rename until scheduled migration |
| Legacy labels | Update in UI during waves 1–2 where low risk |
| LTC-specific HR | Keep on employee admin until industry pack (Wave 12) |

---

## File organization standards

| Add | Location |
|-----|----------|
| Domain logic | `src/lib/{domain}/` |
| Shared UI | `src/components/` |
| Feature-specific UI | Co-locate in route folder if not reused |
| Types | Co-locate or `src/lib/{domain}/types.ts` |
| Tests | Adjacent `*.test.ts` or `__tests__/` |

Do not create `services/` folder — domain logic stays in `src/lib/` per existing convention.

---

## Git and PR standards

- One wave per PR when possible; large waves split by sub-milestone (7a, 7b)
- PR description: wave number, certified refs, validation checklist status
- No force push to main
- User must request commits — agent does not commit unless asked (user rule)
- Tag milestone after merge per [04_RELEASE_STRATEGY.md](./04_RELEASE_STRATEGY.md)

---

## Anti-patterns (do not)

| Anti-pattern | Why |
|--------------|-----|
| New parallel log system | ADL-007 violation |
| Module-first nav | Violates Product Reference |
| Hardcode new department keys | Blocks Wave 12 |
| `organizationId` on every table before Wave 11 plan | ADL-004 violation |
| Microservice extraction | ADL-009 violation |
| Skip regression checklist | Breaks live facilities |
| Planning docs during implementation | Planning phase closed |

---

## Wave completion definition

A wave is **complete** when:

1. All acceptance criteria in [01_MODERNIZATION_ROADMAP.md](./01_MODERNIZATION_ROADMAP.md) met
2. Validation checklist in [03_REGRESSION_PROTECTION.md](./03_REGRESSION_PROTECTION.md) signed off
3. [07_PROJECT_STATUS.md](./07_PROJECT_STATUS.md) updated
4. Git milestone tagged (when merged to main)
5. Completion report filled from [06_WAVE_EXECUTION_TEMPLATE.md](./06_WAVE_EXECUTION_TEMPLATE.md)

Only then may the next wave begin.
