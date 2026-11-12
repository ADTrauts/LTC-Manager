# Phase 2C Release R4 — Final candidate & deployment readiness

**Date:** November 8–9, 2026  
**Release recommendation:** **READY FOR DEPLOYMENT APPROVAL**  
**Nature:** Final pre-deployment certification. No deploy executed. No schema retirement. No Phase 2D. No ARR-008 consolidation.

Explicit product-owner approval is still required before any production deployment.

---

## 1. Final candidate SHA

| Item | Value |
|---|---|
| Starting HEAD (R3 report) | `004bdcfad3b647f9254eafbea465aa4fbdc8ee53` |
| **Final release-candidate SHA** | **`7973254ee87da2d94291f4282337441944d042fa`** |
| Commit subject | Certify Phase 2C offline fixtures without retired authoring (R3). |
| Not used as final candidate | `43e370b` (R1 tip; superseded by R3 runtime/fixture fixes) |
| Excluded from candidate | `.neon`, secrets, disposable DB artifacts |

Candidate contains the committed R3 product/fixture/runtime fixes. R4 verification harness files under `scripts/verify/run-r4-release-browser.mjs`, `scripts/verify/r4-auth-checks.ts`, and `tests/r4-release-browser/` were used for this gate and may remain uncommitted relative to the candidate tip.

---

## 2. Exact R3 changes committed (`7973254`)

| Path | Change |
|---|---|
| `scripts/verify/canonical-offline-fixtures.mjs` | Removed LF / Work Plan authoring; OR + ONE_OFF + legacy seed |
| `scripts/verify/run-offline-browser.mjs` | `OFFLINE_BROWSER_PROJECT` isolation |
| `tests/offline-browser/canonical-journey.ts` | Responsibility + date-shift ONE_OFF backfill; `.first()` |
| `src/lib/offline/space/service.ts` | Department Space responsibility gate; omit WORK_PLAN from new targets |
| `src/components/offline/offline-job-flow-context.tsx` | Import `serialize-offline` (avoid client `next/headers`) |
| `src/app/(protected)/staffing/work-plans/[workPlanId]/page.tsx` | Retired `StatusBadge` children API |
| `docs/architecture/PHASE_2C_RELEASE_R3_…` + ARR | R3 certification record |

---

## 3. Build / typecheck / lint

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **PASS** |
| `node scripts/verify/verify-build.mjs` (Next production build) | **PASS** (compiled; TS finished; static generation OK) |
| `npm run lint` | **1 pre-existing error** (`prefer-const` in `evidence-failed-attention.ts`) + 196 warnings — **not introduced by R3/R4**; checks not weakened |

No new required environment variables for the candidate beyond existing flags already documented (e.g. `DIETARY_JOB_FLOW_ENABLED`, `OPERATIONAL_ASSIGNMENTS_ENABLED`, `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED` production-true / code-default-false, `CANONICAL_LOGS_ENABLED`). Scheduled Evaluation cron and Web Push sending remain intentionally inactive.

---

## 4. Offline certification by project

Isolated disposable databases only. Never shared occurrence pool across projects.

| Project | DB | Scenarios | Result |
|---|---|---|---|
| `OFFLINE_BROWSER_PROJECT=tablet` | `ltc_verify_phase2c_r4_tablet` | **18/18** | **PASS** |
| `OFFLINE_BROWSER_PROJECT=chromium` | `ltc_verify_phase2c_r4_chromium` | **18/18** | **PASS** |

Verified behaviors (via CI-gate scenarios):

- Department Space responsibility gate (not Location Function)
- ONE_OFF offline completion
- WORK_PLAN omitted from new offline targets
- Offline queue + synchronization
- Receipt / conflict handling
- Idempotent replay
- Offline lease + authorization checks

**Known isolation note:** Combined dual-project runs against one mutable occurrence pool remain unreliable. Certification claims use **isolated projects only**. Playwright tablet viewport ≠ physical tablet certification.

---

## 5. Employee browser results

Focused Playwright `@r4-gate` against disposable `ltc_verify_phase2c_r4_online` + production `next start`.

| Check | Result |
|---|---|
| SPACE Job Flow shows fixture ONE_OFF | **PASS** |
| No duplicate ONE_OFF cards | **PASS** |
| Completion navigation to work panel | **PASS** |
| Neighborhood grain; no Location Function / Work Plan configuration copy | **PASS** |
| No plan-derived Work presentation | **PASS** |

Canonical Records / Operating Rhythm Key Points / assigned Plant WO cards were not fabricated when optional config or assignments are absent (progressive configuration preserved). Fixture scope emphasizes ONE_OFF + Assignment; empty Plant WO assignee set does not invent work.

---

## 6. Supervisor browser results

| Check | Result |
|---|---|
| Create ONE_OFF on `/staffing/operations` | **PASS** |
| Assigned employee sees ONE_OFF on Neighborhood Job Flow | **PASS** |
| `/staffing/work-plans` retired surface; no create control | **PASS** |
| No WORK_PLAN exception authoring UI | **PASS** |

---

## 7. Dashboard results

| Check | Result |
|---|---|
| `dashboard-v2` renders | **PASS** |
| No `work.expected` / `expected_work` card testids | **PASS** |
| No “Configure Work Plans” / “Publish a Work Plan” prompts | **PASS** |

Saved layouts tolerating retired cards remain covered by prior Dashboard hermetics; no fabricated exceptions from missing optional configuration observed.

---

## 8. Harbor / Partner / Build results

| Check | Result |
|---|---|
| Facility Marketplace browse: no WORK_PRESET / Work family tab | **PASS** |
| Partner `/partner/work` retired when reachable | **PASS** (or redirect away for non-partner) |
| Manager Work Plan builder retired; no publish/create | **PASS** |
| Harbor + EVS disposable SQL certification (prior R4 run) | Harbor/catalog + EVS sequencing suite **21 pass / 3 fail** — fails are ARR-008 eligibility debts, not Harbor browse regressions |

---

## 9. Authorization HTTP findings

14/14 auth checks **PASS** (`tmp/r4-release-browser-artifacts/auth-http.json`), plus Playwright HTTP surface assertions.

| Check | Result |
|---|---|
| `publishWorkPlan` retired throw | **PASS** |
| `bindLocationFunction` retired throw | **PASS** |
| Staff `createOneOff` denied | **PASS** |
| Manager `createOneOff` allowed | **PASS** |
| Qualification write requires password (PIN rejected) | **PASS** |
| Bad login HTTP 401 | **PASS** |
| Staff `/staffing/operations` no ONE_OFF create UI (307 / no form) | **PASS** |
| Unknown unit facility isolation HTTP 404 | **PASS** |
| Manager Work Plans retired HTML | **PASS** |
| LF “Publish Location Functions” absent | **PASS** |
| Manager can open own unit | **PASS** |

Permission models unchanged. No material unsafe assignment/authorization defect observed.

---

## 10. Production schema compatibility (read-only)

Target: Neon production via `.env.production.local` (read-only SELECT / PrismaClient). **No migrate deploy. No data writes.**

| Probe | Result |
|---|---|
| Finished migrations | **187** |
| `20261103140000_retire_generic_work_and_profiles` | Applied |
| `20261106214500_restore_schema_after_premature_retirement` | Applied |
| Work compatibility tables present | `DepartmentWorkPlan`, `Occurrence`, `Item`, Events, Applicability (all present; counts currently **0**) |
| Unexpected pending migrations vs candidate | **None** observed for finished set (=187) |
| New env vars required by candidate | **None** |

Local/staging hygiene is not coupled to this release decision.

---

## 11. Remaining ARR-003 and ARR-008 obligations

| ARR | R4 disposition |
|---|---|
| **ARR-003** | Still open: ONE_OFF persistence, historical readers, offline command contracts, Prisma Work tables. Not an automatic deploy blocker per program rules. Do not drop Work/LF tables (LEG-06). |
| **ARR-008** | Eligibility suite **10 pass / 3 fail** (suggestion helper eligibility, retired CASHIER registry expectation, Job Role derivation in Assignments). **No material operational defect** demonstrated in R4 browser/HTTP gates. **Carry into Phase 2E.** Do not implement workforce consolidation here. |

---

## 12. Confirmed production rollback deployment

Inspected via Vercel API + CLI (`npx vercel inspect` / `vercel ls --environment production`).

| Field | Value |
|---|---|
| Current production READY deployment | `dpl_LJx7vYpGThGJtMK3hoG3hjHRfhbC` |
| URL | `https://ltc-manager-5rp1gygi6-adtrauts-projects.vercel.app` |
| Aliases | `vssyl.com`, `www.vssyl.com`, `ltc-manager-ten.vercel.app`, … |
| **Current production SHA** | **`56de3123ae6e5aa99a2979d8a6200469389c3cdb`** |
| Production commit message | Merge PR #7 People & Coverage composition |
| Release candidate SHA | `7973254ee87da2d94291f4282337441944d042fa` |
| Candidate builds successfully | **Yes** (R4 `verify-build` PASS) |
| App-only rollback | Promote/redeploy deployment `dpl_LJx7vYpGThGJtMK3hoG3hjHRfhbC` (SHA `56de312`) — **do not assume `43e370b` was production** |
| Data note | App rollback ≠ restoring historical Work rows destroyed by earlier destructive migration |

**Rollback was not executed.**

---

## 13. Exact remaining release risks

1. Combined dual-project offline runner still flaky if misused against one DB (operational risk for CI authors; isolated cert is green).
2. ARR-003 compatibility persistence (ONE_OFF + Work tables) until a later authorized schema program.
3. ARR-008 dual Job Role / qualification model (Phase 2E).
4. Production Scheduled Evaluation clock and Web Push sending remain off (intentional; out of Phase 2C).
5. Pre-existing ESLint `prefer-const` error unrelated to this candidate.
6. Physical shared-tablet certification not claimed from Playwright viewport.

No material functional or authorization regression blocking deploy approval was confirmed.

---

## 14. Recommended deployment and post-deployment smoke plan

**Not authorized here — requires explicit PO approval.**

### Deploy (after approval)

1. Deploy application only for candidate `7973254` (or a docs-only tip that contains the same product tree).
2. Do **not** run production/staging migrations as part of this release.
3. Do **not** enable Scheduled Evaluation cron or Web Push sending.
4. Do **not** drop Work/LF tables.

### Immediate post-deploy smoke

1. Login facility admin + staff + supervisor on production aliases.
2. Employee SPACE Job Flow: Assignment present; ONE_OFF visible when assigned; no Work Plan configuration prompts.
3. Supervisor: create ONE_OFF; employee sees it; complete when authorized.
4. Dashboard: no `work.expected` / Work Plan setup prompts.
5. Marketplace: no Work family / WORK_PRESET browse.
6. `/staffing/work-plans` retired; LF publish controls absent.
7. Spot-check offline prepare on one SPACE tablet session (real device if available).
8. Confirm production migration count still 187 + restore applied (read-only).

### Rollback trigger examples

- WORK_PLAN reappears in employee forward presentation
- ONE_OFF create/complete broken for supervisors/assignees
- Authorization widening (staff create ONE_OFF, LF/Work Plan writers succeed)
- Offline sync silent drops

Rollback target: redeploy `dpl_LJx7vYpGThGJtMK3hoG3hjHRfhbC` / SHA `56de312`.

---

## 15. Final regression ledger (unique counts)

| Suite | Pass | Fail | Skip | Notes |
|---|---:|---:|---:|---|
| Phase 2C hermetic matrix | 150 | 0 | 0 | Unique hermetics |
| CDA write-manifest hermetic | 3 | 0 | 0 | Re-run R4 |
| Harbor + EVS / eligibility SQL pack | 21 | 3 | 0 | 3 fails = ARR-008 |
| Offline tablet `@ci-gate` | 18 | 0 | 0 | Isolated DB |
| Offline chromium `@ci-gate` | 18 | 0 | 0 | Isolated DB |
| Online R4 `@r4-gate` browser | 5 | 0 | 0 | Disposable online DB |
| Auth HTTP / lib authority | 14 | 0 | 0 | Against live `next start` |
| Typecheck | PASS | | | |
| Production build | PASS | | | |

Do not double-count overlapping hermetic membership across packs. Offline tablet + chromium are separate project certifications of the same 18 scenarios.

---

## 16. Final verdict

**READY FOR DEPLOYMENT APPROVAL**

All required Phase 2C release checks for this gate pass, no material functional or authorization defects remain, and the candidate is schema-compatible with production. ARR-003 compatibility persistence and ARR-008 eligibility debt are carried forward and are not automatic blockers under program rules.

**STOP.** No production deployment without explicit product-owner approval.
