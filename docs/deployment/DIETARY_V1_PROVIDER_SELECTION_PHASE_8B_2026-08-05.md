# Dietary V1 Phase 8B — Provider Selection Gate

**Date:** 2026-08-05  
**Product:** LTC Manager (not Vssyl)  
**Phase:** 8B — Provider Selection and Stage 0 Staging Deployment  
**Status:** **OWNER APPROVED — STAGE 0 STAGING AUTHORIZED** (2026-08-05)  
**Certified product source (frozen):** `release/dietary-v1-pilot-certified-2026-08-05` @ `80353dfcc870f4bd53de95cad3fd91d93ba5056b`  
**Deployment-readiness base:** `deployment/dietary-v1-pilot-environment-phase-8a-2026-08-05` @ `20a19c26abc957344b710cfdad0fd1b7fa0b2d5d`  
**This branch:** `deployment/dietary-v1-pilot-environment-phase-8b-2026-08-05`

---

## Scope and hard stops

| Rule | Status |
|------|--------|
| Research Render, DigitalOcean App Platform, Railway | Complete (official pages fetched 2026-08-05) |
| Compare to Phase 8A hard requirements | Complete (this document) |
| Select provider | **Approved: Render** |
| Provision staging | Authorized — Stage 0 only (Hobby, ≤ $60/mo) |
| Provision pilot production | **Out of scope** unless separately approved |
| Modify frozen release branch | Forbidden |
| Merge to `main` | Forbidden |
| Demo seed on staging | Forbidden |
| Use local `ltc_manager` | Forbidden |

After owner selects a provider, Stage 0 staging work proceeds on this branch: unique staging secrets, certified SHA deploy, 65 migrations, `db:bootstrap-pilot-admin`, flags, `verify:pilot-environment`, smoke tests, backup + restore proof, logs/alerts, rate-limit maintenance, device/offline rehearsal, and evidence recording.

---

## Hard requirements (from Phase 8A)

Must all be true for the selected Option 1 managed app + managed Postgres vendor:

1. Long-lived **Node 20** process running `next start` (not serverless-only).
2. **PostgreSQL 16** managed database (empty staging DB; never `ltc_manager`).
3. **HTTPS** + custom domain path for Secure cookies and service worker.
4. **Secrets** as environment variables (unique staging `AUTH_SECRET` ≥ 32 chars).
5. **Pre-deploy / one-off migrate:** `prisma migrate deploy` (65 migrations) + bootstrap FA script.
6. **Health probes:** `/api/health/live`, `/api/health/ready`.
7. **Scheduled job** for `maintenance:auth-rate-limits`.
8. **Automated DB backups** with restore into an **isolated** database (drill required before claiming readiness).
9. **Logs + failure notifications** (availability / deploy / backup).
10. Staging vs pilot production **environment separation**.
11. Single-Facility pilot size: ~100 Employees, shared tablets; staging uses synthetic data only.

Backup starting proposals (owner-approved later): ≥ daily or continuous/PITR; retention ≥ 14 days preferred; RPO ≤ 24h (prefer ≤ 1h); RTO ≤ 4h. Native platform windows below 14 days require a supplemental logical-dump retention plan.

---

## Research sources (official, 2026-08-05)

| Vendor | Primary sources |
|--------|-----------------|
| Render | [Pricing](https://render.com/pricing), [Postgres backups / PITR](https://render.com/docs/postgresql-backups), [Web services / Next.js](https://render.com/docs/web-services) |
| DigitalOcean | [App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/), [Managed Postgres pricing](https://www.digitalocean.com/pricing/managed-databases), [Restore from backups](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/), [Node.js buildpack](https://docs.digitalocean.com/products/app-platform/reference/buildpacks/nodejs/), [Jobs](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/) |
| Railway | [Pricing](https://railway.com/pricing), [Postgres backups / restores / PITR](https://docs.railway.com/guides/postgres-backups-restores), [Cron jobs](https://docs.railway.com/cron-jobs), [Next.js guide](https://docs.railway.com/guides/fullstack-nextjs) |

Prices are list prices from those pages on the research date. Exact invoices will differ with region, storage growth, egress, and idle vs always-on usage. Do not treat estimates as quotes.

---

## Capability matrix vs Phase 8A

| Criterion | Render | DigitalOcean App Platform + Managed Postgres | Railway |
|-----------|--------|-----------------------------------------------|---------|
| Long-lived Node / `next start` | Yes — Web Service; documented Next.js SSR path | Yes — Web Service component; `npm start` | Yes — service + documented Next.js + Postgres guide |
| Pin Node 20 | Yes via `engines` / `.node-version` | Yes — pin `engines.node` (default is Node 22; repo already has `>=20 <21`) | Yes — Nixpacks / Dockerfile / engines |
| PostgreSQL 16 | Yes (managed Render Postgres; select major version at create) | Yes — managed cluster versions include 16 | Yes — managed Postgres template (confirm 16 at create) |
| HTTPS / TLS | Automatic TLS; custom domains (tier quotas) | Automatic TLS; custom domains | Automatic TLS; custom domains |
| Secrets / env | Env vars + secret files; env groups | App-level encrypted env vars; DB connection injected | Variables + reference vars between services |
| Migrate before traffic | Pre-deploy command supported | Job / deploy-time run command / one-off job | Pre-deploy command supported |
| Health checks | Platform health checks → map to `/api/health/*` | Health checks on services | Healthcheck path on service |
| Cron / maintenance | Native Cron Jobs (from ~$1/mo compute when running) | App Platform Jobs (scheduled; billed while running) | Cron schedule on a short-lived service |
| Automated backups | Paid Postgres: PITR + logical exports | Managed Postgres: daily backups + PITR restore to **new** cluster | Volume backups + optional PITR (~4 weeks) + `pg_dump` |
| Restore into isolated target | PITR creates **new** instance (validate then cut over); logical restore to new DB | Restore creates **new** cluster (matches Phase 8A drill model) | PITR creates sibling service; `pg_restore` into scratch DB documented |
| Native backup retention vs ≥14d proposal | Hobby PITR **3d**; Pro+ PITR **7d**; logical exports retained **7d** | Cluster backups retained **7 days** | Volume: daily 6d / weekly 1mo / monthly 3mo; PITR ~**4 weeks** |
| Logs | 7d Hobby / 14d Pro / 30d Scale; notifications | App Platform insights + DO monitoring integrations | 7d Hobby / 30d Pro log history |
| Alerts | Deploy / failure notifications | Alerts / monitoring (configure routing) | Notifications; usage limits |
| Free / unsuitable tiers | Free web spins down; free Postgres expires 30d — **reject for Stage 0** | Dev DB ($7) — no production-grade backups — **reject for Stage 0 DB** | Free/Hobby may be undersized for always-on; prefer Pro for staging reliability |
| Staging / prod separation | Projects + Environments (Hobby: 2 envs/project) | Separate Apps + separate Managed DB clusters | Projects / Environments |
| Predictable monthly cost | High (workspace fee + fixed instance sizes) | High (fixed container + DB sizes) | Medium (usage-based; spend can vary) |
| Pilot-fit notes | Strong ops match; PITR window short vs 14d proposal | Strong ops match; cheapest clear floor; 7d backup window | Strong PITR window; usage billing less predictable |

**All three vendors meet the Option 1 category** if paid managed Postgres is used (not free/dev DB) and Node 20 is pinned. Supplemental **logical dumps with ≥14-day offsite retention** are required on Render and DigitalOcean to meet the Phase 8A retention *proposal*; Railway PITR ≈4 weeks can satisfy the window if enabled, but offsite logical dumps remain recommended.

---

## Staging cost sketch (synthetic Stage 0 only)

Assumes **one** always-on web instance (~1–2 GB RAM), **one** paid Postgres (~1 GB), HTTPS, secrets, cron for rate-limit maintenance, and **no** pilot production twin yet. Figures are approximate USD/month from official list prices on 2026-08-05.

### Render (recommended staging floor)

| Line item | Proposed size | List price |
|-----------|---------------|------------|
| Workspace | Hobby ($0) possible for solo Stage 0; **Pro ($25)** if team seats / 7d PITR / 14d logs needed | $0 or $25 |
| Web service | Standard (2 GB / 1 CPU) preferred for Next.js; Starter (512 MB) is tight | $25 (Standard) or $7 (Starter) |
| Postgres | Basic-1gb | $19 + $0.30/GB storage |
| Cron | Starter, daily short run | ~$1–few dollars |
| **Staging subtotal** | Hobby + Standard + Basic-1gb | **≈ $45–55** |
| **Staging subtotal** | Pro + Standard + Basic-1gb | **≈ $70–80** |

Reject: Free web (spin-down) and Free Postgres (no PITR / 30-day expiry).

### DigitalOcean App Platform + Managed PostgreSQL

| Line item | Proposed size | List price |
|-----------|---------------|------------|
| Web container | `apps-s-1vcpu-1gb` ($12) or `apps-s-1vcpu-2gb` ($25) | $12–25 |
| Managed Postgres 16 | Basic 1 GiB single node | **$15.15** |
| Scheduled Job | billed only while running | low (daily maintenance) |
| **Staging subtotal** | 1 GB web + 1 GiB Postgres | **≈ $28–45** |

Reject: Development Database ($7) for Stage 0 — limited permissions, destroyed with app, not backup-equivalent to Managed Databases.

### Railway

| Line item | Proposed size | List price |
|-----------|---------------|------------|
| Plan | **Pro** $20/workspace (includes $20 usage credit) recommended for Stage 0 reliability | $20 |
| Web + Postgres usage | Always-on RAM/CPU + volume; varies by second | Often **$15–40+** beyond/within credit |
| PITR storage | Bucket storage $0.015/GB-month; no separate PITR fee | small at Stage 0 |
| Cron dump / maintenance | Short-lived services | low |
| **Staging subtotal** | Pro + modest always-on stack | **≈ $20–60** (usage-dependent) |

Usage-based pricing means the first month should be treated as a measurement month with a spend cap.

---

## Comparative recommendation (not a selection)

| Rank | Vendor | Why |
|------|--------|-----|
| **1 — Preferred candidate** | **Render** | Clearest long-running Web Service + managed Postgres + native Cron + pre-deploy migrate + health checks + restore-to-new-instance PITR. Ops model matches Phase 8A runbooks with least improvisation. Cost higher than DO; native PITR window (3–7d) needs supplemental ≥14d logical retention. |
| **2 — Strong cost / clarity alternative** | **DigitalOcean App Platform + Managed Postgres** | Lowest predictable floor (~$28–45 staging). Postgres 16, daily backups, restore-to-new-cluster, Jobs for maintenance, Node 20 pinable. Slightly more “two product” surface (App Platform + Databases) than Render’s single console. Native backup retention 7d → same supplemental dump need. |
| **3 — Strong recovery window; less cost predictability** | **Railway** | Excellent documented backup/PITR/restore-drill story (~4 week PITR) and Next.js + Postgres guides. Usage billing and volume-centric Postgres model need tighter spend governance for a controlled pilot. |

**Recommendation for owner decision:** Approve **Render** for Stage 0 staging unless cost floor is the deciding constraint, in which case approve **DigitalOcean**. Do not use free/dev database tiers.

---

## Proposed Stage 0 settings (after approval — not applied yet)

Common to any approved vendor:

| Setting | Value |
|---------|-------|
| Deploy SHA | `80353dfcc870f4bd53de95cad3fd91d93ba5056b` (certified release) |
| Runtime | Node 20; `npm ci` → `npm run build` → `npm start` |
| Database | New empty PostgreSQL 16; name **not** `ltc_manager` |
| Secrets | Generate unique staging `AUTH_SECRET` (≥32); unique DB credentials |
| Flags | `OPERATIONAL_ASSIGNMENTS_ENABLED=true`; `OPERATION_ENGINE_ENABLED=false` |
| Bootstrap | `npm run db:bootstrap-pilot-admin` only — **never** demo seed |
| Acceptance | `PILOT_BASE_URL=https://…` → `npm run verify:pilot-environment` |
| Backups | Enable platform automated backups/PITR **and** schedule logical dump retention ≥14 days (or accept Railway PITR window + offsite dump) |
| Restore proof | Restore into isolated DB/cluster; never overwrite active staging |
| Maintenance | Daily `maintenance:auth-rate-limits` with `MAINTENANCE_ALLOW_PILOT=1` + exact DB name confirm |
| Scope | **Staging only** — no pilot production in Phase 8B |

### Render-specific proposal (if approved)

- Workspace: Pro if team collaboration / 7d PITR / 14d logs needed; Hobby acceptable for solo Stage 0 with accepted 3d PITR + mandatory logical dumps.
- Web: Standard instance; health check `/api/health/ready` (or live for liveness).
- Postgres: Basic-1gb paid; enable PITR; create logical export schedule.
- Cron: daily maintenance command.
- Environment: dedicated `staging` environment; branch deploy pinned to certified SHA (manual/image or protected branch), not auto-deploy from mutable working branches.

### DigitalOcean-specific proposal (if approved)

- App: Web Service 1–2 GiB shared; pin Node 20 via `package.json` engines (already present).
- DB: Managed PostgreSQL 16, 1 GiB single node (not Dev DB).
- Job: scheduled maintenance.
- Restore drill: Actions → Restore from backup → new cluster.

### Railway-specific proposal (if approved)

- Workspace: Pro; set monthly spend limit.
- Enable volume backups + PITR before traffic.
- Pre-deploy migrate; cron for maintenance and optional offsite `pg_dump`.

---

## Owner decision (recorded 2026-08-05)

| Item | Owner decision |
|------|----------------|
| Provider | **Render** |
| Staging spend ceiling | **$60 USD/month hard ceiling** — stop and report before creating or resizing anything that would exceed it |
| Workspace tier | **Hobby** for Stage 0 — do not purchase Pro unless a documented need for team access, longer native PITR, or longer platform-log retention emerges |
| Approved resources | One Standard web service; one paid Basic-1gb PostgreSQL; one short-running daily maintenance cron; supplemental logical backup object storage |
| Forbidden resources | Free web; free PostgreSQL; custom domain during initial Stage 0; Pro workspace upgrade without new approval |
| Backup retention | **Yes** — native PITR + daily logical dump to separately retained object storage ≥ **14 days**; restore drill into isolated DB required before claiming backup readiness |
| Staging hostname | Render **platform-default HTTPS URL** first — no custom domain in initial Stage 0 |
| Stage 0 authorization | **Yes — staging only** |
| Explicitly not authorized | Pilot production; real Terrace View Employee data; real operational reliance; `main` merge; changes to frozen certified release; product feature expansion; spend above $60/mo |

### Projected monthly cost (Hobby, list prices 2026-08-05)

| Line item | Spec | List $/mo |
|-----------|------|-----------|
| Workspace | Hobby | $0 |
| Web service | Standard (2 GB / 1 CPU) | $25 |
| Postgres | Basic-1gb compute | $19 |
| Postgres storage | **1 GB** initial (minimum selectable) | $0.30 |
| Cron | Starter, ~daily short run | ≈ $1–3 |
| Logical dump object storage | External bucket, Stage 0 dump size | ≈ $0–2 (expect near-zero) |
| Bandwidth / build minutes | Within Hobby included quotas if light Stage 0 use | $0 expected |
| **Projected total** | | **≈ $45–50** |
| **Ceiling headroom** | | **≈ $10–15** |

Do not increase Postgres storage above 1 GB, upgrade web instance, add custom domains, or enable Pro without a new ceiling check. Storage autoscaling must remain **off**.

### Deployable revision note (Stage 0)

Bare certified tip `80353df` does **not** include Phase 8A operational closures required by Stage 0 evidence:

- `/api/health/live`, `/api/health/ready`
- `db:bootstrap-pilot-admin`
- `verify:pilot-environment`

Those land on `20a19c26abc957344b710cfdad0fd1b7fa0b2d5d` (Phase 8A tip). Stage 0 will deploy the **deployment-readiness lineage** that packages the certified product plus Phase 8A closures (and Phase 8B docs only). The release branch `release/dietary-v1-pilot-certified-2026-08-05` remains **frozen** at `80353df`. Exact deployed SHA will be recorded in the Stage 0 evidence document after first successful deploy.

---

## Phase 8B remaining work (post-approval)

| # | Activity | Status |
|---|----------|--------|
| 1 | Provider research | Done |
| 2 | Requirements comparison | Done |
| 3 | Owner provider approval | **Done — Render / Hobby / ≤$60 / Stage 0 only** |
| 4 | Provision staging app + Postgres 16 | Authorized — in progress |
| 5 | Unique staging secrets | Authorized — in progress |
| 6 | Deploy deployment-readiness SHA (certified + 8A closures) | Authorized — in progress |
| 7 | Apply 65 migrations | Pending |
| 8 | `db:bootstrap-pilot-admin` | Pending |
| 9 | Set Assignment flag true / Operation Engine false | Pending |
| 10 | `verify:pilot-environment` | Pending |
| 11 | Authenticated Assignment / Milestone / offline / revocation / GM smoke | Pending |
| 12 | Automated backups | Pending |
| 13 | Restore into separate DB + evidence | Pending |
| 14 | Logs, alerts, rate-limit schedule | Pending |
| 15 | Stage 0 device + offline rehearsal | Pending |
| 16 | Record costs, settings, evidence, blockers | Partial (decision + cost projection recorded) |

---

## Readiness after this gate document

| Question | Answer |
|----------|--------|
| PROVIDER SELECTION | **APPROVED — Render (Hobby, Stage 0, ≤ $60/mo)** |
| PILOT ENVIRONMENT READINESS | Still **CONFIGURATION REQUIRED** until Stage 0 evidence complete |
| STAGE 0 STAGING | **AUTHORIZED — PROVISIONING** |
| PILOT PRODUCTION | **NOT AUTHORIZED** |
| PRODUCTION LAUNCH READINESS | **NOT ASSESSED** |
