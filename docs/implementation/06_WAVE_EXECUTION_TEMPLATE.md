# Wave Execution Template

**Status:** Copy this template for every implementation session  
**Date:** 2026-07-07

Paste the filled template into a Cursor implementation prompt. Replace `{PLACEHOLDERS}`. Execute **one wave** (or one sub-milestone) per session.

---

## Template (copy below this line)

```markdown
Mode: IMPLEMENTATION — Wave {N}

Planning is CLOSED. Certified documents are source of truth.
Do NOT create planning documents. Do NOT scope beyond this wave.

---

## Goal

{One paragraph: what this wave delivers and what "done" looks like.}

Sub-milestone (if applicable): {e.g., 6-v0, 7a, 8a, or "full wave"}

---

## Certified references

Read and conform to these documents for this wave:

| Document | Path | Use for |
|----------|------|---------|
| Product Constitution | docs/platform-vision/PRODUCT_CONSTITUTION.md | Principles |
| Operation Model | docs/platform-vision/OPERATION_MODEL.md | Operational context |
| Domain Model | docs/platform-vision/DOMAIN_MODEL_TARGET.md | Entity names |
| Architecture Decision Log | docs/platform-vision/ARCHITECTURE_DECISION_LOG.md | ADL guardrails |
| Current vs Target | docs/platform-vision/CURRENT_STATE_VS_TARGET_STATE.md | Preserve/refactor |
| First Product Slice | docs/platform-vision/FIRST_PRODUCT_SLICE.md | Dietary scope (if waves 2–4, 6, 8) |
| Capability | docs/reference-capabilities/{relevant}.md | Business promise |
| UX Reference | docs/reference-ux/{relevant}.md | Experience contract |
| Product Reference | docs/product-reference/{relevant}.md | Navigation, screens, flows |
| Architecture Review | docs/architecture-review/04-existing-features.md | Do not break |
| Development Standards | docs/implementation/05_DEVELOPMENT_STANDARDS.md | How to build |
| Codebase Mapping | docs/implementation/02_CODEBASE_MAPPING.md | Wave {N} section |
| Regression Protection | docs/implementation/03_REGRESSION_PROTECTION.md | Wave {N} section |

---

## Files affected

From docs/implementation/02_CODEBASE_MAPPING.md — Wave {N}:

### Components
- {list}

### Routes / pages
- {list}

### Lib / services
- {list}

### Schema / migrations (if any)
- {list or "none"}

### Seed / tests
- {list}

---

## Implementation plan

Execute in order:

1. **{Step 1 title}**
   - {Detail}
   - Files: `{paths}`

2. **{Step 2 title}**
   - {Detail}
   - Files: `{paths}`

3. **{Step 3 title}**
   - {Detail}
   - Files: `{paths}`

4. **{Step N}**
   - Wire UI / integrate
   - Preserve backward compatibility: {specific URLs/behaviors}

### Out of scope (do not implement)
- {Explicit exclusions}

### Feature flags (if any)
- `{ENV_VAR}` = `{default}`

---

## Validation

### Automated
- [ ] Run tests: `{command}`
- [ ] Lint / typecheck: `{command}`

### Global workflows (G-01–G-10)
- [ ] G-01 Email login
- [ ] G-02 PIN login
- [ ] G-03 Onboarding gate
- [ ] G-04 Route permission deny
- [ ] G-05 Department scope
- [ ] G-06 Kiosk unit lock
- [ ] G-07 Log submit
- [ ] G-08 Staffing view
- [ ] G-09 Repair create
- [ ] G-10 Facility scope

### Wave-specific (from 03_REGRESSION_PROTECTION.md)
- [ ] {WN-01}
- [ ] {WN-02}
- [ ] ...

---

## Regression checklist

Critical workflows that must not break:

| ID | Workflow | Status |
|----|----------|--------|
| {id} | {description} | pass / fail |

Areas likely to break:
- {list from 03_REGRESSION_PROTECTION.md}

Rollback if needed:
- {steps from 03_REGRESSION_PROTECTION.md}

---

## Git commit

When user requests commit:

```
{type}({scope}): {imperative summary}

Wave {N}: {short description}
```

One logical feature per commit. Do not commit unless user asks.

Git milestone after merge: `wave-{NN}-{short-name}`

---

## Completion report

Fill when wave is done:

### Delivered
- {bullet list of what shipped}

### Not delivered / deferred
- {items moved to later wave}

### Validation result
- Global G-01–G-10: {pass/fail notes}
- Wave-specific: {pass/fail notes}

### Files changed
- {summary count and key paths}

### Schema migrations
- {migration name or "none"}

### Feature flags added
- {list or "none"}

### Known issues
- {list or "none"}

### Docs updated
- [ ] docs/implementation/07_PROJECT_STATUS.md

### Sign-off
- Wave: {N}
- Date: {YYYY-MM-DD}
- Ready for next wave: {yes/no — blocker if no}
```

---

## Example: Wave 1 prefilled starter

Use this as the first implementation prompt:

```markdown
Mode: IMPLEMENTATION — Wave 1

Planning is CLOSED. Certified documents are source of truth.
Do NOT create planning documents. Do NOT scope beyond Wave 1.

---

## Goal

Modernize application shell and navigation to the five-zone model from Product Reference: Operations Center, Locations, Today's Work (placeholder route OK), Review, Administration. Rename user-facing "Units" to "Locations" where appropriate. Preserve all existing URLs and RBAC behavior.

Sub-milestone: full wave

---

## Certified references

- docs/product-reference/01_NAVIGATION_SYSTEM.md (primary)
- docs/product-reference/10_PRODUCT_REFERENCE_CERTIFICATION.md (zones)
- docs/reference-ux/00_REFERENCE_UX_INDEX.md
- docs/platform-vision/ARCHITECTURE_DECISION_LOG.md (ADL-002)
- docs/implementation/05_DEVELOPMENT_STANDARDS.md
- docs/implementation/02_CODEBASE_MAPPING.md — Wave 1
- docs/implementation/03_REGRESSION_PROTECTION.md — Wave 1

---

## Files affected

### Components
- src/components/app-shell.tsx
- src/components/top-nav.tsx
- src/components/left-sidebar.tsx
- src/components/department-scope-switcher.tsx

### Routes / pages
- All (protected) routes — nav visibility only
- src/app/(protected)/dashboard/page.tsx — zone label

### Lib / services
- src/lib/route-permissions.ts
- src/lib/department-nav.ts
- src/hooks/use-nav-pathname.ts
- src/proxy.ts

### Schema / migrations
- prisma/seed.mjs (AppRoute labels/order; optional /today stub route)

---

## Implementation plan

1. **Define zone model in lib**
   - Add zone enum and mapping from pathname/AppRoute to zone
   - Files: src/lib/route-permissions.ts, new src/lib/nav-zones.ts

2. **Update top nav**
   - Group or label nav by zone; preserve all module links
   - Files: src/components/top-nav.tsx

3. **Update app shell**
   - Visual zone indicator; default home by role (manager → dashboard, staff → locations)
   - Files: src/components/app-shell.tsx

4. **Locations rail**
   - Rename sidebar header Units → Locations
   - Files: src/components/left-sidebar.tsx

5. **Department mode lens**
   - Clarify switcher copy as operational mode filter
   - Files: src/components/department-scope-switcher.tsx, src/lib/department-nav.ts

6. **Seed / permissions**
   - Update AppRoute labels; add inactive /today route for Wave 4 prep if desired
   - Files: prisma/seed.mjs

### Out of scope
- Operations Center card reorder (Wave 2)
- Readiness chips (Wave 6)
- Today's Work pages (Wave 4) — placeholder nav entry only OK if hidden for staff
- Schema migrations
- URL path renames (/dashboard stays)

---

## Validation

### Automated
- [ ] npm test (route-permissions, credential-policy)
- [ ] npm run build

### Global G-01–G-10
- [ ] All pass

### Wave-specific W1-01–W1-07
- [ ] All pass (see 03_REGRESSION_PROTECTION.md)

---

## Regression checklist

See docs/implementation/03_REGRESSION_PROTECTION.md — Wave 1

Rollback: revert shell + nav commits; re-seed if AppRoute changed

---

## Git commit

feat(nav): implement five-zone application shell (Wave 1)

---

## Completion report

(Fill on completion)
```

---

## Sub-milestone naming

When splitting large waves:

| Wave | Sub-milestone | Scope |
|------|---------------|-------|
| 6 | 6-v0 | Computed readiness, no migration |
| 6 | 6-v1 | ReadinessSnapshot, missed log job |
| 7 | 7a | Task dual-write for logs/repairs |
| 7 | 7b | Inspection workflow |
| 8 | 8a | Quick issue + supply short forms |
| 8 | 8b | Issue types + detail page |
| 11 | 11a | Organization schema + backfill |
| 11 | 11b | Site switcher + org admin |

Each sub-milestone gets its own filled template and completion report.
