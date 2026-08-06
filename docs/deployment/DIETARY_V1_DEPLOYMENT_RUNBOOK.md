# Dietary V1 Deployment Runbook

**Product:** LTC Manager  
**Applies to:** Controlled Dietary V1 pilot (staging and pilot production)  
**Immutable product source:** `release/dietary-v1-pilot-certified-2026-08-05`  
**Companion docs:** environment variables, backup/restore, device checklist, rollout plan, Phase 8A decision record

Do not include real secrets, credentials, or Employee data in tickets copied from this runbook.

---

## Roles

| Role | Responsibility |
|------|----------------|
| Pilot owner | Go/no-go, pause, operational authority |
| Technical owner | Deploy, migrate, bootstrap, rollback, monitoring |
| Facility Administrator | Admin configuration after bootstrap |
| GM owner | Daily operational review during pilot |

---

## Pre-deployment

Checklist (all required before pilot production change):

- [ ] Hosted Verify green on the approved SHA  
- [ ] Deploying certified release tip or an approved successor documented in the change record  
- [ ] Migration review complete (`npm run verify:migrations` locally; pending SQL reviewed)  
- [ ] Backup confirmed on the target environment (or empty-DB first deploy noted)  
- [ ] Change record: SHA, operator, window, risk class  
- [ ] Rollback point identified (prior app release SHA + DB backup ID)  
- [ ] Operator approval recorded  
- [ ] `ltc_manager` is **not** the target  

---

## Database setup (first deploy)

1. Provision empty PostgreSQL 16 database. Name must not be `ltc_manager`.  
2. Create application role with DML privileges only.  
3. Create migration role/process with DDL privileges (used only during deploy).  
4. Store `DATABASE_URL` (runtime; pooler OK) and `DIRECT_URL` (migrate; direct) in the environment secret store.  
5. Validate connectivity without printing passwords.  
6. Set `AUTH_SECRET` (≥ 32 characters, unique to this environment).  

---

## Migration

```bash
# From an approved release checkout, with DIRECT_URL pointing at the target.
npx prisma generate
npx prisma migrate deploy
```

Confirm:

- 65 finished migrations (or the approved count for the SHA)  
- Migration integrity / checksum exception governance unchanged  
- Readiness probe `/api/health/ready` reports `migrations: true` after app start  

Never edit applied migration files. Never run `prisma migrate reset` against pilot data.

---

## Bootstrap (first Facility Administrator)

Do **not** run `prisma db seed` against pilot production.

```bash
BOOTSTRAP_DATABASE_URL='postgresql://…/YOUR_PILOT_DB' \
AUTH_SECRET='…same as app…' \
FACILITY_DISPLAY_NAME='Terrace View' \
FACILITY_TIMEZONE='America/New_York' \
FA_EMAIL='…operator-provided…' \
FA_PASSWORD='…operator-provided ≥12 chars…' \
FA_DISPLAY_NAME='Facility Administrator' \
BOOTSTRAP_MARK_ONBOARDING_COMPLETE=1 \
npm run db:bootstrap-pilot-admin
```

Script behavior:

- Refuses `ltc_manager`  
- Refuses unsafe default passwords  
- Creates Organization + Facility + FACILITY_ADMINISTRATOR User (password only)  
- Creates default departments + log template presets  
- Does not print the password  
- Refuses re-run when an FA already exists unless `BOOTSTRAP_FORCE=1`  

Deliver the password out-of-band. Force password change on first login if process requires it.

---

## Application deployment

1. Build immutable release from the approved SHA (`npm ci` → `npm run build`).  
2. Configure environment variables (see `DIETARY_V1_ENVIRONMENT_VARIABLES.md`).  
3. Apply migrations (above) before shifting traffic when schema changed.  
4. Start or replace application instances (`npm start` / platform equivalent, Node 20).  
5. Point load balancer health checks:
   - Liveness: `GET /api/health/live`  
   - Readiness: `GET /api/health/ready`  

### Feature activation

| Variable | Pilot value |
|----------|-------------|
| `OPERATIONAL_ASSIGNMENTS_ENABLED` | `true` |
| `OPERATION_ENGINE_ENABLED` | `false` |
| Stripe keys | omit unless billing explicitly in scope |
| AI / projection experimental flags | leave defaults / off unless approved |

---

## Configuration (post-bootstrap)

Via Admin UI (no ordinary SQL):

1. Confirm Facility timezone America/New_York (or approved).  
2. Dietary Department active.  
3. Locations: Central Kitchen, Retail, Dietitian Office, Serverys, Floors, Units/neighborhoods.  
4. Meal times / service-time groups.  
5. Coverage requirements / Assignment templates.  
6. Employees (~100), Supervisors, Managers, GM.  
7. Quick PIN only for eligible frontline roles.  
8. Password accounts for Supervisor+.  
9. Shared devices: enroll, bind Unit, verify PIN pad.  

---

## Smoke tests

### Unauthenticated (automation)

```bash
PILOT_BASE_URL='https://YOUR_DOMAIN' npm run verify:pilot-environment
```

### Authenticated (operator)

- [ ] Password login (FA, Supervisor, GM)  
- [ ] Quick PIN on bound tablet (STAFF)  
- [ ] Create / confirm Assignment plan  
- [ ] Employee Assignment visibility  
- [ ] Servery Ready + Meal Service Started  
- [ ] Offline Milestone queue + sync  
- [ ] Conflict review path  
- [ ] GM coverage / timing visibility  
- [ ] Session revocation ends access immediately  
- [ ] Service worker registers over HTTPS  

---

## Backup

Before every production deploy:

- [ ] Trigger or confirm platform backup / snapshot  
- [ ] Record backup ID, time, retention  
- [ ] Confirm restore procedure owner is available  

See `DIETARY_V1_BACKUP_RESTORE_RUNBOOK.md`.

---

## Rollback

| Class | Action |
|-------|--------|
| APPLICATION-ONLY | Redeploy previous immutable app release; schema unchanged |
| FORWARD-COMPATIBLE MIGRATION | App rollback only if documented compatible with current schema |
| NON-ROLLBACKABLE SCHEMA CHANGE | Do **not** reverse Prisma migrations. Ship forward fix **or** restore DB from backup into a controlled process, then redeploy matching app SHA |

Record the class in the change ticket before deploy.

---

## Incident response (abbreviated)

1. Protect meal service — paper process is authoritative if the app blocks service.  
2. Page technical owner + pilot owner.  
3. Check `/api/health/live` and `/api/health/ready`, platform logs, DB status.  
4. If auth storm: confirm rate-limit locks; do not disable limits casually.  
5. If data integrity suspect: stop writes, preserve backups, do not “fix” via ad-hoc SQL without approval.  
6. Follow `docs/pilot/DIETARY_V1_FALLBACK_AND_RECOVERY.md`.  

---

## Maintenance

Daily (or platform cron):

```bash
MAINTENANCE_ALLOW_PILOT=1 \
MAINTENANCE_CONFIRM_DATABASE_NAME='YOUR_PILOT_DB_NAME' \
MAINTENANCE_DATABASE_URL='postgresql://…/YOUR_PILOT_DB_NAME' \
npm run maintenance:auth-rate-limits -- --dry-run

# then without --dry-run when dry-run counts look sane
```

Still refuses `ltc_manager`.

---

## Shutdown / pilot end

1. Announce freeze window.  
2. Export or archive operational records per retention policy (no PHI dumping).  
3. Revoke shared-device bindings and active sessions.  
4. Disable Assignments flag if retaining host without operations.  
5. Final backup; retain per policy.  
6. Decommission secrets rotation / destroy staging copies appropriately.  

---

## Security checklist (production)

- [ ] HTTPS only  
- [ ] `NODE_ENV=production`  
- [ ] Unique `AUTH_SECRET`  
- [ ] DB TLS + least privilege  
- [ ] Assignments on, Engine off  
- [ ] No demo seed  
- [ ] No shared staging/prod secrets  
- [ ] Rate-limit cleanup scheduled  
- [ ] Session revocation tested  
- [ ] Device revoke tested  
- [ ] X-Forwarded-For not used for throttling  
- [ ] Health endpoints wired without exposing internals  
- [ ] Error pages/logs redacted  
- [ ] Backup + restore drill evidence attached  
