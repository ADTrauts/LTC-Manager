# 08 — Product Language Guide

**Status:** Canonical terminology for UI, docs, and AI prompts  
**Rule:** Prefer one term. Avoid synonym drift.

---

## Product name

| Use this | Do not use as the product name |
|----------|-------------------------------|
| **Vssyl** | LTC Manager, Harbor, LTC Corp |
| **Vssyl Console** | Harbor Console, Staff desk *(as product name)*, LTC Corp console |
| **Business Operations Platform** (descriptor) | Long-term care nutrition software *(as the product identity)* |

A Department Product is a Vssyl-authored operating model. A Department is the facility’s local installed instance and local name. Healthcare Food & Nutrition is the Product; a facility may still call its Department Dietary. These are not synonyms for Vssyl.

---

## Homes and zones

| Use this | Do not use as synonym |
|----------|----------------------|
| **Business Workspace** | Manager Dashboard, Home Console, Mission Control |
| **Operations Center** | Global Dashboard *(legacy path `/dashboard` ok)*, Command Center |
| **Today's Work** | Supervisor Board, Daily Tasks (as zone name) |
| **Unit Workspace** | Unit Dashboard, Location App |
| **Locations** (nav) | Units list *(schema may still say Unit)* |
| **Administration** | Settings (unless form-level), Backend |

---

## Domain words

| Use this | Meaning | Avoid |
|----------|---------|-------|
| **Facility** | Operational site | Site *(vision alias — migrate language to Facility)* |
| **Organization** | Canonical company entity (Facility parent and/or Department operator) | Company, Tenant *(unless billing copy)*; do not invent ManagementCompany / OperatorCompany tables |
| **Parent Organization** | Organization that owns/groups the Facility | Treating a contracted department operator as the Facility parent |
| **Operating Organization** | Organization responsible for operating a Department (date-effective) | Management company string on Facility; Vendor; FacilityOrganization; Partner Organization *(different concept)* |
| **Partner Organization** | External Organization with an explicit Facility partnership | Inferring partnership from operators, vendors, or parent Organization |
| **Partner Department Scope** | Departments explicitly authorized under a partnership (timestamp periods) | Auto-syncing from Operating Organization; undated permanent rows |
| **Organization member / Organization administrator** | `ORG_MEMBER` / `ORG_ADMIN` on membership role periods | Facility Administrator; Vendor admin; putting ORG_* on RoleKey |
| **Home Facility** | Optional `User.facilityId` for facility-native Users | Active Facility; rewriting home on Facility switch |
| **Active Facility** | Session/JWT Facility context | Persisting active Facility by mutating `User.facilityId` |
| **Facility operated / Contracted** | Derived operating model (operator org == / != Facility parent org) | Persisted SELF_OPERATED / CONTRACTED enum *(prefer derivation)* |
| **Department Product** | Vssyl-published operational product (Healthcare Food & Nutrition, Environmental Services, Facility Plant Operations) | Industry pack, Experience, blank “create any department”, using a local Department name as the Product name; generic **Maintenance** as a Product name |
| **Department** | Facility-installed instance / operational ownership | Line of business |
| **Enabled** | `Department.isActive` — admitted to shared operations | Operationally active, configured, ready, healthy |
| **Operating rhythm** | Recurring Operational Cycles the department runs | Shift, schedule ceremony, setup steps |
| **Location Function** | Product-owned `functionKey` bound by the facility to an existing room. Persistence is `DepartmentRoomArchetype.key` on the Department profile. | Operational Type, Archetype, room name, physical room type, label slug |
| **Operational Cycle** | Root recurring window (persisted as root PERIOD) | Peer “Breakfast Cleanup” as a top-level operation, meal milestone engine |
| **Phase** | One interval inside an Operational Cycle (persisted as nested PERIOD) | Sub-operation, peer cycle |
| **Key Point** | Instant on a Cycle (persisted as `KEY_TIME`) | Key Time in current product language, Work, a Record |
| **Records** | Manager umbrella for Reading, Checklist, Inspection, Acknowledgement, and On-demand Record. One engine. The fact is `OperationalEvidenceRecord`. | Logs and Inspections as separate canonical engines; Evidence in manager language |
| **Audit / Reports** | Expected versus actual for a service date or range. Route may remain `/reports`. | Review as a workspace |
| **People & Coverage** | Department Builder section for teams and coverage | Teams as a peer top-level product, a second people system |
| **Participating location** | Room explicitly attached to a cycle | Department-responsible room *(responsibility ≠ participation)* |
| **Work applicability** | Where a Work Plan’s expected Work may exist | Assignment, cycle participation, department responsibility *(each is separate)* |
| **Healthy quiet** | Rhythm and participation exist; no operation is active now | Not configured, missing rooms, idle, complete |
| **Make live** | Publish configured cycles so Run can use them | Review & Publish, Submit for Review |
| **Room / Space** | Area within a unit; model is `UnitSpace` | Location *(reserve for section level; see `docs/location-architecture/`)* |
| **Location / Unit** | Place of work — UI “Location”, model often `Unit` | Room *(unless truly a resident room entity)* |
| **Operation** | Time-bound service commitment | Shift *(shifts are coverage; operations are service windows)* |
| **Expected Work** | What the operation needs doing today, derived from published Work Plans | Tasks due, inbox, job list |
| **Work Plan** | Recurring expected Work configuration | Job, checklist catalog |
| **Recurring Work** | Shared Work Plans / rounds and walkthroughs | Treating rounds as Preventive Maintenance; treating Work Orders as shared Work |
| **My Work** | Person-scoped Work | Today's Work *(Today is the operation; My Work is mine)* |
| **Task** | Work Engine projection | Ticket *(unless issue context)* |
| **Request** | Intake: someone is asking for maintenance attention | Treating a Request as the problem itself or as a Work Order |
| **Issue** | A known undesirable condition. May exist without an Asset or a Work Order | Ticket, Incident *(unless safety-legal context)*; collapsing Issue into Request or Repair |
| **Work Order** | Facility Plant Operations accepted maintenance work with a persistent lifecycle | Generic shared Work; Repair as the manager-facing noun |
| **Repair** | Persistence name for the Work Order row (`Repair`, `/repairs`) | Using Repair as the Product name for Issue or for Facility Plant Operations |
| **Preventive Maintenance Plan** | Published maintenance rule for a specified target and fixed cadence | Operational Cycle; rolling next-due as the Product definition of PM; recurring facility rounds |
| **Finding** | Inspection item outcome needing follow-up | Defect *(unless manufacturing)* |
| **Inspection** | A Record form inside the one Record engine | A second inspection engine; Audit / Reports |
| **Knowledge** | Operational SOP/reference | Wiki, CMS |
| **Asset** | Shared Platform equipment / built-environment object | Device *(reserve for PIN tablets)*; PlantAsset / MaintenanceAsset |
| **Asset lifecycle** | Registry status such as operational, out of service, retired | Treating lifecycle as the same fact as observed condition |
| **Asset condition** | Observed operating condition, updated from work and inspection facts | Treating condition restore as an automatic Work Order closeout |
| **Facility Plant Operations** | Department Product for maintaining the built facility environment | Generic Maintenance as the Product name; treating manufacturing/fleet/biomedical maintenance as this Product; using the local Department name as the Product name |
| **Plant Operations** | Default local Department name for an installed Facility Plant Operations Product | Official Product name |
| **Employee** | Roster person | User *(User = app login identity)* |
| **User.role** | Compatibility / home-default Facility RoleKey only. Active internal authority is the current `UserFacilityRolePeriod` for the selected Facility grant. | Treating `User.roleId` as the RoleKey at every Facility; Employee.roleType; job title |
| **Facility Administrator** | Facility-scoped administrative authority | Equating GM with FA |
| **Call-down** | Coverage change needing attention | Call-off *(synonym risk — pick Call-down in product)* |

---

## Readiness language

| Use this (UI) | Internal may remain |
|---------------|---------------------|
| **Ready** | `ready` |
| **In Progress** | `in_progress` |
| **Needs Attention** | `blocked` |

Never show **Blocked** to end users. Never say **Complete** for readiness green.

---

## Workspace language

| Use this | Avoid |
|----------|-------|
| **Manager Focus** | Top Priorities *(as section title — Priorities may exist as optional list)* |
| **Management Agenda** | Calendar, Schedule *(no RRULE)* |
| **Quick Actions** | Shortcuts Dock |
| **Current operations are on track.** | All clear / Green day / No problems |

---

## AI language

| Use this | Avoid |
|----------|-------|
| **Morning Brief** | AI Summary (unless origin is fallback Operational Summary) |
| **cached** | Live AI when showing Workspace peek |
| **Operational Summary** | Only for non-AI fallback origin |

---

## Consolidation recommendations (docs; code later)

1. Prefer **Request**, **Issue**, and **Work Order** as distinct nouns. Keep `/repairs` until routes converge; do not revive Repair-as-Issue façade copy.  
2. Prefer **Facility** over Site in new docs.  
3. Prefer **Needs Attention** everywhere readiness is user-visible.  
4. Stop calling Workspace “Wave 12 Industry” — that overloaded the roadmap term.
