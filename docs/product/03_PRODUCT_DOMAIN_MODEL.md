# 03 — Product Domain Model

**Status:** Current domain relationships. Authority for the platform map is [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md).  
**Rule:** Product language follows [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md). Persistence names below are compatibility, not a second model.

---

## Core entities (business meaning)

| Entity | Meaning |
|--------|---------|
| **Organization** | Parent legal/operating group; facilities belong here. Shared org alone never grants facility access. |
| **Facility** | Operational site with timezone, users, units, departments. Primary tenancy boundary for day-to-day data. |
| **UserFacilityAccess** | Explicit grant for a user to enter a facility. |
| **Department Product** | Vssyl-owned operational product (Dietary, EVS, Plant Operations). Code registry, not a customer-editable row. |
| **Department entitlement** | Commercial authorization that this facility purchased a Department Product. Not the install. |
| **Department** | Facility-installed instance of a Department Product (or a non-product local department). Lens + ownership — not a second app. |
| **Unit (Location)** | Physical section/wing where work is executed (kitchen, servery, EVS zone, plant area…). |
| **UnitSpace** | Room or area within a Unit (patient room, servery, soil hold, mechanical room). See `docs/location-architecture/`. |
| **Location Function** | Product `functionKey` bound to an existing room on a Department profile. Stored as `DepartmentRoomArchetype.key`. Not a room name, a label slug, or a physical room type. |
| **User / Employee** | App identity vs frontline roster identity (PIN sessions attach to Employee). |
| **Role** | Capability ladder: Staff → Lead → Supervisor → Manager → GM → Facility Administrator. |
| **Operation** | Time-bound commitment (e.g. Lunch service) via definition + instance when Operations Engine is on. |
| **Readiness** | Computed location state for an operation: Ready / In Progress / Needs Attention. |
| **Task** | Unified work projection (optional dual-write) over logs, repairs/issues, inspections. |
| **Issue** | Disruption requiring recovery — product façade over Repair + issue type. |
| **Repair** | Persistence/history for equipment (and related) corrective/preventive work. |
| **Inspection** | Scheduled or ad-hoc verification with occurrences, submissions, findings/follow-ups. |
| **Record** | One engine. Facility requirement segment, derived expected slot, `OperationalEvidenceRecord`, permitted waiver, correction, and follow-up. Legacy log and inspection stores are compatibility. |
| **Asset** | Equipment / plant object that can fail or need PM. |
| **Knowledge article** | Facility-scoped SOP/reference publishable into work context. |
| **Schedule / Override / Call-down** | Who is supposed to be where; intentional coverage change. |
| **WorkspacePreference** | Per-user, per-facility Workspace layout prefs. |

---

## Relationship diagram (business)

```text
Organization
  └── Facility ───────────────────────────────┐
        ├── User ◄── UserFacilityAccess       │
        ├── Employee                          │
        ├── Department ◄── installed Department Product (mode lens) │
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
