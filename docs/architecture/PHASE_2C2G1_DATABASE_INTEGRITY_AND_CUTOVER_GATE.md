# Phase 2C-2G-1 — Database integrity & Work cutover verification gate

**Date:** November 8, 2026  
**Verification verdict:** **PASS WITH GAPS**  
**Cutover gate:** **GO** — intended production environment verified; current plan-derived Job Flow impact is zero; ready for **separate** product-owner authorization to activate the filter.  
**Nature:** Read-only environment/schema/occupancy verification + re-confirmed hermetic shadow. **Live Work filter not activated. No migrations run. No data modified.**

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD | `b7ae64bb0488161b196555469e6c3ce8f9506d1b` (Phase 2C-2E) |
| Phase 2C-2F checkpoint | `21a70618fd848509fd35fbe9b4234452cdf1698d` |
| Ending HEAD | `21a7061` + this report / ARR update (working tree) |

Preflight: Phase 2C-2F diff verified (shadow suite + readiness report + ARR). Focused hermetics passed. Checkpoint commit created; `.neon` excluded.

---

## 2. Verified environment identities (no secrets)

| Environment | Identity | How identified | Schema vs app HEAD |
|---|---|---|---|
| Local development | Host `127.0.0.1:5432`, database `ltc_manager` | Project `.env` `DATABASE_URL` | **Behind** — Work tables absent |
| Production (Vercel project `ltc-manager`) | Neon pooler host `ep-plain-salad-avjht24p-pooler.c-11.us-east-1.aws.neon.tech`, database `neondb` | Vercel env fingerprint matches `.env.production.local` | **Compatible** — 187 finished migrations (= repo dirs) |
| Staging preview (Vercel project `ltc-manager-staging`) | Neon pooler host `ep-aged-hat-b8r8ifgz-pooler.c-14.us-east-1.aws.neon.tech`, database `neondb` | Vercel `DATABASE_URL` host fingerprint | **Behind** — 168 finished; Work tables still present (retire never applied) |
| Certification (`vssyl_cert`) | Neon pooler host `ep-cold-frog-bc28042e-pooler.c-16.us-east-1.aws.neon.tech`, database `vssyl_cert` | `.env.vssyl-cert` | Partially behind (180 finished); Work tables present; retire/restore never recorded |

**Migration execution mechanism (documented):** `npx prisma migrate deploy` against `DIRECT_URL` / unpooled URL per [Dietary V1 deployment runbook](../deployment/DIETARY_V1_DEPLOYMENT_RUNBOOK.md).  
**Backup/recovery (documented):** [Backup/restore runbook](../deployment/DIETARY_V1_BACKUP_RESTORE_RUNBOOK.md) — pre-deploy snapshot required; restore not claimed certified without demonstrated restore drill.

Credentials, connection strings, and personal data are not recorded here.

---

## 3. Migration status by inspected environment

### Production (`ltc-manager` → plain-salad / `neondb`)

| Check | Result |
|---|---|
| Finished migrations | **187 / 187** repo migration directories |
| `20261103140000_retire_generic_work_and_profiles` | Applied (`finished_at` 2026-11-06 ~21:28 UTC) |
| `20261106214500_restore_schema_after_premature_retirement` | Applied (`finished_at` 2026-11-06 ~21:44 UTC) |
| `DepartmentWork*` tables | Present (6 tables) |
| Notification / push Nov migrations | Present and finished |

### Staging (`ltc-manager-staging` → aged-hat / `neondb`)

| Check | Result |
|---|---|
| Finished migrations | **168** (≈19 pending including retire + restore) |
| Retire / restore | **Not applied** |
| `DepartmentWork*` tables | Present (never dropped) |

### Local (`ltc_manager`)

| Check | Result |
|---|---|
| Finished migrations | **179** |
| Pending (8) | notification escalation, delivery preference, push subscription, push dispatch, push authorization, revoked session, scheduled-evaluation checkpoint, **restore** |
| Retire | Applied (plus an earlier rolled-back attempt) |
| Restore | **Pending** → Work tables **absent** |
| History skew | Later migrations finished while earlier notification migrations remain pending (`team_organization_only`, retire, operational qualifications, duplicate-role retirement) |

### Certification (`vssyl_cert`)

| Check | Result |
|---|---|
| Finished | 180 |
| Retire / restore rows | None |
| Work tables | Present, empty |

---

## 4. Missing schema / migration discrepancies

1. **Local lag (elevated hygiene):** App schema expects Work tables; local DB applied retire and never restore. Not production. Do not treat as successful Work retirement.
2. **Local out-of-order history:** Pending earlier notification migrations despite later finished rows — `migrate deploy` must be planned carefully (see §14 plan); do not run in this phase.
3. **Staging lag:** Staging is many migrations behind HEAD and has **not** executed retire/restore. A future authorized deploy of pending migrations would apply retire (DROP Work tables) then restore (empty recreate), destroying any remaining staging Work rows.
4. **Production is schema-current** for this audit.

---

## 5. Potential historical data loss

| Fact | Evidence |
|---|---|
| Retirement drops Work tables and enums | `20261103140000_…/migration.sql` — `DROP TABLE` for Event, Occurrence, PlanEvent, Item, Applicability, Plan |
| Retirement comment | “No customer data. Test rows are dropped with the tables.” |
| Restore recreates empty structures | `20261106214500_…/migration.sql` header: “Empty recreate only.” Creates tables/indexes/FKs; **no data restore** |
| Production timeline | Retire finished then restore ~16 minutes later on 2026-11-06 |
| Current production Work rows | **All counts zero** |

**Classification:** Any Work Plan / occurrence / event rows that existed on production immediately before the Nov 6 retire were discarded by DROP and were **not** returned by restore. Recovery would require a Neon/Postgres backup or PITR from before retire, plus a controlled restore drill ([backup runbook](../deployment/DIETARY_V1_BACKUP_RESTORE_RUNBOOK.md)).  

This is a **historical integrity finding**, separate from whether an employee Job Flow cutover is safe **now**. No recovery attempted in this phase.

---

## 6. Work occupancy (verified aggregates)

### Production (intended runtime DB)

| Metric | Count |
|---|---|
| Plans total / published / draft / retired | **0 / 0 / 0 / 0** |
| Work items | **0** |
| Occurrences (all / plan / one-off) | **0 / 0 / 0** |
| Open plan-derived / open one-off | **0 / 0** |
| Completed plan / one-off | **0 / 0** |
| Work events | **0** |
| Facilities / departments / employees (context only) | 2 / 6 / 7 |

### Staging

| Metric | Count |
|---|---|
| Plans | **1** (status **RETIRED**, never published, **0** items) |
| Occurrences / events | **0** |
| Open plan-derived | **0** |

### Local

Occupancy **not measurable** (tables absent).

### Certification

All Work aggregates **0**.

**Production Work Plan occupancy for live Job Flow: VERIFIED EMPTY (zero published plans; zero open plan-derived occurrences).**  
Do not confuse with fixture emptiness — these are live environment aggregates.

---

## 7. Canonical replacement coverage / employee impact

With **zero** published plans and **zero** open plan-derived occurrences on production and staging:

| Class | Current impact of hiding plan-derived CompatWork |
|---|---|
| Already covered by Records / OR / WO/PM | N/A — nothing plan-derived is currently composed from DB |
| Not represented | N/A for active rows |
| Historical / inactive | Staging has one retired empty plan; production Work history empty after restore |
| Employee Job Flow loss if filter activated now | **None expected** for plan-derived items |

Qualitative replacement matrix from 2C-2E/2F remains guidance for any **future** reintroduction of plan authoring (which stays retired). No auto-conversion performed.

---

## 8. Shadow test results (reconfirmed)

Focused hermetics (18 pass, 0 fail): Phase 2C-2F shadow, 2C-2E source separation, Phase 2A/2B authoring fences.

| Invariant | Result |
|---|---|
| Proposed composition excludes `WORK_PLAN` CompatWork | Pass |
| `ONE_OFF` retained | Pass |
| Records / Key Points / WO / exceptions unchanged | Pass |
| Next-action deterministic; no invented overdue | Pass |
| Helper **not** referenced in `compose.ts` / `load-flow.ts` / `present.ts` | Pass |

---

## 9. Online / offline transition risks

Recommended policy for a **future authorized** cutover (not implemented here):

| Topic | Policy |
|---|---|
| New online Job Flow | Omit plan-derived CompatWork items |
| New offline bundles | Do not advertise plan-derived items as actionable responsibilities |
| Pre-cutover bundles / queued `COMPLETE_OPERATIONAL_TASK` | Must still resolve to receipt or conflict — never silent discard |
| One-off commands | Remain supported |
| Historical occurrences | Preserve rows/read paths; production currently has none |
| Online vs cached offline inconsistency | Possible until tablet refresh; mitigate by keeping completion APIs accepting valid occurrence keys and returning explicit outcomes |

No offline protocol change in this phase.

---

## 10. Remaining dependencies (readers not removed)

| Consumer | Blocks employee cutover? |
|---|---|
| Employee Job Flow compose/present | Primary target — independent |
| Offline item snapshot | Follows items after online |
| Offline `workContext` / Work commands | Keep during transition |
| Dashboard Expected Work | Can lag; staging historically showed “No Work Plans are published” |
| Supervisor exceptions / one-off UI | Keep one-off |
| Location sequencing / Harbor presets / partner pages | Soft / later |
| RLS / Operational Review | Already Work-independent |

Employee cutover can proceed **independently** of Dashboard/supervisor reader removal.

---

## 11. Product-owner decisions

### Required to **authorize** employee cutover (checkbox approval)

1. Authorize wiring `withoutPlanDerivedCompatibilityWork` into employee compose/present only.  
2. Retain one-off supervisor Work temporarily.  
3. Keep valid Work completion commands (including any rare plan-derived keys) returning receipts/conflicts during transition.  
4. Accept that production Work history is empty post-restore; historical recovery is a separate program if ever needed.

### Non-blocking for employee cutover (carry forward)

5. Timing of Dashboard Expected Work / supervisor plan-exception retirement.  
6. Plant visual / generator checks → Records (not PM by default).  
7. EVS evidence vs cleaning execution ownership.  
8. Local/staging migration hygiene authorization (separate ops).

---

## 12. Recommended cutover order (after PO authorization)

1. Optional: snapshot production DB (runbook) before app deploy.  
2. Deploy app that filters plan-derived CompatWork in employee composition only.  
3. Verify Job Flow empty of plan-derived items; one-off still works; canonical items unchanged.  
4. Keep offline Work command processing intact.  
5. Later phases: Dashboard/supervisor readers; offline `workContext` trim; schema drop only with separate approval.

---

## 13. Proposed rollback

| Layer | Action |
|---|---|
| App | Redeploy prior SHA that still composes plan-derived CompatWork (helper remains unused today). |
| Data | No data migration in cutover — rollback is app-only. |
| Schema | Do not reverse Prisma migrations; do not drop Work tables in the cutover. |

---

## 14. Migration reconciliation plan (separately authorized — **not executed**)

### Local `ltc_manager`

1. Confirm disposable / non-production.  
2. Backup/snapshot if any local rows matter.  
3. Review pending 8 migrations for conflicts with already-applied later migrations (history skew).  
4. Prefer forward `prisma migrate deploy` only after checksum/history review; if Prisma refuses skipped earlier migrations, use documented repair with explicit approval — **never** `migrate reset` without opt-in.  
5. Goal: apply restore so Work tables match schema; expect **empty** Work tables after restore if retire already dropped them.

### Staging

1. Snapshot.  
2. Expect pending set includes retire then restore — will **DROP** existing Work rows (currently 1 retired empty plan) then recreate empty tables.  
3. Apply only when staging schema alignment is explicitly authorized.  
4. Re-check occupancy after deploy.

### Production

No pending migrations observed. No migrate action recommended for cutover.

---

## 15. Files changed this phase

| Path | Change |
|---|---|
| `docs/architecture/PHASE_2C2G1_DATABASE_INTEGRITY_AND_CUTOVER_GATE.md` | This gate |
| `docs/architecture/PHASE_0_ARCHITECTURE_RECONCILIATION_REGISTER_2026-11-08.md` | ARR-001/003 occupancy + gate note |
| Prior checkpoint | Phase 2C-2F commit `21a7061` |

No application runtime code changed. Filter remains inactive.

---

## Gate verdict

### Verification: **PASS WITH GAPS**

Gaps: local and staging migration lag (hygiene); historical production Work rows not recoverable without backup/PITR; no live tablet/browser certification; Scheduled Evaluation host still inactive (unrelated).

### Cutover: **GO**

Intended production environment is schema-compatible and shows **zero** current plan-derived Work occupancy. Hermetic cutover mechanism remains sound and unwired.  

**GO means ready for separate product-owner authorization — it does not activate the filter.**

**STOP** after Phase 2C-2G-1.
