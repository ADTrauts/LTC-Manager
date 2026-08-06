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
| Render API authentication missing in this environment | CONFIGURATION REQUIRED | `render` CLI installed; `RENDER_API_KEY` unset; `render login` not completed |
| Supplemental object storage credentials for ≥14-day logical dumps | CONFIGURATION REQUIRED | Need S3-compatible bucket + keys (or owner-approved alternative) within ceiling |
| Staging FA password delivery channel | OPERATIONAL PROCEDURE REQUIRED | Generate out-of-band; never commit |

---

## Migration / bootstrap / flags

| Check | Result |
|-------|--------|
| `prisma migrate deploy` finished count | _pending_ (expect 65) |
| Demo seed run? | **Must be No** |
| `db:bootstrap-pilot-admin` | _pending_ (synthetic FA only) |
| `OPERATIONAL_ASSIGNMENTS_ENABLED` | `true` (blueprint) |
| `OPERATION_ENGINE_ENABLED` | `false` (blueprint) |
| Stripe / AI / projection | unset / off |

---

## Acceptance and smoke (pending)

| Check | Result |
|-------|--------|
| `verify:pilot-environment` | _pending_ |
| Assignment smoke | _pending_ |
| Milestone smoke | _pending_ |
| Offline queue / sync | _pending_ |
| Session / device revocation | _pending_ |
| GM visibility | _pending_ |

---

## Backup / restore (pending — not ready until restore succeeds)

| Check | Result |
|-------|--------|
| Native PITR enabled (paid Hobby = 3-day window) | _pending confirm_ |
| Daily logical dump to separate object storage ≥14 days | _blocked on bucket credentials_ |
| Restore into isolated database | _pending_ |
| Backup readiness claim | **NOT CLAIMED** |

---

## Logs / alerts / maintenance (pending)

| Check | Result |
|-------|--------|
| Platform logs reachable | _pending_ |
| Failure / deploy notifications | _pending_ |
| Maintenance cron evidence | _pending_ |

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
