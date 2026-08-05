# Dietary V1 First-Pilot Readiness Certification

**Date:** 2026-08-05  
**Product:** LTC Manager (not Vssyl)  
**Question:** Could Terrace View Dietary run a controlled operating-day pilot using the current product without depending on hidden manual workarounds or unsafe behavior?

---

## Candidate State

| Item | Value |
|------|--------|
| Candidate branch | `pilot/dietary-v1-candidate-2026-08-05` |
| Candidate SHA | `4a5da5531f6bd2ae7766a8f8027de0ca9e6bb9dc` |
| Certification branch | `pilot/dietary-v1-readiness-certification-2026-08-05` |
| Phase 7A tip (unchanged) | `4a5da5531f6bd2ae7766a8f8027de0ca9e6bb9dc` |
| Phase 6A certified tip | `71acf0b6e97107410f8e63cccedc7e436c5fd724` |
| Local `main` | `704adc72abb46705a4451608a2fadf84215f42be` (unchanged by this work) |
| `origin/main` | `6380b661a64e8f020d16813342945797a50bc0e0` (unchanged) |
| Hosted Verify (Phase 7A) | Run `31054488304` — passed |
| Principle | Fewer features, complete workflows |

The candidate branch is frozen. All readiness work lands only on the certification branch.

---

## Certified workflow

Facility/Department configuration → Schedule & staffing availability → Call-offs → Supervisor daily Assignment plan → Coverage review → Plan confirmation → Employee shared-tablet Assignment view → Servery Ready → Meal Service Started → Offline queue & sync → Supervisor exception/conflict management → GM staffing & service-timing visibility → Operational history & audit → End-of-day review (with documented operating notes).

**Out of boundary (must not be claimed):** automatic scheduling, Assignment suggestions, Operations Engine, Job Flow, generalized Supervisor Coverage, offline Assignment editing, offline authentication / offline Quick PIN verification, general offline Logs/Assets/Issues, EVS, production deployment.

---

## Acceptance matrix (32 areas)

Status values: READY · READY WITH OPERATING NOTE · PILOT BLOCKER · CERTIFICATION FINDING · FUTURE CAPABILITY · UNKNOWN

| # | Area | Status | Evidence / note |
|---|------|--------|-----------------|
| 1 | Facility and Department setup | READY WITH OPERATING NOTE | Admin UI + seed; documented setup procedure |
| 2 | Employee and Department relationships | READY | Admin UI; fixtures + hermetic/SQL |
| 3 | Device enrollment and Unit binding | READY | Bind-device API; offline/assignment/pilot browser |
| 4 | Password login | READY | Rate-limited; Supervisor+ |
| 5 | Quick PIN login | READY | STAFF / LEAD_TEAM_MEMBER only |
| 6 | Schedule visibility | READY WITH OPERATING NOTE | Schedule View; browser date caveat |
| 7 | Call-off entry | READY | Call-down reason format; board visibility |
| 8 | Staffing availability | READY | Board classifies available/unavailable |
| 9 | Daily Assignment creation | READY | Assignment Board; browser gates |
| 10 | Responsibility windows | READY | Facility-local windows; sequential OK |
| 11 | Assignment overlap protection | READY | Write-time advisory lock; tests |
| 12 | Assignment confirmation | READY | Actor/time; employee visibility after confirm |
| 13 | Assignment reopening | READY | Reason required |
| 14 | Post-confirmation override | READY | History preserved |
| 15 | Employee Assignment visibility | READY | Confirmed only |
| 16 | Shared-tablet Unit Workspace | READY | Device Unit binding |
| 17 | Offline Assignment context | READY | Read-only `assignmentContext` in bundle |
| 18 | Servery Ready | READY | Scoped, auditable Milestone |
| 19 | Meal Service Started | READY | Separate from Ready |
| 20 | Offline Milestone command | READY | IndexedDB queue; offline browser 32/32 |
| 21 | Synchronization | READY | Idempotent; authority revalidation |
| 22 | Conflict review | READY | Supervisor resolve; STAFF denied |
| 23 | Session revocation | READY | Immediate; pending offline not silently accepted |
| 24 | Device revocation | READY WITH OPERATING NOTE | Unbind/rebind; prior commands not retargeted |
| 25 | GM staffing coverage | READY | `/today/coverage` Assignment panel |
| 26 | GM service timing | READY WITH OPERATING NOTE | Unit Workspace + meal logs; not a single mega-widget |
| 27 | Supervisor exception visibility | READY | Board + Unit conflict UI |
| 28 | Audit history | READY WITH OPERATING NOTE | Assignment events incl. plan-level; Milestone history; Log Book may not show full Milestone UI |
| 29 | Operational-date rollover | READY WITH OPERATING NOTE | Date navigation; no formal CLOSED required |
| 30 | End-of-day review | READY WITH OPERATING NOTE | Procedure in GM/Supervisor guides; no CLOSE action |
| 31 | Records retrieval | READY WITH OPERATING NOTE | Source records by date/Unit; no enterprise report platform |
| 32 | Failure and fallback procedures | READY WITH OPERATING NOTE | `DIETARY_V1_FALLBACK_AND_RECOVERY.md` |

**No PILOT BLOCKER** in the 32-area matrix for product workflow when Assignments are enabled and setup follows documented procedure.

---

## Configuration readiness

| Setup | Status |
|-------|--------|
| Facility / Department / Floors / Units / Serverys | Admin UI (+ seed for synthetic pilot) |
| Meal times / service-time groups | Unit meal times via Admin |
| Employees, memberships, roles, Unit authority | Admin UI |
| Shared-device enrollment / Unit binding | Admin + bind-device |
| Coverage requirements / responsibility windows | Assignment templates + Board |
| Assignment feature activation | **`OPERATIONAL_ASSIGNMENTS_ENABLED=true`** (env) — **OPERATING NOTE** |
| Operations Engine | Remains **disabled** for pilot |
| Quick PIN issuance | Eligible frontline roles only |
| Password accounts | Supervisor and higher |
| Direct SQL for daily ops | **Not required** — would be a blocker if needed |
| Developer-only steps | Env flag for Assignments; initial hosting/env secrets |

Controlled pilot may use a documented administrative setup procedure. Direct SQL during ordinary pilot operation is a pilot blocker — **not applicable** when Admin + env flag are used.

---

## Synthetic operating-day scenario

Synthetic Terrace View Dietary scale (~100 Employees, ~17 serverys, seven call-offs, morning/afternoon windows, breakfast/lunch/dinner service-time groups). Exercised via:

- Existing Assignment browser gate
- Existing offline browser gate (Chromium matrix)
- New `npm run test:dietary-pilot` CI gate (`@ci-gate`): call-off/coverage, create+confirm+employee visibility, GM coverage, Quick PIN Unit Workspace + offline bundle, overlap + STAFF denial

Full narrative phases (preparation through close) are certified by the cumulative product + gates + operating procedures; the hosted gate uses the bounded critical subset for every push.

---

## Role certification

| Role | Result |
|------|--------|
| STAFF | PASS — Quick PIN; own confirmed Assignment; Milestones; no Assignment management |
| LEAD_TEAM_MEMBER | PASS — same credential boundary as STAFF |
| SUPERVISOR | PASS — password; Assignments, confirm/reopen, conflicts in scope |
| MANAGER | PASS — password; Department ops within Facility |
| GM | PASS — Facility Dietary staffing + timing visibility; no unsupported causal claims |
| FACILITY_ADMINISTRATOR | PASS — Admin scope; Access Matrix view; cannot redefine role capabilities; no Dietary Assignment/Milestone without operational Department authority |

Password and Quick PIN do not grant different authority for the same role beyond the approved credential boundary.

---

## GM Dashboard

| Signal | Result |
|--------|--------|
| Staffing coverage | Covered / At Risk / Uncovered; call-offs; plan confirmation; link to Assignment Board |
| Service timing | Ready / Started / late / Not Confirmed via Unit + meal views |
| Traceability | Facility, Department, Unit, operational date, Assignment, Milestone, actor |
| Limitations | Staffing ≠ meal success; no predictive/causal Nursing attribution; Log Book Milestone UI may be incomplete (source records suffice) |

---

## Performance (controlled pilot)

| Item | Classification |
|------|----------------|
| ~100 Employees / ~17 serverys / multi-meal | ACCEPTABLE FOR CONTROLLED PILOT |
| Assignment Board / Unit Workspace / Dashboard | NOTICEABLE BUT USABLE under synthetic load in browser gates |
| Offline bundle scoped Assignment context | ACCEPTABLE FOR CONTROLLED PILOT |

Environment: local/CI Node 20, Postgres 16 disposable `ltc_verify_*` / `ltc_ci_*`, Chromium Playwright. No caching infrastructure added.

---

## Recovery drills

Documented in `DIETARY_V1_FALLBACK_AND_RECOVERY.md`. Summary:

| Condition | Result |
|-----------|--------|
| Wi-Fi loss | Offline queue preserves Milestones |
| Refresh / restart | Queue retained |
| Session revocation | Reauth required; no silent accept |
| Conflict | Supervisor resolve; history kept |
| Missing meal / Assignment / unconfirmed plan | Visible; Not Confirmed ≠ failed occurrence |
| App / DB outage | Paper continuity + reconcile |

Unlimited uninterrupted operation during infrastructure outage is **not** claimed.

---

## Audit and history

| Area | Result |
|------|--------|
| Assignments / plan confirm / reopen / coverage ack | Append-only events (incl. plan-level when planId loaded) |
| Milestones / offline sync / conflicts / corrections | Originals preserved; corrections append |
| Facility isolation | Cross-Facility rejected |
| Frontline history | No broad historical access |
| Log Book full Milestone UI | CERTIFICATION FINDING — source-record access sufficient for controlled pilot |

---

## Time-zone behavior

| Case | Classification |
|------|----------------|
| Facility America/New_York | READY for operational date / meal context / Milestones |
| Browser UTC / remote Supervisor | CERTIFICATION FINDING — Milestone **correction** `datetime-local` is browser-local; **pilot procedure: Facility-local devices** with clear communication |
| Day rollover | READY WITH OPERATING NOTE — navigate by date; history retained |

Not classified PILOT BLOCKER when procedure restricts corrections to Facility-local devices.

---

## Environment readiness inventory (read-only)

| Item | Class |
|------|--------|
| App code / migrations / verify gates | READY IN REPOSITORY |
| AUTH_SECRET, DB URL, Assignments env flag | CONFIGURATION REQUIRED |
| Hosting, HTTPS, domain, object storage, email | DEPLOYMENT DECISION REQUIRED |
| Backup, restore, monitoring, incident contact, paper fallback | OPERATIONAL PROCEDURE REQUIRED |
| Production deployment choice | DEPLOYMENT DECISION REQUIRED — not chosen in this phase |

---

## Pilot documentation

| Doc | Path |
|-----|------|
| This certification | `docs/pilot/DIETARY_V1_PILOT_READINESS_CERTIFICATION_2026-08-05.md` |
| Supervisor | `docs/pilot/DIETARY_V1_SUPERVISOR_QUICK_START.md` |
| Employee tablet | `docs/pilot/DIETARY_V1_EMPLOYEE_TABLET_GUIDE.md` |
| GM daily review | `docs/pilot/DIETARY_V1_GM_DAILY_REVIEW.md` |
| Fallback / recovery | `docs/pilot/DIETARY_V1_FALLBACK_AND_RECOVERY.md` |

---

## Defects found and fixed in this certification

| Finding | Classification | Fix |
|---------|----------------|-----|
| Plan-level Assignment events omitted from board history when only planId events exist | CERTIFICATION FINDING → repaired | `loadAssignmentEvents(..., planId)` OR includes plan events; Assignment Board passes `planView?.id` |
| No integrated dietary pilot browser command | Gap for certification | Added `npm run test:dietary-pilot` + CI job `dietary-pilot-gate` |

No PILOT BLOCKER requiring unsafe redesign was opened for remediation beyond the small history-loader coherence fix.

---

## Automated evidence (local certification re-run)

| Gate | Result |
|------|--------|
| `verify:static` | PASS (65 migrations; hygiene; discovery) |
| `test:hermetic` | PASS — 1297 pass / 69 skip |
| `verify:build` | PASS |
| `verify:db` | PASS — disposable `ltc_verify_*`; dropped; `ltc_manager` untouched |
| `test:assignment-browser` | PASS |
| `test:offline-browser` | PASS — full matrix 25/25 (32 scenarios combined) |
| `test:dietary-pilot` | PASS — `@ci-gate` 5/5 |

Hosted Verify for this certification branch must complete successfully before product readiness is claimed as CI-confirmed.

---

## Final certification

### PRODUCT PILOT READINESS

**READY WITH FINDINGS**

Core operating-day workflow integrates for Supervisor, Employee (shared tablet), and GM with staffing and service timing, call-offs, Assignments, offline Milestone continuity, history, and documented recovery. Findings are operating notes (env flag, correction time-zone procedure, EOD without formal CLOSED, GM timing split across views, Log Book UI completeness) — not core blockers.

### PILOT ENVIRONMENT READINESS

**DEPLOYMENT DECISION REQUIRED**

Repository and procedures support a controlled pilot; hosting provider, HTTPS/domain, production secrets, backup/monitoring, and go-live ownership remain undecided and must not be conflated with product readiness.

---

## Remaining future capabilities

- Automatic scheduling / Assignment suggestions  
- Generalized Supervisor Coverage  
- Operations Engine / Job Flow  
- Offline Assignment editing  
- Offline cold-start authentication / offline Quick PIN verification  
- General offline Logs, Assets, Issues  
- Projection Unit Workspace controls  
- Full Log Book Milestone-history display  
- Production deployment  
- Active limiter-cleanup scheduling  

---

*Do not call the application launch-ready while deployment prerequisites remain undecided. Do not claim readiness while a required hosted Verify run is queued or in progress.*
