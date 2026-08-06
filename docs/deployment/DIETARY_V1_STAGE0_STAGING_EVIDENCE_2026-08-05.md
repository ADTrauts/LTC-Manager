# Dietary V1 Stage 0 Staging Evidence

**Product:** LTC Manager (not Vssyl)  
**Phase:** 8B Stage 0  
**Date opened:** 2026-08-05  
**Owner authorization:** Render Hobby, ≤ $60/mo, staging only, platform-default HTTPS URL  
**Frozen certified release:** `release/dietary-v1-pilot-certified-2026-08-05` @ `80353dfcc870f4bd53de95cad3fd91d93ba5056b`  
**Deployable lineage:** Phase 8A tip `20a19c26abc957344b710cfdad0fd1b7fa0b2d5d` + Phase 8B docs (exact deployed SHA recorded below)

Do not place real Employee names, emails, PINs, passwords, or secrets in this document.

---

## Cost gate

| Item | Value |
|------|--------|
| Hard ceiling | $60 USD / month |
| Projected floor (list) | ≈ $45–50 (Standard web $25 + Basic-1gb $19 + 1 GB disk $0.30 + Starter cron ≈ $1–3) |
| Headroom | ≈ $10–15 |
| Storage autoscaling | **OFF** (required) |
| Custom domain | **Not configured** (Stage 0) |
| Pro workspace | **Not purchased** |

Restore drills that temporarily spin a second Postgres instance must be destroyed the same day so prorated cost stays within ceiling. Prefer `CREATE DATABASE` restore targets on the same instance when proving logical dumps.

---

## Provisioning status

| Item | Value |
|------|--------|
| Provider | Render |
| Workspace tier | Hobby |
| Blueprint | `render.yaml` |
| Web service name | `ltc-manager-dietary-v1-staging` |
| Web plan | Standard |
| Postgres name | `ltc-manager-dietary-v1-staging-db` |
| Postgres plan | Basic-1gb |
| Postgres version | 16 (target) |
| Database name | `ltc_staging_dietary_v1` (never `ltc_manager`) |
| Disk | 1 GB |
| Cron | `ltc-manager-dietary-v1-staging-auth-rate-limits` (Starter, daily 06:15 UTC) |
| Auto-deploy | **off** |
| Platform-default HTTPS URL | _pending provision_ |
| Deployed SHA | _pending first successful deploy_ |
| PostgreSQL version confirmed | _pending_ |
| Projected monthly cost after provision | _pending dashboard confirmation_ |

---

## Blockers (active)

| Blocker | Class | Notes |
|---------|-------|-------|
| Paid Render deferred by owner | OWNER DECISION | 2026-08-06 — push off payment as long as possible; complete local build/rehearsal first, then set up Render. No paid resources until owner re-authorizes card + provision. |
| Render payment method missing | CONFIGURATION REQUIRED | Blueprint validate returns `need_payment_info`. Hobby workspace ready; **Add Card** required before paid resources. |
| Supplemental object storage for ≥14-day logical dumps | CONFIGURATION REQUIRED | Needed when Render staging is stood up; not required for local rehearsal |
| Staging FA password delivery channel | OPERATIONAL PROCEDURE REQUIRED | Generate out-of-band; never commit |

## Cleared blockers

| Item | Notes |
|------|-------|
| Render CLI auth | Login successful 2026-08-06; workspace `Andrew's workspace` (`tea-d9q5r1vlk1mc73el6o90`); Hobby plan confirmed |

## Local rehearsal track (authorized while Render deferred)

| Activity | Status |
|----------|--------|
| Paid Render provisioning | **Deferred** — no cloud resources, no spend |
| Host PG14 disposable DB `ltc_staging_local_rehearsal` | Retained as secondary compatibility evidence only |
| Docker PostgreSQL **16.14** disposable DBs | Created, rehearsed, container removed 2026-08-06 |
| Staging-faithful DB `ltc_staging_local_rehearsal_pg16` | Migrate 65 + bootstrap FA (no demo seed) |
| Verify gates DB `ltc_verify_stage0_pg16` | Automated Assignment / Offline / Dietary-pilot smokes |
| Unique local secrets (gitignored `.local-staging/`) | Done — not shared with future Render |
| Node 20 production build | **PASS** |
| Health probes | live/ready PASS on PG16 staging and restore drill |
| Local automated smokes | **PASS** (see LOCAL STAGE 0 REHEARSAL) |
| Local logical dump + isolated restore | **PASS** (rehearsal only — not backup certification) |
| `verify:pilot-environment` HTTPS | Deferred until Render |
| Managed PITR / offsite retention | Deferred until Render |

---

## LOCAL STAGE 0 REHEARSAL

**Date:** 2026-08-06  
**Deployable SHA rehearsed:** `9253a71f67fb4df4c01b8b989c834eab6bed62c4` (Phase 8B tip; certified product + Phase 8A closures + Stage 0 docs)  
**Frozen certified release (unchanged):** `80353dfcc870f4bd53de95cad3fd91d93ba5056b`  
**Recommendation:** **LOCAL STAGE 0 REHEARSAL: PASS WITH FINDINGS**

Do **not** interpret this as STAGING CERTIFIED, PILOT ENVIRONMENT READY, BACKUP READY, or DEPLOYMENT READY.

### 1. Local environment

| Item | Value |
|------|--------|
| OS | Darwin 23.6.0 x86_64 (macOS) |
| Node | v20.19.2 |
| App runtime | Next.js 16.2.1 production (`npm run build` / `npm start`) |
| Host Postgres (Homebrew) | **14.18** — secondary evidence DB `ltc_staging_local_rehearsal` retained |
| Primary rehearsal Postgres | Docker `postgres:16-alpine` → **16.14** on `127.0.0.1:5433` |
| Secrets | `.local-staging/rehearsal-pg16.env`, `verify-pg16.env` (gitignored; mode 600) |
| `ltc_manager` | Present on host PG14; **not targeted**; no rehearsal writes |

### 2. PostgreSQL 16 result

| Item | Result |
|------|--------|
| Available without material burden? | **Yes** — Docker Desktop already installed; daemon started; `postgres:16-alpine` pulled |
| Disposable DBs | `ltc_staging_local_rehearsal_pg16`, `ltc_verify_stage0_pg16` |
| Migrations on staging-faithful DB | **65** finished |
| Bootstrap | `db:bootstrap-pilot-admin` PASS — synthetic FA `staging.fa.pg16@example.com` (password not recorded here) |
| Demo seed on staging-faithful DB? | **No** |
| PG14 path | Retained only as secondary compatibility evidence |

### 3. Configuration rehearsal (Admin UI / bootstrap)

Staging-faithful app on `http://127.0.0.1:3320` after bootstrap:

| Component | Result |
|-----------|--------|
| Facility | Created by bootstrap — **Terrace View Staging Local PG16** |
| Dietary / EVS / Plant departments | Present from bootstrap |
| Facility Structure UI | Available (`/admin/facility/builder`) — Add Floor / Neighborhood / Room; empty until operator configures |
| Employees UI | Available — Add employee + Import; FA employee present; No PIN (expected for FA) |
| Assignment Board route | Available to FA after login |
| Feature flags | Via env (`OPERATIONAL_ASSIGNMENTS_ENABLED=true`, `OPERATION_ENGINE_ENABLED=false`) — **not** Admin UI toggles |

**Findings (ordinary setup still needing non-Admin paths):**

| Finding | Class |
|---------|-------|
| Login page still shows “Seeded admin for development: admin@terraceview.local” on a bootstrap-only DB | LOCAL STAGE 0 FINDING — misleading copy on staging-faithful login |
| Assignment / Operation Engine flags require environment variables | ACCEPTED for Phase 8A design — document for operators |
| Pilot-scale ~100 Employees / ~17 serverys via one-by-one Admin entry is impractical | LOCAL STAGE 0 FINDING — use Admin Import and/or controlled fixtures; automated gates use repository fixtures on `ltc_verify_*` only |
| Automated browser gates require `ltc_verify_*` + **demo seed** (LOCAL/CI ONLY) | Documented separation from staging-faithful bootstrap path — not used against pilot production |

No ordinary Admin setup step required direct SQL during this rehearsal.

### 4. Assignment smoke

Source: `npm run test:assignment-browser` on `ltc_verify_stage0_pg16` (PG16).

| Check | Result |
|-------|--------|
| Supervisor opens Assignment Board (@~100 scale roster) | PASS (board load ~4.6s) |
| Create + confirm plan | PASS (~9.2s) |
| Employee sees confirmed Assignment only after confirm | PASS |
| Draft remains hidden until confirm | PASS (covered by visibility gate) |
| Coverage page links to Assignment Board | PASS |
| STAFF denied Board; FA without ops cannot create | PASS |
| Write-time overlap rejected | PASS |
| Gate exit | **0** (6 passed, ~49s wall including migrate/seed/fixtures) |

### 5. Milestone smoke

Source: `DIETARY_PILOT_CI_GATE=1 npm run test:dietary-pilot` on PG16 verify DB.

| Check | Result |
|-------|--------|
| Call-offs / coverage summary | PASS |
| Assignment create/confirm/visibility | PASS |
| GM staffing coverage + unit milestones / timing | PASS |
| Quick PIN + bound Unit + Servery Ready + Meal Service Started (incl. offline path) | PASS |
| Ready vs Started remain separate | PASS (pilot gate design) |
| Overlap + STAFF denial | PASS |
| Gate exit | **0** (5 passed, ~65s wall) |

### 6. Offline smoke

Source: full `npm run test:offline-browser` (CI gate + matrix) on PG16 verify DB.

| Check | Result |
|-------|--------|
| Service worker install/activate | PASS |
| Offline shell / bundle / IndexedDB | PASS |
| Offline Ready / Started queue + sync semantics | PASS (CI + matrix) |
| Sign-out isolation | PASS |
| Session revocation while offline | PASS (scenario-18/19) |
| Device revocation blocks sync / new queue | PASS (scenario-21) |
| Unit rebind does not retarget queued work | PASS (scenario-29) |
| No-bundle / conflict / cross-unit / termination paths | PASS (matrix) |
| Gate exit | **0** (25 passed, ~161s wall) |

### 7. Revocation and isolation

Covered by offline matrix scenarios 18/19/21/27/28/29 — all PASS on PG16. Staging-faithful UI also exposes Sign out & unbind device for FA.

### 8. Backup and restore rehearsal (local only)

| Step | Result |
|------|--------|
| Tooling | Host `pg_dump` 14.18 **cannot** dump PG16 — used `docker exec … pg_dump` / `pg_restore` |
| Dump | Custom-format dump under `.local-staging/dumps/` (gitignored); meta records timestamp, DB name, SHA — no credentials |
| Restore target | `ltc_verify_restore_*` (new DB); never overwrote active rehearsal DB |
| Migrations after restore | **65** finished names confirmed |
| Record classes present | Facility, Department, User, OperationalAssignment, ServeryMealServiceEvent, OfflineSyncReceipt, OfflineConflict (table name), Unit/Employee empty on bootstrap-only dump |
| Temp app `/api/health/ready` against restore | PASS — authSecret/database/migrations true |
| Restore DB dropped after drill | Yes |
| Managed / offsite backup claim | **NOT CLAIMED** |

### 9. Performance observations (local only)

Do **not** claim hosted-production performance.

| Observation | Local measurement |
|-------------|-------------------|
| Assignment Board load @~100 roster | ~4.6s (Playwright wall for that test) |
| Assignment create+confirm | ~9.2s |
| Full assignment gate | ~49s including migrate/seed/fixtures/server |
| Full offline matrix (25 tests) | ~2.3m Playwright; ~161s wall |
| Dietary pilot CI (5 tests) | ~38s Playwright; ~65s wall |
| Production cold `next start` ready | Typically <10s after listen on localhost |

Scale data (~100 employees) came from repository verify fixtures on `ltc_verify_stage0_pg16`, not from Admin-entered Terrace View production data.

### 10. Automated gates summary

| Gate | DB | Exit | Elapsed |
|------|-----|------|---------|
| `test:assignment-browser` | `ltc_verify_stage0_pg16` | 0 | 49s |
| `test:offline-browser` (full) | same | 0 | 161s |
| `test:dietary-pilot` (`DIETARY_PILOT_CI_GATE=1`) | same | 0 | 65s |

### 11. Disposable resources removed

| Resource | Disposition |
|----------|-------------|
| Docker container `ltc-pg16-stage0` | Stopped and removed |
| PG16 DBs inside container | Destroyed with container |
| Temporary restore DB | Dropped before container removal |
| Temp next servers (3316/3320/ephemeral gate ports) | Stopped |
| Host `ltc_manager` | Untouched |
| Host `ltc_staging_local_rehearsal` (PG14) | Retained locally as secondary evidence |
| Gitignored dumps/logs under `.local-staging/` | Retained on disk for operator reference; not in Git |

### 12. Remaining cloud-only requirements

- Render payment method + Hobby Stage 0 provision (≤ $60)
- Platform-default HTTPS URL
- `verify:pilot-environment` against HTTPS
- Managed Postgres PITR + ≥14-day offsite logical retention
- Platform logs / alerts / maintenance cron evidence
- Device/offline rehearsal on real shared tablets over HTTPS
- Custom domain (explicitly deferred)

### 13. Local Stage 0 recommendation

**LOCAL STAGE 0 REHEARSAL: PASS WITH FINDINGS**

Local PG16 + production build + bootstrap path + repository-owned browser gates demonstrate Assignment, Milestone, offline, revocation, GM coverage, and logical restore rehearsal. Findings above must remain visible. Hosted staging certification remains blocked until paid Render Stage 0 completes.

---

## Migration / bootstrap / flags (hosted staging — still pending)

| Check | Result |
|-------|--------|
| Hosted `prisma migrate deploy` | Deferred until Render |
| Demo seed on hosted staging | **Forbidden** |
| Hosted bootstrap | Deferred until Render |
| Feature flags on hosted | Deferred — blueprint already encodes Assignments on / Engine off |

---

## Acceptance and smoke (hosted — deferred)

| Check | Result |
|-------|--------|
| `verify:pilot-environment` | Deferred until HTTPS staging |
| Hosted Assignment / Milestone / offline / revocation / GM | Deferred — local PASS WITH FINDINGS above |

---

## Backup / restore (hosted — not claimed)

| Check | Result |
|-------|--------|
| Native PITR | Deferred until Render |
| Daily logical dump offsite ≥14 days | Deferred |
| Hosted restore drill | Deferred |
| Backup readiness claim | **NOT CLAIMED** |

---

## Logs / alerts / maintenance (hosted — pending)

| Check | Result |
|-------|--------|
| Platform logs / failure notifications / maintenance cron | Deferred until Render |

---

## Remaining after Stage 0 (not authorized here)

- Pilot production
- Custom domain (paid)
- Render Pro upgrade
- Ceiling increase
- Real Employee data
- Stage 1 operational use
- `main` merge
- Changes to frozen certified release
