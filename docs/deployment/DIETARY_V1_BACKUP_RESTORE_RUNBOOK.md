# Dietary V1 Backup and Restore Runbook

**Product:** LTC Manager  
**Scope:** Pilot staging and pilot production PostgreSQL  
**Rule:** Never overwrite the active pilot database during restore verification. Never target `ltc_manager` as a restore destination for drills.

---

## Objectives

| Metric | Starting proposal | Classification |
|--------|-------------------|----------------|
| Backup frequency | Platform continuous / PITR when available; otherwise ≥ daily automated | PILOT STARTING THRESHOLD — REQUIRES OWNER APPROVAL |
| Retention | ≥ 14 days | Same |
| Point-in-time | Prefer provider PITR when available | Same |
| Manual pre-deploy backup | Required before every production deploy | OPERATIONAL PROCEDURE REQUIRED |
| RPO | ≤ 24h (prefer ≤ 1h with PITR) | Owner approval |
| RTO | ≤ 4h for controlled pilot | Owner approval |

**Do not claim backup readiness until a restore has been demonstrated.**

---

## Ownership

| Item | Owner |
|------|-------|
| Backup configuration | Technical owner + provider |
| Restore execution | Technical owner |
| Restore verification sign-off | Pilot owner |
| Evidence retention | Technical owner |

---

## Evidence that a backup exists

Capture in the change record:

- Provider backup ID / snapshot name  
- Timestamp (UTC)  
- Retention expiry  
- Database name (not credentials)  
- Linked deploy SHA  

---

## Repository-owned restore verification procedure

Perform on a schedule (proposed weekly during pilot) and after any backup configuration change.

### 1. Obtain backup

- Export / snapshot from the pilot provider **or** use a synthetic staging backup equivalent.  
- Do not download secrets into the git workspace.

### 2. Restore into a new isolated database

- Create a new empty database name, e.g. `ltc_verify_restore_YYYYMMDD`.  
- Prefix should make the target disposable/isolated.  
- **Never** restore over the live pilot database for a drill.

### 3. Schema validation

```bash
# Point DATABASE_URL / DIRECT_URL at the restored isolated DB only.
npx prisma migrate status
# Expect: database schema is up to date (65 migrations for certified tip)
```

### 4. Confirm migration history

```sql
SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
-- expect 65 for the certified Dietary V1 tip
```

Also run `npm run verify:migrations` against the repo checkout of the deployed SHA (checksum governance).

### 5. Confirm critical record classes (read-only)

Using a read-only SQL session or Prisma script against the **isolated** DB, confirm presence/coherence of:

- Facility  
- Department (Dietary)  
- Unit / location rows  
- Employee rows (counts only in tickets — no PII dumps into chat/docs)  
- Assignment plans / windows (if pilot has started)  
- Milestone / meal service events  
- Offline sync receipts / conflicts (if any)  
- Append-preserving history / audit events  

Do not export real Employee names, emails, or PINs into repository documentation.

### 6. Read-only smoke checks

Against a temporary app instance pointed at the restored DB (optional but preferred):

- `/api/health/ready` → ready  
- Password login with a **staging** or **known drill** account only  
- Open Assignment Board for a known operational date (read)  

Do not run destructive maintenance against the drill DB without intent.

### 7. Never overwrite active pilot during verification

Live cutover restore (true disaster recovery) is a separate, approved procedure with pilot owner authorization and paper fallback active.

### 8. Remove restored test database

Drop the isolated restore database when the drill is complete and evidence is recorded.

---

## Disaster recovery (active pilot)

1. Declare incident; paper process authoritative for meal service.  
2. Identify last known good backup / PITR target.  
3. Restore to a **new** database when possible; validate; then swap application `DATABASE_URL` with change control.  
4. If in-place restore is unavoidable, obtain dual approval (pilot + technical) and accept data loss window.  
5. Redeploy matching application SHA.  
6. Re-verify AUTH_SECRET continuity (same secret as backup era, or planned PIN/session reset).  
7. Run authenticated smokes; resume Assignments only when trusted.  
8. Post-incident review.

---

## AUTH_SECRET coupling

Restored databases remain usable only with the `AUTH_SECRET` that minted PIN digests and sessions. If the secret was rotated after the backup:

- Existing sessions fail  
- Quick PIN digests will not match until re-issued  

Document secret version alongside backup evidence.

---

## Non-database state

| State | In Postgres backup? | Notes |
|-------|---------------------|-------|
| Offline IndexedDB queues | No | Device-local; paper reconcile |
| Service worker caches | No | Re-download on HTTPS |
| Local `uploads/` handbook PDFs | No | Out of Dietary core scope; restore separately if used |

---

## Acceptance

Backup readiness for the pilot requires:

- [ ] Automated backups enabled on the selected provider  
- [ ] Retention configured  
- [ ] At least one successful restore verification with evidence  
- [ ] RPO/RTO approved by pilot owner  
- [ ] Pre-deploy backup step present in the deployment runbook checklist  
