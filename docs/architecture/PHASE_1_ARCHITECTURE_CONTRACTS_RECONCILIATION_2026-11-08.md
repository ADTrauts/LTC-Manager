# Phase 1 — Architecture Contracts & Documentation Reconciliation

**Status:** Phase 1 complete (documentation only). Does not authorize Phase 2.  
**Date:** November 8, 2026  
**Starting / audited commit:** `e179c0d52dcc3a71d83c8b0a42a1eb00945de6f8` (`main`)  
**HEAD unchanged since Phase 0:** yes — no intervening application commits  
**Binding amendment:** [01B](../product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md)  
**Prior discovery:** [Phase 0 pack](./PHASE_0_README.md)

---

## 1. Scope

Reconcile governing architecture documentation so agents and engineers receive one coherent instruction set after the November 1–2 retirements and the November 6 compatibility restore.

**In scope:** Markdown product/architecture docs, `AGENTS.md`, `.cursor/rules/vssyl-foundation.mdc`.  
**Out of scope:** Application code, Prisma schema/migrations, product registry runtime strings, Scheduled Evaluation host cron, Web Push, Role Job Flows, unified timeline implementation.

---

## 2. Canonical documents reviewed

| Document | Action |
|---|---|
| Phase 0 README / Atlas / Temporal / Reconciliation Register (ARR-001…029) | Read in full; Phase 0 README updated |
| `01_PRODUCT_CONSTITUTION.md` | Header, layers, status, marketplace, Job Flow, foundation paragraphs, shared mechanisms, Department Builder workspace, Nov 8 amendment |
| `01A_…`, new `01B_…` | Supersession note; new binding Phase 1 amendment |
| `03_PRODUCT_DOMAIN_MODEL.md` | Entities, ownership of truth, naming, inconsistencies |
| `08_PRODUCT_LANGUAGE_GUIDE.md` | Retired terms; Marketplace / Job Flow / Work language |
| `13_DEPARTMENT_PRODUCT.md` | Blueprint, platforms, Product tables, Marketplace kinds |
| `15_…` + `15A_…` | Registry headers, Domain B, detailed rows (LF/Work/time/eligibility) |
| `16_DEPARTMENT_BUILDER_ARCHITECTURE.md` | Restore supersession on Work drop claim |
| `16_NOTIFICATIONS_AND_ATTENTION.md` | Cross-linked via Constitution/README (clock status already accurate) |
| Build / Run guides | Phase 1 supersession banners |
| `08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md` | Nov 6–8 supersession (ARR-020) |
| `OPERATIONAL_ELIGIBILITY.md` | Job Role restore supersession (ARR-024) |
| `docs/product/README.md` | Authority index |
| `AGENTS.md`, `.cursor/rules/vssyl-foundation.mdc` | Agent safeguards |

---

## 3. Exact files changed

### Created

- `docs/product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md`
- `docs/architecture/PHASE_1_ARCHITECTURE_CONTRACTS_RECONCILIATION_2026-11-08.md` (this file)

### Updated

- `docs/architecture/PHASE_0_README.md`
- `docs/product/01_PRODUCT_CONSTITUTION.md`
- `docs/product/01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md`
- `docs/product/03_PRODUCT_DOMAIN_MODEL.md`
- `docs/product/08_PRODUCT_LANGUAGE_GUIDE.md`
- `docs/product/13_DEPARTMENT_PRODUCT.md`
- `docs/product/15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md`
- `docs/product/15A_DEPARTMENT_BUILDER_REGISTRY_AMENDMENT_2026-11-01.md`
- `docs/product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md`
- `docs/product/LTC_MANAGER_BUILD_GUIDE.md`
- `docs/product/LTC_MANAGER_RUN_GUIDE.md`
- `docs/product/README.md`
- `docs/department-administration/visual-audit/08_LOCATION_FUNCTION_ELIMINATION_AUDIT.md`
- `docs/employee-builder/OPERATIONAL_ELIGIBILITY.md`
- `AGENTS.md`
- `.cursor/rules/vssyl-foundation.mdc`

Phase 0 deliverables A/B/C remain the discovery record (already present from Phase 0).

---

## 4. Before / after (important language)

| Topic | Before Phase 1 | After Phase 1 |
|---|---|---|
| Generic Work | Often taught as shared engine / Job Flow source / Marketplace preset | **Retired / compatibility-only**; no Task replacement |
| Location Function | Taught as binding mechanism / ownership row | **Retired**; responsibility + canonical place ids |
| Department Job Role | Eligibility doc said removed; schema present | Doc records restore debt; forward = qualifications + registry |
| Nov 6 restore | Undocumented as architecture event in Constitution | Explicit temporary compatibility in 01B / Constitution |
| Progressive configuration | Implied in places | Formal platform principle with states |
| Temporal foundation | Scattered | 01B + registry rows for Operational Time / Scheduled Evaluation; ARR-027/028 named Phase 3 |
| Four states | Mixed “implemented” language | Implemented / gaps / Approved target / Retired-compatibility |
| Department Builder | Often Overview…Work… | Core five + extensions; Work not core |
| Product registry strings | Still say Work / Location Functions in code | **Documented** Phase 2 replacements only (no code change) |
| Agent instructions | Still listed Location Function / Work Plans | Point to 01A/01B; forbid revive |

---

## 5. Findings resolved through documentation

Documentation-only resolution means governing text no longer conflicts. **Code debt remains.**

| ID | Doc outcome |
|---|---|
| ARR-001 | Restore documented as compatibility, not reversal |
| ARR-005 | Phase 6 test vs restore conflict explained; not “tables gone” |
| ARR-006 | Phase 2 registry string replacements specified in 01B; code untouched |
| ARR-007 | Constitution / Domain Model / Registry / Language Guide reconciled |
| ARR-019 | Build guide supersession; hub copy remains code (Phase 2) |
| ARR-020 | Elimination audit supersession note |
| ARR-024 | Eligibility supersession note |
| ARR-029 | Documented as test/panel conflict; **closed in Phase 2A** (panel no longer authors LF) |

Also recorded: progressive configuration principle; temporal constraints; Builder→engine ownership summary; four architectural states.

---

## 6. Findings still requiring application code (Phase 2+)

| ID | Remains | Proposed phase |
|---|---|---|
| ARR-002 | Work tab/nav authoring — **closed Phase 2B** | 2B done |
| ARR-003 | Job Flow reads Work Plans | 2C → 5 |
| ARR-004 / 016 / 018 / 023 | LF/profile/archetype/Experience readers (writers closed 2A) | 2 |
| ARR-008 | Job Role beside qualifications | 2 |
| ARR-015 | Partner/staffing Work Plan writers — **closed Phase 2B** | 2B done |
| ARR-026 | Locations bind/publish — **closed Phase 2A** | 2A done |
| ARR-009 / 010 | SE host cron / Web Push | 3 foundation / 6 activation |
| ARR-011 | `CANONICAL_LOGS_ENABLED` default | Launch / 7 |
| ARR-027 / 028 | DST fork; server-local midnight | 3 |
| ARR-013 / 022 | Marketplace kinds; timeline / Role Job Flows | Future 4–5 |
| ARR-012 / 014 / 017 / 025 | Legitimate or complete — no conflict action | — |

---

## 7. Implementation vs accepted target (snapshot)

| Capability | State |
|---|---|
| Facility tree + responsibility | Implemented and verified |
| Operating Rhythm | Implemented and verified (progressive `NOT_CONFIGURED`) |
| Records Catalog chain | Implemented with gaps (flag default false) |
| Shift / Assignment / Coverage | Implemented and verified (core) |
| Notifications engine code | Implemented with gaps (clock/push) |
| Scheduled Evaluation host | Implemented with gaps — **not in `vercel.json`** |
| Job Flow without Work | Approved target (live still gap) |
| Generic Work / LF / Job Role removal | Approved target; residual compatibility present |
| Unified timeline / Role Job Flows | Approved target / future |
| Progressive configuration | Approved principle; uneven enforcement in UI |

---

## 8. Unresolved ownership questions (need PO only if changing)

None that block Phase 1. Directions A–G were product-owner approved for this phase.

Still open for **later** authorization (not invented here):

1. Exact host plan for sub-hour Scheduled Evaluation (Hobby vs paid).  
2. When to flip Canonical Logs default in production.  
3. Whether any residual Work behavior must be re-homed to Records before UI removal (trace in Phase 2).  
4. Role Job Flow product shape (Phase 5) — composition only, no new role system.

---

## 9. Phase 2 prerequisites and dependency order

1. **Freeze forward design** on 01A/01B (done in Phase 1).  
2. **Re-trace readers/writers** of restored models (Work, profile/archetype, Job Role) — do not drop tables first.  
3. **Close Location Function writers** (ARR-026) before deleting readers.  
4. **Remove Job Flow Work Plan dependency** (ARR-003) before Role Job Flow work.  
5. **Remove Work Builder/partner/Harbor surfaces** after consumers gone.  
6. **Forward-only migrations** for drops after explicit approval.  
7. Parallel-safe: docs/registry string cleanup in `registry.ts` (ARR-006) once PO accepts customer-facing copy change.  
8. Do **not** start Phase 4–5 timeline/Role Job Flows until Step 4 complete.  
9. Do **not** activate SE cron/Web Push without separate authorization.

---

## 10. Verification performed

- Confirmed HEAD == Phase 0 SHA `e179c0d`.  
- Repository searches on authoritative docs for Location Function / Work Plan / Expected Work after edits (governing docs now mark retired/compatibility).  
- Confirmed no application/schema files modified (`git status` documentation + Phase 0 pack only).  
- Relative links to 01B / Phase 0 / Phase 1 checked in newly written files.  
- Did **not** run application test suites (no code change).  
- Did **not** claim Phase 6 hermetic tests pass — they still encode pre-restore absence (ARR-005).

---

## 11. Remaining risks and limitations

- Historical guides under `docs/product/LTC_MANAGER_*.md` and older wave docs may still teach Work/LF; banners + 01B authority cover them, but not every dated file was rewritten.  
- Product registry **code** still advertises Work/Location Functions until Phase 2.  
- Live UI still exposes Work and LF bind/publish — documentation now forbids treating that as approved.  
- External hosting of Scheduled Evaluation beyond `vercel.json` was not independently confirmed; repo evidence shows the path is omitted from the committed cron file.

---

## Verdict

**PASS WITH GAPS**

Canonical architecture documents now **agree** on forward vs compatibility-only status for Work, Location Function, and Department Job Role; progressive configuration; temporal foundations; and Builder ownership. Application implementation gaps catalogued in Phase 0 remain open for Phase 2+.

**Stop after Phase 1.** Do not proceed to legacy removal without explicit approval.

**Commit SHA:** not committed by this phase (unless the product owner requests a commit separately).
