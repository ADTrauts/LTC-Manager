# 02 — Product Capability Model

**Status:** Post–Wave 12 capability inventory  
**Rule:** Capabilities describe **user-facing value**. Engines are dependencies, not capabilities by themselves.

---

## Capability map

| Capability | Primary home(s) | Primary users |
|------------|-----------------|---------------|
| Business Workspace | `/workspace` | Manager, GM, Facility Administrator; limited Supervisor |
| Operations | Operations Center `/dashboard` | Manager+, Supervisor+ |
| Work | Issues, inspections, logs, Task sync | All operational roles (scoped) |
| Resources | Assets, vendors, menus (as op context) | Manager+, dept leads |
| People | Employees / staffing / schedules | Manager+, Supervisor (limited) |
| Administration | `/admin/*` | Facility Administrator; Manager (limited) |
| Intelligence | AI moments + cached briefs | Manager+ generate; Supervisor+ view where enabled |

---

## 1. Business Workspace

| Field | Definition |
|-------|------------|
| **Purpose** | Manager daily home: personal next actions, agenda, quick launches — **not** a second Operations Center. |
| **Owner** | Product / shell (Wave 12 BW) |
| **Primary users** | Manager, GM, FA; Supervisor sees Focus / Agenda / Quick Actions / Today's Work links |
| **Sub-capabilities** | Manager Focus; Management Agenda; Quick Actions; optional Department Health, Performance Snapshot, Recent Activity, priorities; facility-scoped preferences; optional **cached** Morning Brief peek |
| **Dependencies** | Readiness, OC aggregates, Today's Work signals, issues, inspections, knowledge activity, WorkspacePreference |
| **Future growth** | Prefer refinement over new sections; never become analytics or generation console |

---

## 2. Operations

| Field | Definition |
|-------|------------|
| **Purpose** | Site-wide **situational awareness** for the active operation: exceptions, pulse, meal boards, staffing gaps. |
| **Owner** | Operations Center + Operations Engine context |
| **Primary users** | Manager, Supervisor, GM, FA |
| **Sub-capabilities** | Operation header; Site Pulse; unit exceptions; open/urgent repairs; staffing gaps; call-down summary (when loaded); meal boards; Morning Brief card (when AI enabled) |
| **Dependencies** | Facility timezone, OperationInstance (when engine on), readiness, dashboard queries, department lens |
| **Future growth** | Department-specific exception packs; never become execution-for-floor staff |

---

## 3. Work

| Field | Definition |
|-------|------------|
| **Purpose** | Assignable, completable operational work — logs, issues/repairs, inspections — with optional Task dual-write. |
| **Owner** | Work Engine adapters + Issue / Inspection / Log surfaces |
| **Primary users** | Floor staff execute; supervisors assign/follow; managers triage |
| **Sub-capabilities** | Log assignments/submissions; Issue lifecycle (Repair-backed); Inspection definitions/occurrences/submissions/findings; Task sync (`TASK_SYNC_ENABLED`) |
| **Dependencies** | Units, departments, assets (for repairs), readiness signals |
| **Future growth** | More issue types / recovery flows; do not invent a parallel inbox that bypasses engines |

---

## 4. Resources

| Field | Definition |
|-------|------------|
| **Purpose** | Physical and menu context needed to run service — equipment, vendors, menus cycles. |
| **Owner** | Assets / Menus modules |
| **Primary users** | Plant / dietary managers, FA |
| **Sub-capabilities** | Asset registry & criticality; vendors; menu cycles/items/portions; preventive schedules (plant readiness inputs) |
| **Dependencies** | Units, departments |
| **Future growth** | Supply/PAR as **ops signal** only — not inventory accounting |

---

## 5. People

| Field | Definition |
|-------|------------|
| **Purpose** | Who can work where, coverage for the day, operational employment records. |
| **Owner** | Employees + Staffing |
| **Primary users** | Manager+, Supervisor (coverage/call-downs) |
| **Sub-capabilities** | Roster; schedules/overrides; call-downs; discipline points / separations / CHRC as facility HR adjacency; PIN employees |
| **Dependencies** | Units, departments, roles |
| **Future growth** | Predictive staffing later; never payroll ownership |

---

## 6. Administration

| Field | Definition |
|-------|------------|
| **Purpose** | Deliberate setup — never default home. |
| **Owner** | Facility Administrator (+ constrained Manager tools) |
| **Primary users** | FA primarily |
| **Sub-capabilities** | Permissions/routes; departments; organization & facility access grants; knowledge admin; inspection admin; units registry; onboarding/billing surfaces |
| **Dependencies** | Organization, UserFacilityAccess, Role |
| **Future growth** | Org templates/SSO — still admin, not Workspace |

---

## 7. Intelligence

| Field | Definition |
|-------|------------|
| **Purpose** | Time-boxed, grounded AI **moments** that compress existing operational state. |
| **Owner** | AI Morning Brief / Shift Transition / Recovery Assistant |
| **Primary users** | Manager+ refresh/generate; Supervisor+ may view where OC allows |
| **Sub-capabilities** | Morning Brief (OC + cached Workspace peek); Shift Transition (Today's Work); Recovery Assistant (issue detail); snapshot / cache / rate limits |
| **Dependencies** | Readiness, issues, staffing, feature flags (`AI_*_ENABLED`) |
| **Future growth** | More moments on existing homes; **no** AI chatbot surface as a zone |

---

## Cross-cutting substrates (not primary capabilities)

| Substrate | Job |
|-----------|-----|
| **Operations Engine** | Bound “Breakfast Tue” — OperationDefinition / OperationInstance |
| **Readiness** | Ready / In Progress / Needs Attention from department-aware rules |
| **Design System** | Shared visual and status language |
| **Department lens** | Mode filter, not a separate product |
| **Facility / Organization tenancy** | Scope and multi-site access |

---

## Observed overlaps (document only — no code change)

1. **Three manager-facing “start” surfaces** — Workspace, OC, Today's Work — must stay role-specialized.  
2. **Repair route vs Issue language** — same domain object family; Constitution requires language consolidation over time.  
3. **Work Engine Task sync optional** — capability “Work” exists for users even when Task rows are flag-off.  
4. **“Wave 12” overloaded** — roadmap once meant Industry Configuration; implementation used Wave 12 for Business Workspace. Roadmap rewrite resolves this ([10_PRODUCT_ROADMAP.md](./10_PRODUCT_ROADMAP.md)).
