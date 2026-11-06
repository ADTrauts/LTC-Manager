# Phase 9C — People & Coverage Integration Closure

**Verdict:** PASS — ready for PR review after local commits (not pushed).

**Branch:** `department-builder/people-coverage-composition`  
**Phase 9B baseline:** `c34c014` (composition complete; not a Phase 9C result)  
**Worktree:** `/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager-people-coverage`  
**Unrelated worktrees preserved:** `ltc-manager` (dirty main), `ltc-manager-rhythm`, `ltc-manager-key-points`, readiness worktree, and temporary `ltc-manager-phase9c-main-baseline` at `origin/main` (`5f8683d`). Port 3010 left alone.

---

## 1. Disposable SQL failures vs `origin/main`

Phase 9B reported 13 disposable SQL failures under parallel load (`Can't reach database server`, transaction timeouts).

Controlled re-run of the four implicated suites with `--test-concurrency=1` on disposable databases:

| Tree | Target | Tests | Pass | Fail | Skip | Verdict |
|---|---|---:|---:|---:|---:|---|
| `origin/main` @ `5f8683d` | `ltc_verify_phase9c_main` | 71 | 70 | 0 | 1 | `MAIN_SUITES_PASS` |
| This branch | `ltc_verify_phase9c_branch` | 71 | 70 | 0 | 1 | `BRANCH_SUITES_PASS` |

Suites: `employee-csv-update.db.test.ts`, `implementation.db.test.ts`, `space.db.test.ts`, `workbook.db.test.ts`.

**Conclusion:** No People & Coverage regression. Failures were environmental under concurrent disposable-DB pressure. No production code change and no test weakening were required.

---

## 2. Partner `/partner/coverage` Team path

**Classification:** CDA vendor-run Team authoring.

- `createPartnerTeamAction` may insert a `DepartmentTeam` when `partnerMaySetUpDepartment` allows.
- It is **not** facility Employee Builder Team authoring and does **not** create/edit/publish Coverage requirements.
- Hermetic guard: `people-coverage-ownership.hermetic.test.ts` asserts partner actions create teams via Prisma and do not touch Coverage template/publish APIs.
- Documented in `AGENTS.md` and this package README.

---

## 3. Unpublished Coverage cannot become operational

Browser evidence on disposable facility (`ltc_verify_phase9c_browser`, Next on `:3032`):

- People & Coverage shows **Cook — Required: 1 Draft** separately from **Server — Required: 2 Published**.
- Staffing board **Apply published Coverage** dropdown lists only `Phase 9C Shortage Coverage` (published).
- Draft is absent from Apply options.
- Board copy: “A draft cannot be applied.”
- Apply path remains gated by `isCoverageTemplateEffectiveOnDate` (PUBLISHED + active + date interval).

---

## 4. Browser scenarios A, C, D, E, F

Fixture: `scripts/verify/people-coverage-browser-fixtures.mjs` (run with `node --import tsx`).  
Admin: `people.coverage.admin@ltc.local` (disposable password; not printed).  
Evidence JSON: `tmp/people-coverage-browser-artifacts/phase9c-browser-evidence.json`.

| Scenario | Result | Evidence |
|---|---|---|
| **A** Large Dietary | PASS | Organization: **106 employees**, **2 Teams** (Kitchen 52 / Servery 52); no giant roster on Department Builder |
| **C** Multi-qualified | PASS | Casey MultiQual: **Kitchen Team** only; eligibility **Dishwashing + Server** checked |
| **D** Coverage shortage | PASS | Today: “Staffing needs attention”; Primary Servery Server **2 required · 1 assigned · 1 short**; schedule-alone copy present; Run board **1 / 2 AT RISK** |
| **E** Temporary Assignment | PASS | Riley remains **Kitchen Team**; Assignment at **Phase 9C Alt Dining / 1A Naval Park** Server 10:00–18:00 |
| **F** Two Departments | PASS | Dana DualDept on Plant directory; Dietary **Server** + Plant **Work Order Response**; Plant membership removable; Plant has no Team |

---

## 5. Focused hermetic results (Phase 9C ownership/presentation)

```
# tests 10
# pass 10
# fail 0
# skipped 0
```

Files: `people-coverage-ownership.hermetic.test.ts`, `people-coverage-presentation.hermetic.test.ts`.

---

## 6. Schema

No Prisma migration. Forward schema unchanged.

---

## 7. Remaining gaps (non-blocking for PR)

- Employee Builder Plant lens still lists Dietary Team filter options when opened via `?dept=` URL (cosmetic filter options; directory heading correctly says Plant Operations only).
- Full `verify:db` under high parallel concurrency remains environmentally sensitive; prefer concurrency=1 or isolated hosts for those four suites when diagnosing flakes.
- Scenarios B and G were certified in Phase 9B composition; not re-run as the Phase 9C missing set.

---

## 8. PR-readiness recommendation

**Ready to open a PR** from `department-builder/people-coverage-composition` for review/merge after these local commits land.

Do **not** push or open the PR until the product owner asks. Recommended PR title focus: People & Coverage composition + integration closure (Team authoring in Employee Builder; published-only Apply; Today/Organization/Requirements; Phase 9C SQL/browser closure).
