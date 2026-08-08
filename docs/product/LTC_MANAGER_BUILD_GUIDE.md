# LTC Manager — BUILD Guide

**Mode:** BUILD — *Configure how the operation works.*
**Companion docs:** `LTC_MANAGER_BUILD_RUN_INFORMATION_ARCHITECTURE_2026-08-08.md`, `LTC_MANAGER_RUN_GUIDE.md`, `LTC_MANAGER_ADMIN_BOUNDARY.md`

---

## What BUILD is

BUILD is where authorized users **program the operating system** of the facility: physical structure, department operating logic, workforce configuration, operational templates, asset configuration, and procedures. BUILD is not an everyday operating mode for frontline roles — it is only offered to roles with configuration authority. Quick PIN frontline roles never see BUILD.

BUILD should feel like configuring one product. It intentionally has a **small** set of top-level builders — not dozens of tiles.

## Canonical BUILD tools

| Tool | Route | Who | Owns |
|------|-------|-----|------|
| **Facility Builder** | `/admin/facility/builder` | Facility Administrator | Physical structure & identity only: floors, neighborhoods/units, rooms/spaces, space types, location hierarchy. |
| **Department Builder** | `/admin/departments` | Manager+ | The operational-programming center — capability-aware per department. |
| **Employee Builder** | `/employees` | Manager+ | Workforce configuration: person/employment, department membership, job role, employment settings, HR. |
| **Operational Templates** | `/staffing/templates` | Supervisor+ | The authoritative unified LOG / CHECKLIST / INSPECTION builder (Phase 9C). |
| **Work Plans** | `/staffing/work-plans` | Manager+ | Department Work Plan builder (Phase 11A). |
| **Menu Building** | `/menus` | Supervisor+ (Dietary) | Menu cycle / period / item configuration. |
| **Procedures & Resources** | `/admin/knowledge` | Facility Administrator | Operational knowledge / procedure library (relabeled from "Operational Knowledge"). |

## Facility Builder (Section G)

Owns **only** physical structure and identity. It does **not** own department operating logic. Department ownership / responsibility may be assigned here only where already certified as physical-structure configuration (room responsibility). It does not duplicate Department Builder.

## Department Builder (Section H)

The operational-programming center, organized by **capability-aware composition** — each department exposes only the tabs it uses:

| Department | Typical tabs |
|------------|--------------|
| **Dietary** | Overview · Locations · Operational Cycles · Work Plans · (meal-related config) |
| **EVS** | Overview · Locations · Zones · Operational Cycles · Work Plans |
| **Plant** | Overview · Locations · Zones (where useful) · Operational Cycles · Work Plans · Request / Routing intake |

There is **one** Department Builder. It composes existing capabilities; it does not fork into three builders, and it does not force every department to expose every tab. EVS-only options never appear for Dietary; meal-specific options never appear for EVS/Plant.

## Employee Builder (Section I)

Workforce **configuration**, separate from today's staffing:

- BUILD Employee Builder (`/employees`): person / employment, department membership, job role, employment configuration, certified workforce settings, HR (chrc, points, separations, terminations, import).
- RUN Employees (`/staffing`): today's schedule, attendance, assignments, coverage.

These are deliberately kept distinct.

## Operational Template Builder (Section J)

`/staffing/templates` is the clear authoritative Build experience for **LOG**, **CHECKLIST**, and **INSPECTION** (Phase 9C unified architecture). Legacy inspections configuration (`/admin/inspections`) is **not** presented as co-equal: it is hidden from navigation, kept reachable/read-authoritative for FA, and slated for retirement. No legacy data is deleted. See the Legacy Surface Register.

## Asset Builder (Section K)

Asset **configuration** (identity, type, location, department relationship, configuration, retirement, preferred vendor) is composed within the Assets area's Build affordances and Department Builder. RUN Assets (`/assets`) shows operational status/evidence/issues/requests/work-orders/history. There is **one** asset registry — Asset Builder is a Build composition over it, not a duplicate.

## Procedures & Resources (Section L)

The Knowledge / Procedure architecture is presented as **Procedures & Resources** (`/admin/knowledge`) in BUILD, in operational language rather than "Operational Knowledge". Authority is preserved (Facility Administrator). Legacy entry points redirect where useful. No new procedure model is created.

## Feature flags in BUILD

Operational builders carry registry feature flags so their nav link disappears when the capability is off, while the page keeps its own downstream guard:

- Operational Templates → `DIETARY_OPERATIONAL_EVIDENCE_ENABLED`
- Work Plans → `DIETARY_WORK_PLANS_ENABLED`

With all department flags off (default), BUILD still offers Facility Builder, Department Builder, Employee Builder, Menu Building, and Procedures & Resources to authorized roles. `OPERATION_ENGINE_ENABLED` and `TASK_SYNC_ENABLED` remain **false** and are unaffected.

## Authority in BUILD

BUILD visibility follows authority via the route registry: Facility Builder / Procedures & Resources are FA-only; Department Builder / Employee Builder / Work Plans are Manager+; Operational Templates is Supervisor+. A user sees the Build segment only if they have at least one authorized Build tool. Facility Admin alone does not gain operational authority; department operational mutations still enforce department authority downstream.
