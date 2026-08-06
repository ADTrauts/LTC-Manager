# Dietary V1 Pilot Environment Decision Record

**Date:** 2026-08-05  
**Product:** LTC Manager (not Vssyl)  
**Phase:** 8A — Deployment Architecture, Operational Readiness, and Controlled-Launch Plan  
**Certified product source:** `release/dietary-v1-pilot-certified-2026-08-05` @ `80353dfcc870f4bd53de95cad3fd91d93ba5056b`  
**Deployment-readiness branch:** `deployment/dietary-v1-pilot-environment-phase-8a-2026-08-05`

---

## Purpose

Convert the certified Dietary V1 product into a deployable controlled-pilot environment plan. This phase does not add major product features. It documents how the certified application will be hosted, configured, migrated, secured, backed up, monitored, restored, updated, rolled back, supported, provisioned for Terrace View, and operated during a controlled pilot.

---

## Certified source freeze

| Item | Value |
|------|--------|
| Certification tip | `80353dfcc870f4bd53de95cad3fd91d93ba5056b` |
| Release branch (immutable product source) | `release/dietary-v1-pilot-certified-2026-08-05` |
| Frozen candidate | `pilot/dietary-v1-candidate-2026-08-05` @ `4a5da5531f6bd2ae7766a8f8027de0ca9e6bb9dc` |
| Local `main` | `704adc72abb46705a4451608a2fadf84215f42be` (unchanged) |
| `origin/main` | `6380b661a64e8f020d16813342945797a50bc0e0` (unchanged) |
| Migrations | 65 |
| Product readiness | READY WITH FINDINGS |
| Environment readiness (pre-8A) | DEPLOYMENT DECISION REQUIRED |

Do not modify the release branch after creation. All Phase 8A work lands on the deployment-readiness branch.

---

## Repository requirements inventory

| Requirement | Repository evidence | Required for pilot? | Environment dependency | Current readiness | Risk | Decision needed |
|-------------|---------------------|---------------------|------------------------|-------------------|------|-----------------|
| Node 20.x | `package.json` engines `>=20 <21`; CI Node 20 | Yes | Host runtime | Ready | Wrong Node fails build | Pin Node 20 |
| Next.js 16 production server | `next@16.2.1`; `npm start` → `next start` | Yes | Process host + HTTPS | Ready | Cold start / multi-instance | Choose host |
| Build | `npm run build` → `verify-build.mjs` / Next production build | Yes | Build agent | Ready | Must run `prisma generate` | Use `npm ci` → build → start |
| PostgreSQL 16 | CI `postgres:16`; Prisma `provider = postgresql` | Yes | Managed or ops-supported Postgres | Ready in repo | Pooler vs direct URL | Provision DB + `DIRECT_URL` |
| 65 forward migrations | `prisma/migrations/*`; `prisma migrate deploy` | Yes | Migration identity | Ready | No migrate rollback | Ops procedure |
| `AUTH_SECRET` | `src/lib/auth.ts`, PIN HMAC, rate-limit keys | Yes | Secret store | Config required | Rotation invalidates sessions/PINs | Generate ≥32 chars |
| `OPERATIONAL_ASSIGNMENTS_ENABLED=true` | `feature-flags.ts` default false | Yes | Env | Config required | Silent deny if unset | Set on pilot |
| `OPERATION_ENGINE_ENABLED=false` | default false | Yes (keep off) | Env | Ready off | Accidental enable | Leave false |
| HTTPS | Secure cookies when `NODE_ENV=production`; SW requires HTTPS | Yes | TLS terminator / platform | Provider decision | Cookies/SW fail without TLS | Select HTTPS path |
| Service worker scope `/` | `public/sw.js`, `PwaRegister` | Yes (tablets) | HTTPS + static assets | Ready | Cache isolation | Allow `/sw.js`, manifest, icons |
| Health probes | `/api/health/live`, `/api/health/ready` | Yes | Load balancer | Ready (Phase 8A) | Blind restarts without probes | Wire probes |
| Auth rate-limit cleanup | `maintenance:auth-rate-limits` | Yes | Scheduler | Procedure required | Table growth | Schedule after provider |
| Pilot FA bootstrap | `npm run db:bootstrap-pilot-admin` | Yes | Operator + DB | Ready (Phase 8A) | Demo seed unsafe | Never seed prod |
| Demo seed | `prisma/seed.mjs` | No (LOCAL/CI ONLY) | Disposable DB | Unsuitable for prod | Demo FA/password | Refuse on pilot |
| Email/SMTP | None in dependencies | No | — | N/A | Invites DB-only | Accept limitation |
| Object storage | Local `uploads/` only | No for Dietary core | Disk / later object store | Local-only | Lost on redeploy | Skip handbook or shared volume |
| Stripe | Optional; omit keys to skip billing | No | Stripe account | Optional | Onboarding payment if keys set | Omit for pilot |
| WebSockets | None | No | — | N/A | — | HTTP only |
| Docker / CD | None | Soft | Hosting | Absent | Ad-hoc deploys | Provider choice |
| CI Verify | `.github/workflows/verify.yml` | Soft | GitHub Actions | Ready as gate | Does not deploy | Keep as quality gate |

### Explicit posture

| Topic | Finding |
|-------|---------|
| Stateful dependencies | PostgreSQL (authoritative); browser IndexedDB offline queue; optional local uploads |
| Stateless components | Next.js Node process; versioned SW shell cache |
| Persistent storage | Postgres required; uploads optional and not multi-instance safe |
| Scheduled maintenance | Auth rate-limit bucket cleanup (24h retention of expired unlocked buckets) |
| HTTPS | Required for production cookies and service workers |
| WebSockets | None |
| Filesystem writes | Union handbook PDFs under `uploads/` — not required for Dietary V1 core |
| Cookie security | `ltc_session` / device cookies: httpOnly, Secure in production, SameSite=Lax |
| Connection pooling | Prefer pooler `DATABASE_URL` + `DIRECT_URL` for migrate; one PrismaClient per process |
| Multi-instance safety | Auth/sessions/rate-limits/offline sync OK; local uploads not shared |
| Cold-start sensitivity | Missing `AUTH_SECRET` hard-fails; migrate before traffic; use readiness probe |
| Migration ordering | Forward-only 65 migrations; never edit applied SQL |
| Seed behavior | LOCAL/CI ONLY — demo Terrace View; production bootstrap is FA script |
| Restore requirements | Restore Postgres + same `AUTH_SECRET`; device queues are local |

---

## Environment architecture (minimum controlled pilot)

```text
[Shared tablets / browsers]
        | HTTPS
        v
[TLS terminator / platform edge]
        |
        v
[Next.js app — 1..N instances, NODE_ENV=production]
   |  health: /api/health/live , /api/health/ready
   |  SW: /sw.js scope /
   v
[PostgreSQL — managed preferred]
   - app runtime role (DML)
   - migration/deploy role (DDL) used only during deploy
   - automated backups + restore procedure
[Secrets store]
   - AUTH_SECRET, DB URLs, optional Stripe
[Logs / alerts]
   - stdout JSON telemetry + platform logs
   - availability, 5xx, DB, backup failure
[Scheduler]
   - maintenance:auth-rate-limits (pilot-confirmed)
```

### Trust boundaries

1. Browser / shared tablet (untrusted; device binding + session revocation).
2. TLS edge (terminates HTTPS; does not invent auth).
3. Application process (authorization in platform registry + handlers; never trusts client `X-Forwarded-For` for rate limits).
4. Database (authoritative state).
5. Secrets store (operator-only).
6. Backup storage (restricted; restore into isolated targets only).

### Failure domains

| Domain | Impact | Fallback |
|--------|--------|----------|
| App instance | Temporary unavailability | Restart / replace instance; paper continuity |
| Database | Full outage | Paper + restore |
| Single tablet offline | Local queue | Sync when online; paper if queue at risk |
| Secret loss / AUTH_SECRET rotation | Sessions and PIN digests invalidated | Controlled re-provision |
| Backup failure | Recovery risk | Pause pilot until backup restored |

Do not add infrastructure without a demonstrated requirement. Prefer the smallest architecture that satisfies security, reliability, backup, recovery, HTTPS, service workers, database integrity, and supportability.

---

## Provider-neutral decision matrix

Exact vendor pricing and some current product capabilities require external research before final selection. Do not estimate prices from memory.

| Criterion | Option 1: Managed app + managed Postgres | Option 2: Containers + managed Postgres | Option 3: VM / manual host + Postgres | Option 4: Existing repo-compatible cloud (evidence) |
|-----------|------------------------------------------|-----------------------------------------|---------------------------------------|-----------------------------------------------------|
| Setup complexity | Low–medium | Medium | High | Insufficient evidence — no Dockerfile/CD in repo; `.env.example` mentions Supabase pooler pattern only as URL comment |
| Monthly ops burden | Low | Medium | High | Unknown |
| HTTPS / domain | Usually built-in | Ingress / LB | Manual certs | Unknown |
| PostgreSQL | Managed companion | Managed companion | Self or managed | Supabase-compatible URLs evidenced; not chosen |
| Backup / restore | Platform features (verify) | Managed DB features | Operator-built | Research required |
| Secrets | Platform secrets | Secret manager / env | Files / manager | Research required |
| Logs / errors | Platform + stdout | Platform + stdout | Syslog / agent | Research required |
| Scheduled maintenance | Cron / jobs add-on | CronJob / scheduler | cron | Research required |
| Next.js support | Confirm Node 20 long-running `next start` (not assume serverless-only) | Container CMD `next start` | Same | Research required |
| Service workers | Static assets + HTTPS | Same | Same | Same |
| Prisma migrate | Release job / one-off | Init job / CI deploy step | SSH / script | Research required |
| Connection pooling | Often needed on serverless; prefer always-on Node for pilot | Native | Native | Pooler URL pattern documented |
| Scaling | Platform | Horizontal pods | Manual | — |
| Rollback | Prior immutable release | Prior image tag | Prior build | — |
| Cost predictability | Research required | Research required | Research required | Research required |
| Vendor lock-in | Medium | Lower app portability higher ops | Lowest platform lock-in | Medium if Supabase-specific |
| Required expertise | Low–medium | Medium–high | High | Medium |
| Pilot suitability | **RECOMMENDED FOR CONTROLLED PILOT** when platform supports long-running Node 20 + managed Postgres + HTTPS | **VIABLE WITH OPERATING BURDEN** | **VIABLE WITH OPERATING BURDEN** (not preferred) | **INSUFFICIENT EVIDENCE** as a complete environment; URL comments alone are not a chosen stack |
| Production suitability after pilot | Strong if ops mature | Strong | Possible but costly | Unknown |

### Recommendation

**RECOMMENDED CATEGORY:** Option 1 — Managed application platform that runs a long-lived Node 20 process (`next start`) plus managed PostgreSQL 16, HTTPS/custom domain, secrets, logs, and automated database backups.

**PROVIDER DECISION REQUIRED.** Final vendor selection needs:

1. Confirmation the platform runs long-lived Node (not a serverless model incompatible with `next start` assumptions without further design).
2. Current managed Postgres backup/PITR capabilities and restore documentation.
3. Current secrets, cron/scheduler, and log retention offerings.
4. Current pricing for expected pilot size (single Facility, ~100 Employees, shared tablets).

Until that research is complete and an owner approves a vendor, classify:

**DEPLOYMENT ARCHITECTURE:** RECOMMENDED CATEGORY IDENTIFIED + PROVIDER DECISION REQUIRED  
**PILOT ENVIRONMENT READINESS:** CONFIGURATION REQUIRED (after provider) / not ready to go live

---

## Environment separation

| Environment | Purpose | Data | Secrets | Notes |
|-------------|---------|------|---------|-------|
| Local development | Developer only | Synthetic / personal | Dev `.env` | Never production truth; `ltc_manager` forbidden for verify/maintenance/bootstrap |
| CI verification | Automated gates | Disposable `ltc_ci_*` / `ltc_verify_*` | Synthetic CI secrets | Auto teardown |
| Pilot staging | Production-like rehearsal | Synthetic / sanitized | Staging-only secrets | Migration + device + restore drills; no operational reliance |
| Pilot production | Terrace View Dietary controlled pilot | Real pilot operational data | Unique production secrets | Backups, monitoring, change control |

Forbidden:

- Using `ltc_manager` as pilot production or verification target  
- Using CI DB as staging  
- Sharing `AUTH_SECRET` across unrelated environments  
- Real Employee records in CI fixtures  

See `DIETARY_V1_ENVIRONMENT_VARIABLES.md` for the variable matrix.

---

## Database plan

1. Provision empty PostgreSQL 16 database (not `ltc_manager`).  
2. Create restricted application role (DML).  
3. Create migration/deploy identity (DDL) used only during deploy.  
4. Validate connectivity (`DIRECT_URL` for migrate; pooler URL for runtime if used).  
5. Run `npx prisma migrate deploy` — confirm **65** finished migrations.  
6. Confirm migration-history exception governance remains intact (`npm run verify:migrations`).  
7. Run approved bootstrap: `npm run db:bootstrap-pilot-admin` (not demo seed).  
8. **Seed decision:** `prisma/seed.mjs` = **LOCAL/CI ONLY**.  
9. Configure Facility / Dietary Department / Locations / Employees / devices / meal times / coverage via Admin UI (and controlled import if approved).  
10. Set `OPERATIONAL_ASSIGNMENTS_ENABLED=true`; keep `OPERATION_ENGINE_ENABLED=false`.  
11. Run smoke tests + capture deployment record.  

Bootstrap script requirements (implemented): refuses `ltc_manager`, requires strong FA password and AUTH_SECRET, creates FA only (no demo PIN), does not print secrets, single-use by default, optional onboarding-complete flag.

---

## Backup and restore

See `DIETARY_V1_BACKUP_RESTORE_RUNBOOK.md`.

**Do not claim backup readiness until a restore is demonstrated** into an isolated database.

Initial targets (owner approval required):

| Metric | Starting proposal | Classification |
|--------|-------------------|----------------|
| Backup frequency | Continuous / ≥ daily full + PITR if available | PILOT STARTING THRESHOLD — REQUIRES OWNER APPROVAL |
| Retention | ≥ 14 days | Same |
| RPO | ≤ 24 hours (prefer ≤ 1 hour with PITR) | Same |
| RTO | ≤ 4 hours for pilot | Same |

---

## Deployment and rollback

See `DIETARY_V1_DEPLOYMENT_RUNBOOK.md`.

| Change class | Recovery |
|--------------|----------|
| APPLICATION-ONLY | Redeploy prior immutable release when schema compatible |
| FORWARD-COMPATIBLE MIGRATION | App rollback permitted under documented compatibility |
| NON-ROLLBACKABLE SCHEMA CHANGE | Forward correction or database restore |

Prisma migrations are forward history. Do not promise automatic migration rollback.

---

## Security plan

| Area | Requirement |
|------|-------------|
| HTTPS | Mandatory in pilot production |
| Cookies | Secure + HttpOnly + SameSite=Lax |
| Secrets | Unique per environment; AUTH_SECRET ≥ 32 chars; rotate with PIN re-issue plan |
| Database | TLS in transit; least-privilege roles; no public open access |
| Proxy / X-Forwarded-For | Diagnostic only; never keys auth rate limits (Phase 1) |
| Auth | Durable rate limits; immediate session revocation; device bind/unbind |
| CSP / CORS | Not configured in Next config today — edge headers CONFIGURATION REQUIRED if policy demands |
| Errors / logs | No secrets in responses; telemetry is structured console |
| Offline | Expired/revoked sessions fail closed; bundles not silently accepted |
| SW cache | Allowlisted shell only; no protected HTML/API caching |

Production security checklist lives in the deployment runbook. No secret values in docs.

---

## Monitoring and maintenance

### Health

- Liveness: `GET /api/health/live` → process up  
- Readiness: `GET /api/health/ready` → AUTH_SECRET present, DB reachable, migrations finished (booleans only)

### Monitoring (integrate with platform later; do not build an in-app APM)

Application unavailable · elevated 5xx · auth failures · rate-limit locks · DB connection failures · migration failure · offline sync rejection spikes · conflict accumulation · backup failure · storage capacity · slow response · SW update issues where observable

### Maintenance schedule (provider-neutral; do not activate until provider selected)

| Command | Frequency | Owner | Dry run | Failure alert | Idempotent | Data removed | Recovery |
|---------|-----------|-------|---------|---------------|------------|--------------|----------|
| `maintenance:auth-rate-limits` | Daily | Technical owner | `--dry-run` | Yes | Yes | Expired unlocked rate-limit buckets only | Re-run; locks preserved |
| Offline receipts / conflicts | Not auto-deleted | — | — | — | — | Retention policy required first | — |
| Uploads temp | N/A unless handbook used | — | — | — | — | — | — |

Pilot mode: `MAINTENANCE_ALLOW_PILOT=1` + `MAINTENANCE_CONFIRM_DATABASE_NAME=<exact>` still refuses `ltc_manager`.

---

## Terrace View configuration

Synthetic references only — no real Employee names, PINs, emails, or passwords in repository docs.

| Component | Approach | Classification |
|-----------|----------|----------------|
| Facility | Bootstrap FA + Admin | OPERATOR COMMAND + UI AVAILABLE |
| Dietary Department | Default departments from bootstrap / Admin | UI AVAILABLE |
| Central Kitchen, Retail, Dietitian Office, Serverys, Floors, Units | Locations Admin | UI AVAILABLE |
| Meal time groups / coverage | Admin + Assignment Board templates | UI AVAILABLE |
| ~100 Employees | Admin entry or controlled import | UI AVAILABLE / CONTROLLED IMPORT |
| Supervisors, Managers, GM, FA | Admin + bootstrap FA | UI AVAILABLE / OPERATOR COMMAND |
| Shared tablets / unit binding / Quick PIN | Admin + bind-device | UI AVAILABLE |
| Feature flags | Env on host | CONFIGURATION REQUIRED |
| Direct SQL for ordinary setup | Forbidden | Would be BLOCKER |

---

## Device, rollout, success criteria

See:

- `DIETARY_V1_DEVICE_READINESS_CHECKLIST.md`  
- `DIETARY_V1_PILOT_ROLLOUT_PLAN.md`  

Meal service continuity always takes priority. The application remains a support tool.

---

## Environment acceptance contract

`npm run verify:pilot-environment` with `PILOT_BASE_URL=https://…` validates provider-neutral checks (HTTPS, health, SW/manifest, auth surface, anonymous denial for Assignments/offline, cookie notices). Provider-specific backup and flag introspection remain operator-confirmed until a provider is selected.

---

## Findings classification

| Finding | Class |
|---------|-------|
| Hosting provider not selected | PROVIDER DECISION REQUIRED |
| Domain / TLS not provisioned | CONFIGURATION REQUIRED |
| Pilot DB not provisioned | CONFIGURATION REQUIRED |
| Production secrets not generated | CONFIGURATION REQUIRED |
| Backup/PITR not demonstrated with restore drill | DEPLOYMENT BLOCKER until demonstrated after provider |
| Monitoring / alert routing not configured | OPERATIONAL PROCEDURE REQUIRED |
| Maintenance scheduler not attached | OPERATIONAL PROCEDURE REQUIRED |
| Staging environment not standing | CONFIGURATION REQUIRED |
| No outbound email | ACCEPTED PILOT LIMITATION |
| Local uploads not durable multi-instance | ACCEPTED PILOT LIMITATION (avoid handbook or single instance) |
| Signup creates GM not FA | ACCEPTED PILOT LIMITATION — use `db:bootstrap-pilot-admin` |
| No in-app APM | ACCEPTED PILOT LIMITATION — use platform logs |
| Enterprise multi-region HA | FUTURE SCALE REQUIREMENT |
| Health endpoints missing | Closed in Phase 8A (`/api/health/live`, `/api/health/ready`) |
| Production FA bootstrap missing | Closed in Phase 8A (`db:bootstrap-pilot-admin`) |
| Maintenance refused all non-disposable DBs | Closed in Phase 8A (explicit pilot confirm; still refuses `ltc_manager`) |

---

## Open decisions

1. Select managed app + managed Postgres vendor (Option 1) after capability/pricing research.  
2. Choose pilot domain / subdomain.  
3. Approve RPO/RTO and backup retention.  
4. Name pilot owner, technical owner, GM owner, support hours.  
5. Approve Stage 0–3 go criteria and observation thresholds.  
6. Decide whether handbook PDF uploads are in scope (drives storage choice).  

---

## Final environment-readiness recommendation

| Question | Answer |
|----------|--------|
| DEPLOYMENT ARCHITECTURE | **RECOMMENDED CATEGORY IDENTIFIED** + **PROVIDER DECISION REQUIRED** |
| PILOT ENVIRONMENT READINESS | **CONFIGURATION REQUIRED** — repository now supports configure-after-provider; **not** launch-ready until provider, secrets, backups (with restore proof), monitoring, and Stage 0 rehearsal complete |
| PRODUCTION LAUNCH READINESS | **NOT ASSESSED** (controlled-pilot planning phase; must not be classified READY) |

Do not conflate product certification with environment launch readiness.
