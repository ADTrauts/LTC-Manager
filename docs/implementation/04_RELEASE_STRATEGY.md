# Release Strategy

**Status:** Active — release gates for modernization waves  
**Date:** 2026-07-07

This document defines **how releases occur** as modernization waves ship. The existing app is **production-usable MVP**; releases must **never regress** core dining/EVS/plant workflows for live facilities.

---

## Release stages

```
Internal milestone  →  Pilot  →  Beta  →  Production
     (dev/CI)         (1–2 sites)  (wider)   (all customers)
```

| Stage | Audience | Purpose | Gate |
|-------|----------|---------|------|
| **Internal milestone** | Dev team, FA test accounts | Wave complete; regression pass | Wave validation checklist + git tag |
| **Pilot** | 1–2 friendly facilities | Real-world floor validation | Internal + 1 week pilot sign-off |
| **Beta** | Early adopters (opt-in) | Scale feedback; perf under load | Pilot issues resolved or accepted |
| **Production** | All deployments | General availability for wave scope | Beta stable 2+ weeks or wave is low-risk |

Not every wave requires full Pilot → Beta → Production. **Low-risk UI-only waves** may go Internal → Production with spot pilot. **Schema or tenancy waves** require Pilot minimum.

---

## Git milestones

Each wave produces a **git tag** on `main` (or release branch) after validation:

| Tag pattern | Example |
|-------------|---------|
| `wave-NN-short-name` | `wave-01-shell-navigation` |

Tag **after** merge to main, not on feature branches. Annotated tag message includes:

- Wave number and name
- Summary of deliverables
- Validation sign-off date
- Known limitations

Optional: maintain `docs/implementation/07_PROJECT_STATUS.md` with tag SHA.

---

## Deployment model (current)

| Aspect | Current state |
|--------|---------------|
| Architecture | Single Next.js monolith |
| Tenancy | One facility per deployment (typical) |
| Database | PostgreSQL via Prisma migrations |
| Migrations | Forward-only; never reset production |
| Feature flags | Introduce as needed (env vars) for high-risk waves |

**Deploy order:** migration → `prisma generate` → build → restart. See `ltc-manager/AGENTS.md` for migration guardrails.

---

## Wave independence matrix

Which waves can ship **independently** without requiring subsequent waves:

| Wave | Can ship alone? | Notes |
|------|-----------------|-------|
| **1** Shell & Nav | **Yes** | Foundation; ship first |
| **2** Operations Center | **Yes** | Requires Wave 1 |
| **3** Unit Workspace | **Yes** | Requires Wave 1; pairs well with 2 |
| **4** Supervisor / Today's Work | **Yes** | Requires 1–3 |
| **5** Operations Engine | **Partial** | Schema migration; use feature flag; UI can defer |
| **6** Readiness v0 | **Yes** | Can ship inside Wave 2 release |
| **6** Readiness v1 | **Partial** | Prefer after Wave 5 |
| **7** Work Engine | **No** | Long-running; ship in sub-milestones (7a sync, 7b inspection) |
| **8** Issue & Recovery | **Partial** | Supply short can ship before full Issue rename |
| **9** Knowledge | **Yes** | Additive |
| **10** Operational AI | **Yes** | Feature-flagged off by default |
| **11** Organization | **No** | Must not ship half-migrated tenancy |
| **12** Industry Config | **Partial** | LTC parity pack first; second pack optional |

---

## Recommended release bundles

Bundles reduce release overhead while keeping rollback coherent.

### Bundle A — "Operational shell" (Waves 1–4)

**Ship together for first customer-visible modernization.**

| Contents | User-visible outcome |
|----------|---------------------|
| W1 Nav zones | Role-based navigation |
| W2 Operations Center | Exceptions-first manager home |
| W3 Unit Workspace | Floor execution surface |
| W4 Today's Work | Supervisor walk/coverage |
| W6 v0 (optional) | Readiness chips |

**Release path:** Internal → **Pilot required** → Beta → Production

**Rollback:** Revert UI bundle; no schema if W6 v0 only.

---

### Bundle B — "Dietary rhythm" (Waves 5–6 v1)

**Ship when operation-scoped time model is stable.**

| Contents | Outcome |
|----------|---------|
| W5 Operation engine | Explicit breakfast/lunch/dinner instances |
| W6 Readiness v1 | Formal readiness + missed log job |

**Release path:** Internal → Pilot → Production (migration involved)

**Rollback:** Feature flag to meal-type-only; forward migration for fixes.

---

### Bundle C — "Work & issues" (Waves 7–8)

**Ship in sub-releases:**

| Sub-release | Scope |
|-------------|-------|
| 7a | Task sync for logs/repairs (invisible to users) |
| 7b | Inspection workflow |
| 8a | Supply short + quick issue forms |
| 8b | Issue types + SCR-06 detail |

**Release path:** 7a Internal → Production (no UI change). 8a Pilot required.

---

### Bundle D — "Intelligence & knowledge" (Waves 9–10)

**Independent additive release.**

| Contents | Outcome |
|----------|---------|
| W9 Knowledge | SOPs at point of work |
| W10 AI | Morning brief (opt-in) |

**Release path:** Internal → Beta (AI off) → Production

---

### Bundle E — "Platform scale" (Waves 11–12)

**Major platform release — separate marketing/upgrade path.**

| Contents | Outcome |
|----------|---------|
| W11 Organization | Multi-site |
| W12 Industry | Vertical packs |

**Release path:** Internal → **Extended pilot** → Beta → Production

**Never** combine W11 with unrelated UI waves in one deploy.

---

## Environment promotion

| Environment | Purpose | Wave testing |
|-------------|---------|--------------|
| **Local** | Developer validation | Every commit |
| **Staging** | Integration + migration dry run | Pre-pilot |
| **Pilot production** | 1–2 live sites, opt-in | Bundle A, B, C user-facing |
| **Production** | All customers | After gates |

If staging is unavailable, use **provisioned dev facility** with production-like seed and manual migration on DB clone.

---

## Migration release rules

Waves with Prisma migrations (5, 7, 8, 9, 11, 12):

1. Migration reviewed in isolation — one wave's migrations per deploy when possible
2. **Backup** database before production migrate
3. Run `prisma migrate deploy` (not `migrate dev`) in production
4. Verify rollback **forward-fix** plan before deploy — no `migrate reset`
5. Post-deploy: run global G-01–G-10 from [03_REGRESSION_PROTECTION.md](./03_REGRESSION_PROTECTION.md)

---

## Feature flags

Use environment variables for gradual rollout:

| Flag | Wave | Default |
|------|------|---------|
| `READINESS_V1_ENABLED` | 6 | `false` until validated |
| `OPERATION_ENGINE_ENABLED` | 5 | `false` until backfill complete |
| `TASK_SYNC_ENABLED` | 7 | `false` until dual-write verified |
| `AI_BRIEF_ENABLED` | 10 | `false` |
| `ORG_MULTISITE_ENABLED` | 11 | `false` |
| `INDUSTRY_PACK` | 12 | `LTC` |

Document new flags in wave completion report.

---

## Communication checklist

Per production release:

- [ ] Release notes: user-visible changes only
- [ ] Admin notice: migration downtime window if any
- [ ] Pilot site contact identified
- [ ] Rollback owner assigned
- [ ] `07_PROJECT_STATUS.md` updated

---

## First release recommendation

**Target first production modernization release:** Bundle A (Waves 1–4), optionally including Readiness v0 from Wave 6.

This delivers the certified **three homes** (Operations Center, Unit Workspace, Today's Work) without risky schema changes — aligned with [FIRST_PRODUCT_SLICE.md](../platform-vision/FIRST_PRODUCT_SLICE.md) and ADL-005.

**Do not** release Wave 11 or 12 until Bundles A–C are stable in production.

---

## Version numbering (optional)

The repo does not currently use semantic versioning for the app. If adopted:

| Version bump | When |
|--------------|------|
| **Minor** (0.x.0) | Bundle A, B, C production releases |
| **Major** (x.0.0) | Bundle E (org + industry) |

Until then, **git tags** are the source of truth for deployed wave milestones.
