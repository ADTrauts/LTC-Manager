# Phase 2C Production Deployment Report — Vssyl

**Date:** November 9, 2026  
**Product:** Vssyl (repository `ADTrauts/LTC-Manager`, Vercel project `ltc-manager`)  
**Authorization:** Product-owner approval granted for certified Phase 2C release  
**Final status:** **DEPLOYED — WITH GAPS**

---

## 1. Preflight results

| Check | Result |
|---|---|
| Active repository | `https://github.com/ADTrauts/LTC-Manager.git` (not retired `ADTrauty/Vssyl`) |
| Vercel project | `ltc-manager` (`prj_O3x1tS8yS1rFQEmd73rofZboIDCK`, scope `adtrauts-projects`) |
| Certified SHA present | `7973254ee87da2d94291f4282337441944d042fa` |
| Deploy source | Clean detached git worktree at exact certified SHA (no uncommitted R4 harness) |
| Unrelated app changes excluded | **Yes** — dirty main-tree R4 harness/docs were not uploaded |
| Production domains before promote | `vssyl.com` / `www.vssyl.com` → prior READY `dpl_LJx7vYpGThGJtMK3hoG3hjHRfhbC` |
| Rollback target available | **Yes** — `dpl_LJx7vYpGThGJtMK3hoG3hjHRfhbC` READY |
| Deploy hooks | `vercel.json` crons: support automation + Plant PM only; **no** migrate, Scheduled Evaluation, or Web Push |
| Local dirty typecheck trap | Uncommitted `scripts/verify/r4-auth-checks.ts` breaks dirty-tree `tsc`; **clean candidate tree typecheck/build PASS** |

R4 certification report retained: [PHASE_2C_RELEASE_R4_FINAL_DEPLOYMENT_GATE.md](./PHASE_2C_RELEASE_R4_FINAL_DEPLOYMENT_GATE.md).

---

## 2. Exact deployed SHA

**`7973254ee87da2d94291f4282337441944d042fa`**

Subject: *Certify Phase 2C offline fixtures without retired authoring (R3).*

CLI metadata on the staged deploy also recorded `gitCommitSha=7973254…`, `certifiedCandidate=7973254`, `phase2cRelease=r4`.

Application tree identity: worktree HEAD matched certified SHA; key R3 offline files hashed to the certified commit contents; staged `public/space-offline.js` SHA matched the worktree file (`3acea7a8…`).

---

## 3. Production Vercel deployment ID

| Field | Value |
|---|---|
| Deployment ID | `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` |
| Deployment hostname | `ltc-manager-91mwwm29t-adtrauts-projects.vercel.app` |
| Inspector | https://vercel.com/adtrauts-projects/ltc-manager/2fjfVAJporEGaDtFwzRVd9TgQhKS |
| Target / environment | `production` |
| Ready state | READY |
| Staging method | `vercel deploy --prod --skip-domain` from clean worktree |
| Promotion | `vercel promote dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` — Success |

---

## 4. Production URL and aliases

| Alias | After promotion |
|---|---|
| `https://vssyl.com` | → `ltc-manager-91mwwm29t-adtrauts-projects.vercel.app` |
| `https://www.vssyl.com` | → `ltc-manager-91mwwm29t-adtrauts-projects.vercel.app` |
| `ltc-manager-ten.vercel.app` | → new deployment |
| `ltc-manager-adtrauts-projects.vercel.app` | → new deployment |
| `ltc-manager-git-main-adtrauts-projects.vercel.app` | still pointed at prior `5rp1gygi6` (git-main alias; not primary public brand) |

DNS / domain ownership unchanged.

---

## 5. Schema compatibility results (read-only)

Neon host: `ep-plain-salad-avjht24p-pooler.c-11.us-east-1.aws.neon.tech`

| Probe | Result |
|---|---|
| Finished migrations | **187** (reconfirmed post-promote) |
| `20261103140000_retire_generic_work_and_profiles` | Applied |
| `20261106214500_restore_schema_after_premature_retirement` | Applied |
| Work compatibility tables | Present (`DepartmentWorkPlan`, Occurrence, Item, Events, Applicability) |
| Canonical Facility / Department / Assignment / Records / Operating Rhythm / UnitSpaceResponsibility | Present |
| Migrations run this release | **None** |
| Unexpected pending set vs candidate | **None** observed |

---

## 6. Build and certification results

| Gate | Result |
|---|---|
| Clean-tree `npm run typecheck` | PASS |
| Clean-tree `verify-build` | PASS |
| CDA write-manifest hermetic | 3/3 PASS |
| R4 offline tablet + chromium | 18/18 + 18/18 (prior certification) |
| R4 online browser + auth | 5/5 + 14/14 (prior certification) |
| ARR-008 eligibility 3 fails | Accepted known debt (unchanged; not a new material defect) |
| Pre-existing lint `prefer-const` | Accepted known debt |

Production env (names): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED=true`, `CANONICAL_LOGS_ENABLED` present. `WEB_PUSH_SENDING_ENABLED` not set (sending remains off). No Scheduled Evaluation cron registered.

---

## 7. Staged deployment verification

Staged URL (production-configured, domains not yet assigned): `https://ltc-manager-91mwwm29t-adtrauts-projects.vercel.app`

| Surface | Result |
|---|---|
| `/login` title Vssyl | PASS |
| Unauth `/dashboard`, `/staffing/operations` | 307 → `/login` |
| Manager login (`dietary-manager-test@terraceview.local`) | PASS |
| Dashboard `dashboard-v2`; no `work.expected`; no Work Plan setup prompts | PASS |
| `/staffing/operations` ONE_OFF controls present; no Publish Work Plan | PASS |
| `/staffing/work-plans` `work-plan-builder-retired` | PASS |
| Neighborhood + SPACE unit pages load; no Work Plan configuration / LF publish copy | PASS |
| Staff/supervisor test login + SPACE load | PASS |
| `/admin/departments?marketplace=1` | 307 → `/dashboard` for this manager (authority boundary) |
| `/partner/work` | 307 → `/dashboard` (non-partner appropriately restricted) |
| `space-offline.js` identity vs certified worktree | PASS |
| Mutating ONE_OFF create/complete on production data | **SKIPPED (safe)** |
| Live SPACE offline prepare/sync on a device | **SKIPPED (safe)** — client asset verified; full prepare not exercised against live assignments |

---

## 8. Production promotion result

| Step | Outcome |
|---|---|
| `vercel promote dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` | **Success** (~2s) |
| Public brand aliases updated | `vssyl.com`, `www.vssyl.com` |
| Rebuild | None (promote of already-built production deployment) |
| Schema / env flag changes | None |

---

## 9. Post-deployment smoke results

Against `https://vssyl.com` after promotion:

| Check | Result |
|---|---|
| Login page loads Vssyl | PASS |
| Manager + supervisor/staff test login | PASS |
| Dashboard without retired Work expectations | PASS |
| Supervisor operations ONE_OFF UI present | PASS |
| Work Plan builder retired | PASS |
| Employee SPACE page loads without Work Plan configuration prompts | PASS |
| Plant `/repairs` accessible | PASS |
| Production `space-offline.js` matches staged/certified asset | PASS |
| Finished migrations still 187 | PASS |
| Runtime logs sample (30m window via CLI) | 0 records returned in sampled window (no error burst observed) |

Mutating operational smokes (create/reassign/complete ONE_OFF; offline prepare against a live SPACE) were **not** executed on production to avoid disturbing live assignments. Reported as gaps, not invented PASS.

---

## 10. Errors or warnings

1. Dirty working tree containing uncommitted R4 harness failed typecheck until deploy used a clean `7973254` worktree — process issue only; candidate itself clean.
2. Vercel CLI notes Deployment Protection bypass for `vercel curl` on staged hostname (expected).
3. `vercel logs` CLI warns that passing deployment as positional arg is deprecated; sampled summary showed no error records in window.
4. Partner/Marketplace admin browse for the Dietary manager redirects to Dashboard (authority), so Harbor staff Marketplace browse was not exercised in this window.

---

## 11. Rollback status and recovery target

| Field | Value |
|---|---|
| Rollback executed? | **No** |
| Pre-authorized rollback deployment | `dpl_LJx7vYpGThGJtMK3hoG3hjHRfhbC` |
| Rollback SHA | `56de3123ae6e5aa99a2979d8a6200469389c3cdb` |
| Rollback availability at promote time | READY; previously served `vssyl.com` / `www.vssyl.com` |
| Recovery command pattern | `vercel rollback dpl_LJx7vYpGThGJtMK3hoG3hjHRfhbC --scope adtrauts-projects` (or promote that deployment) |
| Data note | App rollback does not restore historical Work rows destroyed by earlier destructive migration |

---

## 12. Remaining ARR-003 and ARR-008 obligations

| ARR | Post-deploy disposition |
|---|---|
| **ARR-003** | Still open — ONE_OFF compatibility, historical readers, offline commands, Prisma Work persistence. Do not drop Work/LF tables. |
| **ARR-008** | Carry to Phase 2E — eligibility hermetic debt unchanged; no material ops defect observed in this release window. |

Scheduled Evaluation cron and Web Push sending remain intentionally inactive.

---

## 13. Final production release status

**DEPLOYED — WITH GAPS**

Production is running the certified Phase 2C application tree at SHA `7973254` on deployment `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS`, with `vssyl.com` / `www.vssyl.com` promoted successfully and required non-mutating smokes passing.

Noncritical gaps: mutating ONE_OFF lifecycle and live offline prepare were intentionally not executed against production assignments; Harbor staff Marketplace browse was not exercised (facility manager correctly redirected).

**STOP.** No Phase 2D. No schema deletion. No Scheduled Evaluation / Web Push activation.
