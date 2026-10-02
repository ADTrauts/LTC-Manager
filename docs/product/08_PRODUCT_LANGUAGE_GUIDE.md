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

Departments (Dietary, EVS, Plant Operations, and others) are operational domains **inside** Vssyl. They are not synonyms for the product.

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
| **Organization** | Parent of facilities | Company, Tenant *(unless billing copy)* |
| **Department Product** | Vssyl-published operational product (Dietary, EVS, Plant Operations) | Industry pack, Experience, blank “create any department” |
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
| **My Work** | Person-scoped Work | Today's Work *(Today is the operation; My Work is mine)* |
| **Task** | Work Engine projection | Ticket *(unless issue context)* |
| **Issue** | Disruption requiring recovery | Ticket, Incident *(unless safety-legal context)* |
| **Repair** | Persistence/equipment work order record | Prefer Issue in product copy when showing the façade |
| **Finding** | Inspection item outcome needing follow-up | Defect *(unless manufacturing)* |
| **Inspection** | A Record form inside the one Record engine | A second inspection engine; Audit / Reports |
| **Knowledge** | Operational SOP/reference | Wiki, CMS |
| **Asset** | Equipment / plant object | Device *(reserve for PIN tablets)* |
| **Employee** | Roster person | User *(User = app login identity)* |
| **User.role** | Platform authorization (session) | Employee.roleType, job title, Department Manager |
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

1. Prefer **Issue** in all manager-facing copy; keep `/repairs` only until routes converge.  
2. Prefer **Facility** over Site in new docs.  
3. Prefer **Needs Attention** everywhere readiness is user-visible.  
4. Stop calling Workspace “Wave 12 Industry” — that overloaded the roadmap term.
