# 03 — Product Domain Model

**Status:** Current domain relationships. Authority for the platform map is [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md).  
**Rule:** Product language follows [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md). Persistence names below are compatibility, not a second model.

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
| **Department Product** | Vssyl-owned operational product (Healthcare Food & Nutrition, EVS, Facility Plant Operations). Code registry, not a customer-editable row. Customer-visible only when release status is AVAILABLE. |
| **Department entitlement** | Commercial authorization that this facility purchased a Department Product. Not the install. |
| **Department** | Facility-installed instance of a Department Product (or a non-product local department). Lens + ownership — not a second app. Operational records stay facility/department-scoped even when the operator differs from the parent Organization. |
| **Unit (Location)** | Physical section/wing where work is executed (kitchen, servery, EVS zone, plant area…). |
| **UnitSpace** | Room or area within a Unit (patient room, servery, soil hold, mechanical room). See `docs/location-architecture/`. |
| **Location Function** | Product `functionKey` bound to an existing room on a Department profile. Stored as `DepartmentRoomArchetype.key`. Not a room name, a label slug, or a physical room type. |
| **User / Employee** | App identity vs frontline roster identity (PIN sessions attach to Employee). Email/password authenticates the global `User`. Workspace eligibility is available contexts, not a facility-native vs organization-only identity class. |
| **User home Facility** | Optional `User.facilityId` presentation marker. Not login authority and not the active Facility. |
| **Active Facility** | Session/JWT facility context when `scopeKind = facility`. Switching does not rewrite home. |
| **Organization membership** | `UserOrganizationMembership` + `UserOrganizationRolePeriod` (`ORG_ADMIN` / `ORG_MEMBER`). Independent of Facility access. |
| **Role** | Facility Capability ladder (RoleKey): Staff → Lead → Supervisor → Manager → GM → Facility Administrator. Not Organization membership roles. |
| **Operation** | Time-bound commitment (e.g. Lunch service) via definition + instance when Operations Engine is on. |
| **Readiness** | Computed location state for an operation: Ready / In Progress / Needs Attention. |
| **Task** | Unified work projection (optional dual-write) over logs, repairs/issues, inspections. |
| **Request** | Intake asking for maintenance attention. Persistence today is `OperationalRequest`. |
| **Issue** | A known undesirable condition. Persistence today is `AssetIssue` (still Asset-required — see [14](./14_FACILITY_PLANT_OPERATIONS.md)). Not a façade over Repair. |
| **Work Order** | Accepted Facility Plant Operations maintenance work. Persistence today is `Repair`. Distinct from shared Work. |
| **Repair** | Persistence name for the Work Order row. Legacy `/issues` still redirects here. |
| **Inspection** | Scheduled or ad-hoc verification with occurrences, submissions, findings/follow-ups. |
| **Record** | One engine. Facility requirement segment, derived expected slot, `OperationalEvidenceRecord`, permitted waiver, correction, and follow-up. Legacy log and inspection stores are compatibility. |
| **Asset** | Equipment / plant object that can fail or need PM. |
| **Knowledge article** | Facility-scoped SOP/reference publishable into work context. |
| **Schedule / Override / Call-down** | Who is supposed to be where; intentional coverage change. |
| **WorkspacePreference** | Per-user, per-facility Workspace layout prefs. |

---

## Relationship diagram (business)

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

`DepartmentOperatorRelationship` is **governance metadata** only. It does not move work, logs, teams, employees, assets, schedules, or other operational records to the operating Organization.

**Operating a Department does not grant users from that Organization access to the Facility.** Facility entry remains explicit `UserFacilityAccess` (same-Organization eligibility rules unchanged).

### Partner Organization (Phase 2A governance)

```text
Facility:                 Terrace View
Partner Organization:     Metz Culinary Management
Authorized Departments:   Food & Nutrition
```

This means the Facility has established Metz as an external partner and has explicitly approved certain Departments as eligible for **later** partner access. It does **not** mean any Metz user may access Terrace View.

| Concept | Persistence | Grants user access? |
|---------|-------------|---------------------|
| Operating Organization | `DepartmentOperatorRelationship` (`@db.Date`, inclusive) | No |
| Partner Organization | `FacilityPartnerOrganization` + `FacilityPartnerAccessPeriod` (UTC timestamps, half-open) | No (Phase 2A) |
| Partner Department Scope | `FacilityPartnerDepartmentScope` (UTC timestamps, half-open) | No (Phase 2A) |
| User authorization | Future Path B (Phase 2C+) | Not yet |

`DepartmentOperatorRelationship` ≠ Facility partner authorization. UI may suggest operator Departments when configuring a partner; explicit Admin save is required. No automatic sync either direction.

**Phase 2A grants zero external-user Facility access.** `UserFacilityAccess` remains internal / same-parent-org only.

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

Organization membership grants **zero** Facility access. First ORG_ADMIN is established only through Harbor-approved Organization claim (Phase 2B2). General member invitations remain a later phase (2B3).

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
| What window is active? | Published Operational Cycle effective now. Build uses the working profile; Run uses ACTIVE. |
| What was expected on a past service date? | Audit / Reports, using the profile and requirement segment effective that day |
| Where should the supervisor walk? | Today's Work walk/coverage |
| What should **I** do next (manager)? | Business Workspace Manager Focus |
| What do I do **at this unit**? | Unit Workspace work queue |
| Issue lifecycle | Issue / Repair module |
| Whether a Record was required | Derived expected slot from the requirement segment effective that day |

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
3. **Operation engine flag-off** — domain concept exists; some surfaces still use meal-heuristic context.  
4. **Task optional** — Work capability exists without Task rows when sync is disabled.  
5. **Unit vs Location** — UI prefers "Location"; model is `Unit`. UnitSpace will add room-level granularity. See `docs/location-architecture/`.
