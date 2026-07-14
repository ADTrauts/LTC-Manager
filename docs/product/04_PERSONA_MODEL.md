# 04 — Persona Model

**Status:** Post–Wave 12 personas aligned to `AppRole` and default homes  

Roles in code: `FACILITY_ADMINISTRATOR`, `GM`, `MANAGER`, `SUPERVISOR`, `LEAD_TEAM_MEMBER`, `STAFF` (display often “Team Member”).

---

## Facility Administrator

| Field | Content |
|-------|---------|
| **Goals** | Facility stands up correctly; permissions safe; org/facility access correct; departments configured. |
| **Responsibilities** | Admin hub, permissions, organization facilities, departments, onboarding/billing edges. |
| **Decisions** | Who may enter which facility; which routes exist; structural setup. |
| **Primary workspace** | Business Workspace (daily), Administration for setup. |
| **Primary workflows** | Grant facility access; configure departments; review permissions; land on Workspace for ops day. |

---

## General Manager

| Field | Content |
|-------|---------|
| **Goals** | Facility performance across departments; escalate correctly; keep managers aligned. |
| **Responsibilities** | Oversight similar to Manager with broader facility authority; may own FA-adjacent setup depending on deployment. |
| **Decisions** | Cross-department priorities; staffing crises; when to involve FA/corporate. |
| **Primary workspace** | Business Workspace → OC / Today as needed. |
| **Primary workflows** | Morning Focus; OC exception sweep; issue escalation; org-aware facility switching when multi-site. |

---

## Department Director / Manager

| Field | Content |
|-------|---------|
| **Goals** | Own dietary (or EVS/Plant) day: ready locations, coverage, issues, inspections. |
| **Responsibilities** | Department lens; employee roster for domain; menus/assets as relevant; Workspace preferences. |
| **Decisions** | What to work personally next; which locations to send supervisors toward; when to declare recovery priorities. |
| **Primary workspace** | **Business Workspace**. |
| **Primary workflows** | Manager Focus → specific issue/unit/coverage; Agenda; Quick Actions; OC for live sweep; Knowledge/Inspections admin as needed. |

---

## Supervisor

| Field | Content |
|-------|---------|
| **Goals** | Multi-location walk: find what is slipping before it becomes a meal failure. |
| **Responsibilities** | Walk, coverage, call-downs, handoffs; limited Workspace Focus. |
| **Decisions** | Where to stand next; how to cover call-downs; what to hand to next shift. |
| **Primary workspace** | **Today's Work** (`/today`). |
| **Primary workflows** | Walk list ordered by Needs Attention; Coverage; Call-downs; Handoffs; peek OC; optional Workspace for Focus. |

---

## Lead Team Member

| Field | Content |
|-------|---------|
| **Goals** | Execute unit work + light lead tasks without admin noise. |
| **Responsibilities** | Logs, servery marks, report issues, unit inspections as assigned. |
| **Decisions** | Completing queue items in priority order. |
| **Primary workspace** | **Unit Workspace** (or `/logs` if no unit). |
| **Primary workflows** | Unit work queue; PIN/device bind when kiosk; no Business Workspace home. |

---

## Frontline Staff (Team Member)

| Field | Content |
|-------|---------|
| **Goals** | Finish due logs and local tasks quickly and correctly. |
| **Responsibilities** | Submit assigned logs; meal ready/started where permitted; raise issues. |
| **Decisions** | Minimal — follow queue and prompts. |
| **Primary workspace** | **Unit Workspace** / logs. |
| **Primary workflows** | Tablet PIN → unit → submit; never Admin or Workspace. |

---

## PIN User (device / kiosk session)

| Field | Content |
|-------|---------|
| **Goals** | Authenticate in seconds at a locked or assigned location. |
| **Responsibilities** | Same as Employee/Staff under device constraints. |
| **Decisions** | Same as Staff within unit lock. |
| **Primary workspace** | Locked **Unit Workspace**. |
| **Primary workflows** | Device bind → PIN → unit board; kiosk warnings when unit lock ≠ assignment. |

---

## Corporate (Organization-level persona)

| Field | Content |
|-------|---------|
| **Goals** | Multi-facility safety and portfolio visibility — **without** facility data bleed. |
| **Responsibilities** | Org structure; facility access grants; future rollups/templates (limited today). |
| **Decisions** | Which users may enter which facilities; which facilities exist under org. |
| **Primary workspace** | Admin Organization surfaces; then facility Workspace after switch. |
| **Primary workflows** | Manage facilities list; grant/revoke `UserFacilityAccess`; switch facility → full reload of Workspace. |

**Today’s maturity:** Corporate is **access + structure**, not analytics dashboard. Do not invent org-wide KPIs in Workspace.

---

## Home path summary

| Persona | Default home |
|---------|----------------|
| FA / GM / Manager | `/workspace` |
| Supervisor | `/today` (when Today's Work enabled) |
| Lead / Staff / PIN | `/unit/{id}` or `/logs` |
