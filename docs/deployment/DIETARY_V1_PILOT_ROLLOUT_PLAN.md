# Dietary V1 Controlled Pilot Rollout Plan

**Product:** LTC Manager  
**Facility (synthetic reference):** Terrace View Dietary  
**Principle:** Meal service continuity takes priority. The application is a support tool with paper fallback.

Do not place real Employee names, emails, PINs, or passwords in this document.

---

## Ownership

| Role | Responsibility |
|------|----------------|
| Pilot owner | Go/no-go, pause, success judgment |
| Technical owner | Environment, deploy, restore, incidents |
| GM owner | Daily staffing/timing review usefulness |
| Supervisor champions | Assignment plan, conflicts, floor coaching |
| Frontline trainers | Tablet / PIN / Milestone habits |

Support hours and incident contact must be named before Stage 1 (CONFIGURATION / OPERATIONAL PROCEDURE REQUIRED).

---

## Stages

### STAGE 0 — Staging rehearsal

- Synthetic data only  
- Admin setup end-to-end  
- Device enrollment + Wi-Fi walkthrough rehearsal  
- Assignment plan create/confirm  
- Milestones online + offline drill  
- Restore verification drill (`DIETARY_V1_BACKUP_RESTORE_RUNBOOK.md`)  
- `verify:pilot-environment` against staging HTTPS URL  
- Go/no-go to Stage 1  

**Exit:** Pilot owner signs Stage 0 complete; no real operational reliance yet.

### STAGE 1 — Single Supervisor and limited Units

- Small Unit / servery subset  
- Paper process remains authoritative fallback  
- Daily debrief (Supervisor + GM + technical as needed)  
- No broad Facility rollout  

**Exit:** Stable Assignment confirmation + Milestone capture for the subset without unsafe workarounds.

### STAGE 2 — One floor or operational zone

- Multiple serverys  
- Assignment + coverage visibility  
- Shared tablets in production use  
- Breakfast / lunch / dinner  
- Incident logging to pilot owner  

**Exit:** Zone operates for an agreed number of service days with acceptable conflict/error rates.

### STAGE 3 — Full Dietary controlled pilot

- All intended serverys  
- Approximately 100 Employees  
- Formal support coverage  
- Formal go/no-go review for continued pilot operation  

Do **not** assume full-Facility launch on day one.

---

## Training

| Audience | Content | Evidence |
|----------|---------|----------|
| Supervisors | `DIETARY_V1_SUPERVISOR_QUICK_START.md` | Signed attendance / checklist |
| Employees | `DIETARY_V1_EMPLOYEE_TABLET_GUIDE.md` | Floor coach sign-off |
| GM | `DIETARY_V1_GM_DAILY_REVIEW.md` | First-week daily review notes |
| All | `DIETARY_V1_FALLBACK_AND_RECOVERY.md` | Drill participation |

---

## Support model

- Named support hours for Stage 1–3  
- Incident contact tree (pilot owner → technical owner)  
- Daily review cadence (Stage 1: every service day; later: per owner)  
- Pilot duration: owner-set (propose 2–4 weeks at Stage 3 intensity before expansion decisions)  

---

## Success criteria

Thresholds below are **PILOT STARTING THRESHOLD — REQUIRES OWNER APPROVAL**. They are observation starters, not arbitrary SLAs claimed as product guarantees.

| Signal | Starting observation threshold | Notes |
|--------|--------------------------------|-------|
| Assignment plan confirmed before frontline execution | ≥ 95% of service days in scope | Paper if missed |
| Employee Assignment visibility | Spot-check ≥ 90% correct on confirmed plans | |
| Staffing coverage visibility | GM can classify Covered / At Risk / Uncovered daily | |
| Servery Ready capture rate | ≥ 90% of served meals in scope | |
| Meal Service Started capture rate | ≥ 90% | |
| Offline command sync success | ≥ 95% of queued commands eventually accepted or explicitly conflicted | |
| Conflict-review volume | Track; investigate spikes day-over-day | |
| Unauthorized-access events | 0 unexplained cross-Facility / cross-role successes | Immediate pause if broken |
| Tablet availability | ≥ N-1 devices available each meal (owner sets N) | |
| Manual fallback usage | Expected early; trend down without hiding failures | |
| Supervisor adoption | Champions complete plans without developer help | |
| GM usefulness | GM owner weekly yes/no | |
| Data correction frequency | Track Milestone corrections; procedure for Facility-local devices | |
| Application error rate | No sustained elevated 5xx; health ready | |

---

## Pause criteria

Pause or freeze new Units when any apply:

- Suspected or confirmed data loss  
- Cross-Facility exposure  
- Repeated authentication failure blocking meals  
- Assignment misinformation driving wrong staffing actions  
- Offline queue loss without reconcile path  
- Inability to restore (backup drill failed)  
- Sustained application outage  
- Unsafe operational reliance (staff cannot complete meals because of the product)  
- Support coverage missing during service  

### Rollback criteria

- Pause does not restore trust within the agreed window  
- NON-ROLLBACKABLE schema incident without forward fix  
- Pilot owner declares paper-only operation  

Application rollback vs DB restore follows `DIETARY_V1_DEPLOYMENT_RUNBOOK.md`.

---

## Prohibited pilot data

Avoid resident clinical / PHI content in free-text fields. This pilot is workforce and meal-service operations oriented. Do not make HIPAA compliance claims from this rollout plan alone.

---

## Privacy / data categories (summary)

| Category | Class | Handling |
|----------|-------|----------|
| User / Employee identity, role, Facility/Department links | Sensitive workforce / administrative | Minimum necessary; Admin-controlled |
| Schedules, call-offs, Assignments, Unit responsibility | Operationally necessary | Retention per Facility policy |
| Milestones, corrections, audit history | Audit / operational | Append-preserving; no silent overwrite |
| Device identity, offline device data | Device-local + server receipts | Unbind on loss; no offline remote wipe claim |
| Authentication secrets | Authentication | Unique env secrets; rotate with plan |

Pilot shutdown: revoke devices/sessions, final backup, deactivate accounts per `DIETARY_V1_DEPLOYMENT_RUNBOOK.md` shutdown section.
