# LTC Manager — BUILD Guide

**Mode:** BUILD — *Configure how the operation works.*
**Companion docs:** `LTC_MANAGER_BUILD_RUN_INFORMATION_ARCHITECTURE_2026-08-08.md`, `LTC_MANAGER_RUN_GUIDE.md`, `LTC_MANAGER_ADMIN_BOUNDARY.md`

---

## What BUILD is

BUILD is where authorized users **program the operating system** of the facility: physical structure, department operating logic, workforce configuration, Catalog Records (`/build/logs`), asset configuration, and procedures. BUILD is not an everyday operating mode for frontline roles — it is only offered to roles with configuration authority. Quick PIN frontline roles never see BUILD.

BUILD should feel like configuring one product. It intentionally has a **small** set of top-level builders — not dozens of tiles.

## Canonical BUILD tools

| Tool | Route | Who | Owns |
|------|-------|-----|------|
| **Facility Builder** | `/admin/facility/builder` | Facility Administrator | Physical structure & identity only: floors, neighborhoods/units, rooms/spaces, space types, location hierarchy. |
| **Department Builder** | `/admin/departments` | Manager+ | The operational-programming center — capability-aware per department. |
| **Employee Builder** | `/employees` | Manager+ | Workforce configuration: person/employment, department membership, job role, employment settings, HR. |
| **Logs** | `/build/logs` | Manager+ | Forward Catalog / Library / Attachments configuration. Live when `CANONICAL_LOGS_ENABLED`. Not `/staffing/templates`. |
| **Operational Templates** | `/staffing/templates` | Supervisor+ | Phase 9C compatibility. Historical / facility-private templates. Not the next layer after Catalog. |
| **Work Plans** | `/staffing/work-plans` | Manager+ | Department Work Plan builder (Phase 11A). |
| **Menus** | `/menus` | Supervisor+ (product offers Menus) | Department-owned Menu library. Open `/menus/[menuId]` for Overview, Menu content, and Applicability (locations + Operational Cycles). |
| **Procedures & Resources** | `/admin/knowledge` | Facility Administrator | Operational knowledge / procedure library (relabeled from "Operational Knowledge"). |

## Facility Builder (Section G)

Owns **only** physical structure and identity. It does **not** own department operating logic. Department ownership / responsibility may be assigned here only where already certified as physical-structure configuration (room responsibility). It does not duplicate Department Builder.

**Bulk Import (V1 onboarding):** managers may download a Facility Structure CSV template, validate/preview, then confirm create-only optional Building → Floor → Neighborhood → Location imports. Location Name / Location Type are user-facing terms for UnitSpace; Room Number is optional. Existing exact hierarchy is reused; imports never delete, move, or overwrite. See `docs/product/LTC_MANAGER_V1_BULK_ONBOARDING_IMPORTS_2026-08-09.md`.

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

## Logs Builder (Section J)

`/build/logs` is the forward manager configuration path for Catalog, Library, and Attachments when `CANONICAL_LOGS_ENABLED` is on. The chain is `CatalogLogDefinition` → `FacilityCatalogInstall` → `LogAttachment`. Do not redirect canonical users into `/staffing/templates`. Vssyl authors the Catalog in Harbor Template Studio (`/console/catalog`) using the same field types the evidence engine already stores. Catalog cadence, windows, and asset/department suggestions are recommendations; attachment is the live schedule and target.

`/staffing/templates` remains a Phase 9C compatibility surface for historical / facility-private `OperationalTemplate` rows (and PM/WO RecordRequirement pins). It is not the Marketplace Catalog and is not the next layer after `CatalogLogDefinition`. Writers are fenced when canonical Logs are on. Legacy inspections configuration (`/admin/inspections`) stays hidden from navigation, reachable/read-authoritative for FA, and write-fenced when canonical Logs are on. No legacy data is deleted. See the Legacy Surface Register.

## Asset Builder (Section K)

Asset **configuration** (identity, type, location, department relationship, configuration, retirement, preferred vendor) lives on `/assets/builder` (Build composition over the single asset registry). RUN Assets (`/assets`) shows operational status/evidence/issues/requests/work-orders/history. There is **one** asset registry — Asset Builder is a Build composition over it, not a duplicate.

**Bulk Import (V1 onboarding):** authorized users may CSV-import assets with human-readable Floor → Neighborhood → Space location matching. Create-only; stable identifiers skip existing rows; never creates issues/repairs/evidence. See `docs/product/LTC_MANAGER_V1_BULK_ONBOARDING_IMPORTS_2026-08-09.md`.

## Procedures & Resources (Section L)

The Knowledge / Procedure architecture is presented as **Procedures & Resources** (`/admin/knowledge`) in BUILD, in operational language rather than "Operational Knowledge". Authority is preserved (Facility Administrator). Legacy entry points redirect where useful. No new procedure model is created.

## Feature flags in BUILD

Operational builders carry registry feature flags so their nav link disappears when the capability is off, while the page keeps its own downstream guard:

- Logs (`/build/logs`) → `CANONICAL_LOGS_ENABLED` (default off)
- Operational Templates → `DIETARY_OPERATIONAL_EVIDENCE_ENABLED` (compatibility)
- Work Plans → `DIETARY_WORK_PLANS_ENABLED`

With all department flags off (default), BUILD still offers Facility Builder, Department Builder, Employee Builder, Menus, and Procedures & Resources to authorized roles. `OPERATION_ENGINE_ENABLED` and `TASK_SYNC_ENABLED` remain **false** and are unaffected.

## Authority in BUILD

BUILD visibility follows authority via the route registry: Facility Builder / Procedures & Resources are FA-only; Department Builder / Employee Builder / Work Plans / Logs (`/build/logs`) are Manager+; Operational Templates remains Supervisor+ as a compatibility surface. A user sees the Build segment only if they have at least one authorized Build tool. Facility Admin alone does not gain operational authority; department operational mutations still enforce department authority downstream.
