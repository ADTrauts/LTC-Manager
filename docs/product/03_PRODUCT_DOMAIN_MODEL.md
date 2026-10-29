# 03 — Product Domain Model

**Status:** Current domain relationships. Authority for the platform map is [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md).  
**Rule:** Product language follows [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md). Persistence names below are compatibility, not a second model.  
**Amended:** October 26, 2026. The [current foundation](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026) is the plug-in contract. This document owns the business relationships.

---

## Core entities (business meaning)

| Entity | Meaning |
|--------|---------|
| **Organization** | Canonical company/business entity (healthcare system, management company, school district, etc.). Used as Facility parent and as Department operating Organization. Shared org alone never grants facility access. |
| **Parent Organization** | The Organization that owns/groups the Facility in platform hierarchy (`Facility.organizationId`). |
| **Operating Organization** | The Organization with primary operating responsibility for a specific Department during a date-effective period (`DepartmentOperatorRelationship`). May equal Parent Organization (facility operated) or differ (contracted). |
| **Partner Organization** | An external Organization with an explicitly established Facility partnership (`FacilityPartnerOrganization`). Independent of Operating Organization. |
| **Partner Department Scope** | Departments the Facility has explicitly authorized under a partnership (`FacilityPartnerDepartmentScope`, timestamp periods). |
| **Facility** | Operational site with timezone, users, units, departments. Primary tenancy boundary for day-to-day data. |
| **UserFacilityAccess** | Explicit grant for a user to enter a facility (internal / same-parent-Organization path). |
| **User authorization (partner)** | Not implemented in Phase 2A. Partner relationship + Department scope do **not** grant any user Facility access. |
| **Department Product** | Vssyl-owned operational product (Food and Nutrition, EVS, Facility Plant Operations). Code registry, not a customer-editable row. Customer-visible only when release status is AVAILABLE. |
| **Department entitlement** | Commercial authorization that this facility purchased a Department Product. Not the install. |
| **Marketplace item** | Vssyl-published ready-made content added inside a Department: a Records form, Work preset, Operating Rhythm starter or Menu template. Included or Paid. Runs on Platform engines. Today only Records forms exist as items (`CatalogLogDefinition`). |
| **Department** | Facility-installed instance of a Department Product (or a non-product local department). Lens + ownership — not a second app. Operational records stay facility/department-scoped even when the operator differs from the parent Organization. |
| **Unit (Location)** | Physical section/wing where work is executed (kitchen, servery, EVS zone, plant area…). |
| **UnitSpace** | Room or area within a Unit (patient room, servery, soil hold, mechanical room). See `docs/location-architecture/`. |
| **Location Function** | Product `functionKey` bound to an existing room on a Department profile. Stored as `DepartmentRoomArchetype.key`. Not a room name, a label slug, or a physical room type. |
| **User / Employee** | App identity vs frontline roster identity (PIN sessions attach to Employee). Email/password authenticates the global `User`. Workspace eligibility is available contexts, not a facility-native vs organization-only identity class. |
| **User home Facility** | Optional `User.facilityId` presentation marker. Not login authority and not the active Facility. |
| **Active Facility** | Session/JWT facility context when `scopeKind = facility`. Switching does not rewrite home. |
| **Organization membership** | `UserOrganizationMembership` + `UserOrganizationRolePeriod` (`ORG_ADMIN` / `ORG_MEMBER`). Independent of Facility access. |
| **Role** | Facility Capability ladder (RoleKey): Staff → Lead → Supervisor → Manager → GM → Facility Administrator. Not Organization membership roles. |
| **Operation** | **Retired** September 25, 2026 ([RETIRED](../platform-vision/RETIRED.md)). The window is an Operational Cycle. Remaining `operationInstanceId` code is removed in LEG-05, and the tables drop at LEG-06. |
| **Readiness** | Computed location state: Ready / In Progress / Needs Attention. Location answers come from Runtime Location State. |
| **Task** | **Legacy.** Written only by Task Sync and legacy inspection work. Not Work. Removed in LEG-05, and the table drops at LEG-06 ([LEG-D12](../legacy-retirement/DECISIONS.md#leg-d12--dormant-systems-are-removed-not-kept-dormant--accepted-program-default-october-20-2026)). |
| **Request** | Intake asking for maintenance attention. Persistence today is `OperationalRequest`. |
| **Issue** | A known undesirable condition. Persistence today is `AssetIssue` (still Asset-required — see [14](./14_FACILITY_PLANT_OPERATIONS.md)). Not a façade over Repair. |
| **Work Order** | Accepted Facility Plant Operations maintenance work. Persistence today is `Repair`. Distinct from shared Work. |
| **Repair** | Persistence name for the Work Order row. Legacy `/issues` still redirects here. |
| **Inspection** | Scheduled or ad-hoc verification with occurrences, submissions, findings/follow-ups. |
| **Record** | One engine. Facility requirement segment, derived expected slot, `OperationalEvidenceRecord`, permitted waiver, correction, and follow-up. Legacy log and inspection stores are compatibility. |
| **Asset** | Equipment / plant object that can fail or need PM. |
| **Knowledge article** | Facility-scoped SOP/reference publishable into work context. |
| **Shift** | Who works, for which Department, and when (`ScheduleEntry`, from a `WorkShift` pattern). Not a place. A call-off marks the shift. |
| **Assignment** | Where a person works today and what they cover (`OperationalAssignment`). A move changes the Assignment. Optional: without one, a person sees the Work for the place they are signed into. |
| **Schedule / Override / Call-down** | Older umbrella for the two rows above. `AssignmentOverride` is legacy unit movement and retires (LEG-Q04). |
| **WorkspacePreference** | Per-user, per-facility Workspace layout prefs. |

---

## Relationship diagram (business)

This diagram predates the Operation retirement and the forward Records engine. Its Log, Inspection and Operation branches are legacy. It is redrawn after the foundation round.

```text
Organization (Parent)
  └── Facility ───────────────────────────────┐
        ├── User ◄── UserFacilityAccess       │
        ├── Employee                          │
        ├── Department ◄── installed Department Product (mode lens) │
        │     └── DepartmentOperatorRelationship → Organization (Operating; may differ from Parent)
        ├── FacilityPartnerOrganization → Organization (Partner; external)
        │     ├── FacilityPartnerAccessPeriod (security-active timestamps)
        │     └── FacilityPartnerDepartmentScope (authorized Departments; timestamps)
        ├── Unit (Location)                   │
        │     ├── Log assignments/submissions │
        │     ├── Issues / Repairs ── Asset   │
        │     ├── Inspection scope            │
        │     └── Readiness (computed)        │
        ├── OperationDefinition/Instance      │
        ├── Knowledge                         │
        ├── Inspection definitions/occurrences│
        └── WorkspacePreference (User×Facility)
```

### Parent Organization vs Operating Organization

These may be the same or different.

```text
Parent Organization:     ECMC
Facility:                Terrace View
Department:              Food & Nutrition
Operating Organization:  Metz Culinary Management
```

`DepartmentOperatorRelationship` is date-effective. On a vendor-run Department, the operator controls the Department and owns that period's data. Vendor accounts open the Departments their company runs. The Facility Administrator chooses the operator and sees the summary plus compliance Records.

### Partner Organization (Phase 2A governance)

```text
Facility:                 Terrace View
Partner Organization:     Metz Culinary Management
Authorized Departments:   Food & Nutrition
```

This means the Facility has established Metz as an external partner and has explicitly approved certain Departments as eligible for **later** partner access. It does **not** mean any Metz user may access Terrace View.

| Concept | Persistence | Grants user access? |
|---------|-------------|---------------------|
| Operating Organization | `DepartmentOperatorRelationship` (`@db.Date`, inclusive) | The operator's accounts, for the Departments that company runs |
| Partner Organization | `FacilityPartnerOrganization` + `FacilityPartnerAccessPeriod` (UTC timestamps, half-open) | After the facility attaches the company and the head accepts |
| Partner Department Scope | `FacilityPartnerDepartmentScope` (UTC timestamps, half-open) | Those Departments only |
| User authorization | Partner facility session | The Departments in scope |

`DepartmentOperatorRelationship` ≠ Facility partner authorization. UI may suggest operator Departments when configuring a partner; explicit Admin save is required. No automatic sync either direction.

**Phase 2A established the partnership without opening the facility.** Vendor accounts now open the Departments their company runs. They do not open another Department, Facility Builder, or Administration.

**Phase 2B1 identity:**

```text
Jane Smith
User
facilityId = null
roleId = null
Membership: Metz — ORG_ADMIN
Terrace View access: NONE

Andrew
Home Facility: Terrace View (User.facilityId)
Active Facility session: HighPointe
User.facilityId remains: Terrace View
```

Organization membership grants **zero** Facility access. Vssyl Console creates the partner company and invites the first Organization Administrator and the first members. That invitation does not open a facility. The claim queue remains for a company that already exists and has no administrator. The Facility Administrator attaches a company that already exists. Saving a partnership does not create the company.

**Phase 2C warning:** Do not set a partner user's home `User.facilityId` to a customer Facility. Active Facility must remain session-scoped for Path B.

Do not confuse with:

| Concept | Scope | Role |
|---------|-------|------|
| Parent Organization | Facility | Platform hierarchy / multi-facility grouping |
| Operating Organization | Department (date-effective) | Who runs the department |
| Partner Organization | Facility (timestamp access periods) | External partnership identity + security-active timeline |
| Partner Department Scope | Partnership × Department (timestamps) | Explicit authorized Department eligibility |
| `FacilityOrganization` | Facility / Asset | Asset maintenance responsibility (unchanged) |
| `Vendor` | Facility | Preferred repair/service provider (unchanged) |
| `Facility.managementCompanyName` | Facility (legacy string) | Compatibility only — not Department operator truth |

The two diagrams below are historical. The Operation entity is retired, and Operations Center, Today's Walk and Workspace Focus are replaced by the Dashboard ([DSH](../dashboard/README.md)).

```text
Operation (instance)
  ├── scopes expectations (logs, staffing, meal events)
  ├── feeds Operations Center / Workspace headers
  └── evaluated with Readiness rules per Unit × Department profile
```

```text
Disruption path
  Signal (failed log, OOS asset, staffing gap…)
    → Readiness Needs Attention / Issue open
    → Today's Walk / OC exception / Workspace Focus
    → Unit Workspace or Issue detail execution
    → Knowledge / Recovery assistant (optional)
    → Verification (close issue, complete inspection, restore Ready)
```

---

## Ownership of truth

| Concern | Authoritative owner |
|---------|---------------------|
| What kind of operational location is this for a Department? | Location Function on that Department’s profile (`functionKey`) |
| Where does published Work apply? | Published Work Plan applicability, including a Location Function key when the plan uses one |
| What window is active (what is happening now)? | Published Operational Cycle and Phase effective now. Build uses the working profile; Run uses ACTIVE. No published Cycle means no window, never a meal-time guess (foundation round, October 20, 2026). |
| What was expected on a past service date? | Audit / Reports, using the profile and requirement segment effective that day |
| Where should the supervisor look first? | The Dashboard |
| What should **I** do next (manager)? | The Dashboard |
| What do I do **at this unit**? | The "my work" view (below), for this place |
| Issue lifecycle | Issue / Repair module |
| Whether a Record was required | Derived expected slot from the requirement segment effective that day |
| Does this Department have a capability? | Its installed Department Product, plus a valid license when enforcement is on. Not a deployment switch ([Foundation amendment](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026)). |
| Which Marketplace items does this Department use? | Its added items. Today: `FacilityCatalogInstall` plus `LogAttachment` for Records forms. |
| What Work is expected? | Published Work Plans (derived requirements). Assignment does not create Work. |
| What is **my** work? | One "my work" view: Work Plan items for my assigned places, or for the place I'm signed into when I have no Assignment; Records due there; work orders and preventive maintenance assigned to me. Each source keeps its own store. The view is **Job Flow**, in every Department. |
| Who is scheduled to work, for which Department, and when? | The shift: `ScheduleEntry`, from a `WorkShift` pattern. A call-off marks the shift. |
| Who covers this location or Work right now? | The daily Assignment (`OperationalAssignment`). A move changes the Assignment. Shift and Assignment never create each other. |
| Who owns this equipment? | Title on the asset: the facility, or the company operating that Department. Existing assets stay facility-titled. A partner-titled asset leaves when the contract ends, and the facility keeps a closed note. |
| Who maintains it, and who is called to repair it? | The responsible maintainer, and a repair vendor from that maintainer's list. Title and maintainer are separate facts. |
| Am I on, and where? | My shift and my Assignment, not the Cycle |

Homes **must not** invent alternate truth for the rows above.

---

## Naming notes (domain vs code)

| Preferred product term | Common code/legacy term |
|------------------------|-------------------------|
| Location | `Unit` |
| Needs Attention | internal `blocked` |
| Issue | `Repair` table + `/repairs` routes still present |
| Location Function | `DepartmentRoomArchetype.key` / historical “Operational Type” |
| Records | `OperationalEvidenceRecord`; “Evidence” is internal |
| Audit / Reports | `/reports`; internal code may say Review |
| Key Point | `KEY_TIME` |
| Facility | sometimes called “Site” in older vision docs |

Constitution prefers **product terms** in UI and docs; schema renames are optional later.

---

## Inconsistencies to track

1. **Site vs Facility** — vision docs say Site; shipped model is Facility. Prefer Facility until a deliberate rename.  
2. **Issue vs Repair** — dual language remains; destination URLs still mixed.  
3. **Operation engine** — retired September 25, 2026. Its tables were dropped in LEG-06. "What's happening now" is the published Cycle and Phase.
4. **Task** — removed. Work never needs Task rows. The table was dropped in LEG-06.
5. **Unit vs Location** — UI prefers "Location"; model is `Unit`. UnitSpace is the room. See `docs/location-architecture/`.
6. **Location Function vs Operational Type** — code and some Build labels still say Operational Type or Archetype. The product word is Location Function. The older profile editor is removed.
7. **Capability switches** — retired in LEG-05 (LEG-D20). Cycles, Job Flow, evidence, Work Plans, assets, and Assignments come with the Department. `CANONICAL_LOGS_ENABLED` remains a code flag. The record-engine rollout table was dropped in LEG-06.
