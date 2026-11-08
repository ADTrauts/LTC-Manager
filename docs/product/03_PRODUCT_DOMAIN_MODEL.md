# 03 — Product Domain Model

**Status:** Current domain relationships. Authority for the platform map is [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md).  
**Rule:** Product language follows [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md). Persistence names below are compatibility, not a second model.  
**Amended:** October 26, 2026; Phase 1 reconciliation November 8, 2026 ([01B](./01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md)). The [current foundation](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026) plus Nov 1–2 and Phase 1 amendments are the plug-in contract. This document owns the business relationships.

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
| **Marketplace item** | Vssyl-published ready-made content added inside a Department: a Records form, Operating Rhythm starter, or Menu template. Included or Paid. Runs on Platform engines. Today only Records forms exist as Catalog items (`CatalogLogDefinition`). Work presets are not a forward Marketplace kind. |
| **Department** | Facility-installed instance of a Department Product (or a non-product local department). Lens + ownership — not a second app. Operational records stay facility/department-scoped even when the operator differs from the parent Organization. |
| **Unit (Location)** | Physical section/wing where work is executed (kitchen, servery, EVS zone, plant area…). |
| **UnitSpace** | Room or area within a Unit (patient room, servery, soil hold, mechanical room). See `docs/location-architecture/`. |
| **Location Function** | **Retired / compatibility-only.** Historical Product `functionKey` bound on a Department profile (`DepartmentRoomArchetype.key`). Not forward architecture. Engines use canonical place ids and Department responsibility instead ([01B](./01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md)). |
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
| **Shift** | Who works, for which Department, and when (`ScheduleEntry`, from a `WorkShift` pattern). Not a place. A call-off marks that whole shift absent. |
| **Assignment** | Where a person works today and what they cover (`OperationalAssignment`). A move changes the Assignment. A called-off shift in the same Department stops the overlapping Assignment from counting toward Coverage. The Assignment row stays. Optional: without one, a person sees the Work for the place they are signed into. |
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
| Which places may this Department use? | Facility Builder Department responsibility on canonical Units / UnitSpaces. Not Location Function. |
| What window is active (what is happening now)? | Published Operational Cycle and Phase effective now. No published applicable Cycle means no window (`NOT_CONFIGURED`), never a meal-time guess (foundation round, October 20, 2026). |
| What was expected on a past service date? | Audit / Reports, using each owning engine’s historically effective configuration (Cycle versions, LogAttachment intervals, Coverage template intervals, etc.) — not a Department profile as a history bus |
| Where should the supervisor look first? | The Dashboard |
| What should **I** do next (manager)? | The Dashboard |
| What do I do **at this unit**? | The "my work" view (below), for this place |
| Issue lifecycle | Issue / Repair module |
| Whether a Record was required | Derived expected slot from the requirement segment effective that day |
| Does this Department have a capability? | Its installed Department Product, plus a valid license when enforcement is on. Not a deployment switch ([Foundation amendment](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026)). |
| Which Marketplace items does this Department use? | Its added items. Today: `FacilityCatalogInstall` plus `LogAttachment` for Records forms. |
| What generic Work is expected? | **None in forward architecture.** Residual Work Plans are compatibility-only until Phase 2 removal. Do not invent Task/Activity replacements. |
| What is **my** work? | **Job Flow** composition: Assignment context (or signed-in place when none), current Cycle/Phase window, Records due, assigned work orders and preventive maintenance. Each source keeps its own store. Live code may still also read Work Plans (gap). |
| Who is scheduled to work, for which Department, and when? | The shift: `ScheduleEntry`, from a `WorkShift` pattern. A call-off marks that whole shift absent. `calledOffAt` is when the absence was recorded. It does not start a partial shift. |
| Who covers this location or Work right now? | The daily Assignment (`OperationalAssignment`). A move changes the Assignment. Shift and Assignment never create each other. A called-off shift in the same Department stops that Employee's overlapping Assignment from counting toward Coverage. The Assignment row stays. |
| Who is supervising this Department and location right now? | The Assignment whose role is that Department's supervisor-rounding responsibility, for the service window that contains now, at the most specific covering location. A call-off on the shift removes that Employee. The Supervisor role and the Department head do not answer it |
| Who must respond to an operational incident right now? | The On-Call Coverage Assignment for that Department. The role is `DIETARY_ON_CALL_COVERAGE`, `EVS_ON_CALL_COVERAGE`, or Plant `ON_CALL_COVERAGE`. A location-specific Assignment beats a Department-wide one. An Assignment that starts one service date and ends the next morning still covers that later instant. A call-off removes the Employee only while the call-off covers the instant. The Supervisor role, the Department head, and the Work Order assignee do not answer it |
| When did this coverage deficiency start, worsen, or end? | Coverage. The current answer stays derived. A Coverage episode is the history of one continuous deficiency for one slot. A later deficiency is a new episode. Notifications do not invent the episode. Scheduled Evaluation may ask Coverage to look again because time passed. Coverage still decides the answer |
| Is this Key Point overdue? | The Operational Cycle. Only `occurrenceTracking = REQUIRED` can be overdue. The expected time is the same-day adjustment when one exists, otherwise the configured facility-local minute. The occurrence is `OperationalCycleKeyPointActual`. The expected minute is due, not overdue. Scheduled Evaluation may ask. Notifications do not decide |
| Who is assigned this Work Order? | The Work Order (`Repair.assignedEmployeeId`). A material change writes one Work Order history row in the same transaction as the assignee. Create, reassignment, and clearing the assignee use that path. Issue-created, Request-created, and Preventive Maintenance Work Orders are the same `Repair`. Notifications tell the Employee named by that history row. They do not assign, complete, or prioritize the Work Order |
| Is this Work Order overdue? | The Work Order. `dueAt` is the operational deadline instant. A missing deadline is not overdue. Open, assigned, in progress, on hold, and waiting on a vendor can be overdue. Hold does not pause the deadline. Completed and cancelled Work Orders are not overdue. `targetDate` is the planning date and is not this answer. Preventive Maintenance stores the scheduled civil day on the occurrence. The generated Work Order deadline is the start of the next facility-local day. Scheduled Evaluation may ask. Notifications do not decide |
| How important is this Work Order in the queue? | The Work Order. `Repair.priority` is Facility Plant Operations prioritization: Routine, High, Urgent, or Emergency. Stored `LOW` and `MEDIUM` both present as Routine. The default is `MEDIUM`. It does not say that immediate response is required |
| Does this Work Order require immediate operational response? | The Work Order. `responseRequirement` is `STANDARD` or `IMMEDIATE`. The default is `STANDARD`. It is active while the Work Order is open and the requirement is `IMMEDIATE`. An opening, a clearing, a completion, and a cancellation each write `WorkOrderResponseHistory`. A later opening is a new row. Completion and cancellation leave the classification in place and end the active episode. Hold does not clear it. Issue priority, Request urgency, Asset status, the assignee, and `dueAt` do not set it. Preventive Maintenance creates `STANDARD`. There is no Work Order preset. A supervisor who can manage the Work Order sets it on `/repairs/[id]`. Staff and a PIN session can see it and cannot change it. A completed or cancelled Work Order keeps the stored value. The opening history row publishes `work_order.intervention_required`. Clearing ends that notice. Completion resolves it. Cancellation ends it. The notice is Urgent for On-Call Coverage. It is not Critical and it is not protected. Queue priority does not publish it |
| When should this Work Order be completed? | The Work Order. `dueAt` is the operational deadline. `targetDate` is the planning date. Neither is the response requirement |
| What corrective action was taken on this Record? | The Record. `correctiveActionText` is the action written at submission. `correctiveActionAt` is when that text was entered. It is not a due time. The Record stays out of standard. A later measurement is another Record (`followsRecordId`). A condition that needs future work is an Issue or a Work Order, created explicitly. Records does not own an open corrective-action deadline |
| Does an out-of-standard Record ask for attention? | The submission publishes `evidence.failed` when the Record is out of standard. Notifications delivers an Update to the on-duty supervisor. The Record remains the historical fact. Corrective text, a later recheck, an Issue, and a Work Order do not close that Update. Catalog `critical` scores an inspection. It is not notification severity |
| Was a new Issue created? | The Issue. `reportIssue` and Issue-from-Request create it. The same write publishes `issue.created`. That notice is an Update for the on-duty supervisor. Issue `priority` and `operationalImpact` stay on the Issue. They do not set notification priority. An Issue has no assignee. A later Work Order does not replace this notice |
| Is this Asset out of service? | The Asset. `status = OUT_OF_SERVICE` is written by `changeAssetStatus`, with one `AssetStatusHistory` row. That row is the outage episode. `DEGRADED` still participates, so a move from `OUT_OF_SERVICE` to `OPERATIONAL` or `DEGRADED` ends the outage. Retirement ends the Asset lifecycle. A later outage is a new history row. An Issue, a failed Record, and a Work Order do not set the status. Closeout changes it only when the person chooses a condition other than no change. The same write publishes `asset.out_of_service` to On-Call Coverage for the Asset's Department. Return to a usable status publishes `asset.returned_to_service` and resolves that episode. Retirement publishes the end and the history label is Ended. Asset criticality stays on the Asset. The responsible organization is not an Employee |
| Who owns this equipment? | Title on the asset: the facility, or the company operating that Department. Existing assets stay facility-titled. A partner-titled asset leaves when the contract ends, and the facility keeps a closed note. |
| Who maintains it, and who is called to repair it? | The responsible maintainer, and a repair vendor from that maintainer's list. Title and maintainer are separate facts. |
| Am I on, and where? | My shift and my Assignment, not the Cycle |
| Should a person hear about this change, and how loudly? | Notifications & Attention. The engine owns the thread, the recipient, and delivery. It does not own the condition. [16](./16_NOTIFICATIONS_AND_ATTENTION.md) |
| Has the operational condition actually ended? | The domain that owns it. Coverage restored, readiness Ready, asset returned to service, Issue closed, or the Work Order leaving the state that thread was about. Corrective text on a Record does not close later Issue or Work Order work, and it does not turn the Record into a pass. Acknowledgement does not resolve it |
| What should the supervisor's current list show? | Dashboard Attention, composed from the owners. That list is not a Notification row |
| What was said in a conversation? | Chat, when that domain exists. A message does not change the rows above |

Homes **must not** invent alternate truth for the rows above.

---

## Naming notes (domain vs code)

| Preferred product term | Common code/legacy term |
|------------------------|-------------------------|
| Location | `Unit` |
| Needs Attention | internal `blocked` on readiness. Also a notification priority. Name which scale. See [16](./16_NOTIFICATIONS_AND_ATTENTION.md#three-different-scales) |
| Issue | `Repair` table + `/repairs` routes still present |
| Location Function (retired) | `DepartmentRoomArchetype.key` / historical “Operational Type” — compatibility only |
| Records | `OperationalEvidenceRecord`; “Evidence” is internal |
| Audit / Reports | `/reports`; internal code may say Review |
| Key Point | `KEY_TIME` |
| Facility | sometimes called “Site” in older vision docs |
| Work Order | Persistence `Repair` |
| Operational eligibility | `EmployeeOperationalRoleQualification` + `OPERATIONAL_ROLE_REGISTRY` |
| Department Job Role (retired) | `DepartmentJobRole` — compatibility only after Nov 6 restore |

Constitution prefers **product terms** in UI and docs; schema renames are optional later.

---

## Inconsistencies to track

1. **Site vs Facility** — vision docs say Site; shipped model is Facility. Prefer Facility until a deliberate rename.  
2. **Issue vs Repair** — dual language remains; destination URLs still mixed.  
3. **Operation engine** — retired September 25, 2026. Its tables were dropped in LEG-06. "What's happening now" is the published Cycle and Phase.
4. **Task** — removed. Do not recreate Task or generic Work. The Task table was dropped in LEG-06.
5. **Unit vs Location** — UI prefers "Location"; model is `Unit`. UnitSpace is the room. See `docs/location-architecture/`.
6. **Location Function / Operational Type / archetype** — **retired.** Residual schema and Locations bind/publish remain after the Nov 6 restore (Phase 0 ARR-001/004/026). Phase 2 removes them.
7. **Capability switches** — retired in LEG-05 (LEG-D20). Shared engines come with the installed Department. `CANONICAL_LOGS_ENABLED` remains a code flag. The record-engine rollout table was dropped in LEG-06.
8. **Generic Work Plans** — retired as architecture; still present in schema and Job Flow until Phase 2.
9. **Department Job Role** — retired as architecture; still present beside operational qualifications until Phase 2.
