# 14 — Facility Plant Operations

**Status:** Canonical Department Product architecture  
**Release status:** **DEVELOPMENT** — internal only; not Marketplace-visible; not selectable in the customer Department picker; not AVAILABLE  
**Does not:** Implement runtime, create migrations, rename models/routes, delete legacy code, publish starter content, or change billing/entitlement  
**Platform contract:** [13 — Department Product](./13_DEPARTMENT_PRODUCT.md)  
**Platform map:** [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md)  
**Vocabulary:** [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md)  
**Repository reconciliation:** [current 2026-10-06](../plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-06.md) · [historical Phase 0/1 audit 2026-10-05](../plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md)

This document is the target Product architecture. Existing Platform Assets, repairs, requests, and Phase 12A reference code are evidence of available foundation. They do not define this Product.

**Implementation through Phase 5B:** corrective MVP, Preventive Maintenance MVP, product coherence, and optional starter configuration are implemented. The Product remains **DEVELOPMENT**. Starter content is optional, select-before-install, Facility-owned after copy, and never auto-published.

---

## Product identity

The official Vssyl Department Product name is **Facility Plant Operations**.

| Use | Do not use |
|-----|------------|
| **Facility Plant Operations** as the Product name | Generic **Maintenance** as the Product name |
| **Maintenance** as a capability inside the Product (corrective work, PM, rounds) | Treating every form of maintenance as this Product |
| **Plant** / `PLANT` as the current installation key and internal registry key | Renaming persisted `Department.key` in this phase |
| **Facility** as the built environment this Product maintains | Assuming this Product is healthcare-only |

The word **Facility** is intentional. This Product represents maintenance of the **built facility environment**. It may apply to hospitals, long-term-care facilities, senior living, assisted living, hotels, resorts, schools, universities, campuses, office buildings, commercial facilities, and institutional/civic facilities.

It is **not** intended to define all forms of maintenance. Do not automatically treat these as the same Product:

- manufacturing maintenance
- fleet maintenance
- aircraft maintenance
- biomedical / clinical engineering
- utility infrastructure
- heavy industrial maintenance
- linear / GIS asset maintenance

Those domains may share future Vssyl Platform primitives. They are outside the current Product boundary.

**Installation identity (compatibility).** The code registry key remains `PLANT`. The facility Department installation key remains `PLANT`. A facility may locally name the Department Plant, Plant Operations, Facilities, or Maintenance without changing the Product identity. Registry display-name and industry-tag updates wait for a later implementation phase. Do not change release status.

---

## Canonical principle

Vssyl distinguishes:

```text
VSSYL PLATFORM
shared operating mechanisms

DEPARTMENT PRODUCT
Vssyl-authored domain operating model

FACILITY CONFIGURATION
the facility's local implementation

RUN
today's operational activity

HISTORY / AUDIT
historically correct operational truth

ADMIN / GOVERNANCE
products, entitlement, installation, access, billing
```

Facility Plant Operations must fit this model. It must **not** become another standalone CMMS inside Vssyl.

> **Vssyl Platform knows what the facility is. Facility Plant Operations knows how that facility is maintained.**

The Product contributes only the domain capabilities that exist specifically because a facility maintenance department needs them.

---

## Platform boundaries

Facility Plant Operations does **not** receive a second location tree, a second Asset registry, a second people system, a second Record engine, a second Procedure store, or a copied history ledger.

### Facility / Locations

There is one shared Vssyl Facility hierarchy:

```text
Facility
→ structural hierarchy
→ actionable locations
→ Rooms / Spaces
```

Do not propose `PlantLocation`, `MaintenanceLocation`, duplicate Plant rooms, or copied facility structures.

The Product may define Product-owned Location Functions only if Facility Plant Operations behavior genuinely needs them. Empty is allowed. Do not infer behavior from room names.

**MVP Location Functions:** none required. Optional later if published Work presets need a `functionKey`. Legacy Plant archetypes (`serviceable_space`, `mechanical_room`, and similar) are not Product Location Functions.

### Assets

There is one shared Platform Asset registry. Facility Plant Operations maintains those Assets. It does not create Plant-specific copies.

Do not propose `PlantAsset`, `MaintenanceAsset`, or `EquipmentAsset` separate from `Asset`.

Asset identity belongs to Platform. Potential shared Asset concepts include name, description, manufacturer, model, serial number, asset/facility tag, location, lifecycle state, operating condition, criticality, warranty, photos/documents, asset classification, eventual parent/child relationships, and eventual QR/barcode identity. Missing fields are Platform gaps, not permission to create Plant-owned copies.

### People

Technicians are Platform People (`Employee` / `User`). Do not create Technician identity records that duplicate People. The Product may later add Department-specific technician context such as skills/trades. That is NEXT, not MVP.

### Work

Use shared Work for recurring operational responsibilities such as:

- mechanical-room round
- exterior inspection
- daily generator observation
- maintenance-shop cleanup
- building walkthrough
- recurring operational rounds

Do **not** force maintenance Work Orders into generic Work if doing so corrupts the shared Work engine.

### Records

One shared Record engine. Manager forms are Reading, Checklist, Inspection, Acknowledgement, and On-demand Record. The forward fact is `OperationalEvidenceRecord`.

Facility Plant Operations uses shared Records for boiler readings, water temperatures, generator checks, mechanical-room inspections, roof inspections, life-safety checks, and equipment inspections.

Do not propose `PlantInspection`, `PlantReading`, `PlantLog`, or `MaintenanceChecklist` as new parallel engines. Legacy inspection models may exist; they are not the forward path.

### Procedures

Procedures are shared Vssyl knowledge. A Procedure explains **how work should be performed**. A Record is evidence of **what happened**. A Work Order or Work requirement represents **responsibility to perform something**. These remain distinct.

### History

Vssyl history is projected from authoritative source facts. Do not propose `PlantHistory`, `MaintenanceHistoryLedger`, or copied history tables.

Facility Plant Operations facts contribute to Asset History, Location History, Work History, Record History, and Audit / Review.

### Operational Cycles

Do not use Operational Cycles simply because maintenance repeats. Preventive Maintenance schedules are **not** Operational Cycles.

Facility Plant Operations has **zero required starter Operational Cycles**. A facility may optionally configure real operational windows such as morning plant round, evening mechanical round, or shift handoff. Do not invent cycles to represent PM.

---

## Domain objects

### Request

A **Request** means: someone is asking for maintenance attention. It is intake.

Possible sources: Dietary, Nursing, EVS, Security, Administration, Plant, or another Department/user.

A Request may capture requester, originating Department/context, Location, Asset if known, problem description, reported urgency, and attachment/photo where supported.

A Request may ultimately be accepted, declined, duplicate, or resolved without maintenance work.

### Issue

An **Issue** means: a known undesirable condition exists.

Examples: dishwasher not heating; sink leaking; emergency light failed; bearing abnormal; broken door; inspection failure.

Issue represents the **problem itself**. It may originate from a Request, technician observation, failed Record, inspection, preventive-maintenance finding, or corrective-action escalation.

An Issue may exist without a Work Order. An Issue may require multiple Work Orders before resolution. Asset is **not** required. An Issue can be location-based.

### Work Order

A **Work Order** means: Facility Plant Operations has accepted responsibility for defined maintenance work that can be prioritized, planned, assigned, performed, documented, and completed.

Examples: repair leaking faucet; restore dishwasher; replace motor; investigate electrical failure; replace belt; complete quarterly equipment service.

Canonical Work Order kinds for MVP:

- **CORRECTIVE**
- **PREVENTIVE**

A Work Order does **not** require a Request. A preventive Work Order may be generated directly from a PM Plan. An authorized Plant user may create a Work Order directly when the required maintenance action is already known.

---

## Relationship model

```text
                         VSSYL PLATFORM

Facility ─── Location
                │
                ├──────── Asset ─── Asset Status History
                │             │
Person ─────────┼─────────────┼───────────────┐
                │             │               │
Procedure ──────┼─────────────┼──────┐        │
                │             │      │        │
Shared Work ────┤                    │        │
                │                    │        │
Shared Record ──┴────────────────────┼────────┤
                                     │        │
Request ──────────────┐              │        │
                      ▼              ▼        │
                    Issue ◄───────────────────┘
                      │
                      │ accepted maintenance response
                      ▼

                FACILITY PLANT OPERATIONS

                     Work Order
                  /      |       \
               Asset  Location   Person
                 │       │         │
                 │       │         └─ Technician
                 │       │
                 │       └─ occurrence context
                 │
                 ├─ Procedure
                 ├─ Required Records
                 ├─ Parts used
                 ├─ Labor duration
                 ├─ Vendor / external cost
                 └─ Resolution


PM Plan
   │
   │ scheduled occurrence
   ▼
Preventive Work Order
```

Locked distinctions:

```text
Request ≠ Issue
Issue ≠ Work Order
Work Order ≠ generic Work
Record ≠ Work Order
Procedure ≠ Record
Asset status ≠ Work Order status
```

---

## Shared Work vs Work Order

### Shared Work

Use when the main question is: **was this recurring operational responsibility performed?**

Examples: mechanical-room round; inspect exterior doors; daily generator observation; maintenance-shop cleanup; general building walkthrough.

### Facility Plant Operations Work Order

Use when maintenance requires a richer persistent lifecycle.

Examples: repair leaking faucet; replace motor; restore dishwasher; investigate electrical failure; replace belt; perform scheduled preventive service.

A Work Order may need source, maintenance kind, priority, category, Issue relationship, Asset/Location context, assignment, Procedure, required Records, persistent state across days, diagnosis, parts used, labor duration, vendor/external cost, resolution, and PM relationship.

Do not expand shared Work into a CMMS engine merely to avoid a Work Order domain capability.

---

## Work Order target

### Identity

Work Order number/id, title, description, CORRECTIVE or PREVENTIVE, maintenance category.

### Source

Potentially: Request, Issue, PM Plan occurrence, technician, manager, failed Record, shared Work escalation.

### Target

Must support:

- Asset + Location
- Asset where location derives appropriately
- Location without Asset

Asset must **not** be required. Legitimate location-only work includes ceiling leak, drywall damage, faucet problem where the faucet is not registered, broken door, wall repair, and room electrical problem. Do not force every maintainable object to become an Asset.

### Priority

Work Order priority is authoritative Plant priority. Requester urgency is only an intake signal. Asset criticality is a separate shared Asset concept.

Target Work Order priority (do not implement in this documentation phase unless it already exists):

```text
ROUTINE
HIGH
URGENT
EMERGENCY
```

### Assignment

Use Platform People / Assignment wherever compatible.

### Procedure

May reference a versioned shared Procedure.

### Evidence

Required structured evidence uses shared Records.

### Execution / closeout

MVP target includes created, assigned, started, status changes, completed, resolution notes, labor duration, parts used, optional parts cost, optional Vendor/external cost, required Records, and resulting Asset condition review where applicable.

### Status

Prefer a small factual status model:

```text
OPEN
ASSIGNED
IN_PROGRESS
ON_HOLD
COMPLETED
CANCELED
```

ON_HOLD may have a reason such as waiting for part, waiting for vendor, waiting for access, scheduled later, or other. Do not proliferate status enums without operational necessity.

---

## Priority / urgency / criticality

| Concept | Meaning | Owner |
|---------|---------|-------|
| **Reported urgency** | Requester-provided intake signal | Request |
| **Work Order priority** | Authoritative Facility Plant Operations prioritization | Work Order |
| **Asset criticality** | Shared Asset property describing operational consequence of Asset failure | Platform Asset |

A critical Asset does not automatically make every Work Order Emergency. Do not add a fourth overlapping **Issue severity** concept unless a later audit proves a distinct need.

---

## Asset lifecycle vs condition

Target semantics (Platform-owned; do not implement in the Product layer):

**Lifecycle**

```text
ACTIVE
RETIRED
```

**Operating condition**

```text
OPERATIONAL
DEGRADED
OUT_OF_SERVICE
```

An ACTIVE Asset may be OUT_OF_SERVICE. A RETIRED Asset should no longer participate in active operation.

### Work Order completion does not equal recovery

Completing a Work Order does **not** automatically mark Asset OPERATIONAL, resolve Issue, or prove the underlying operation recovered.

Asset condition must remain an explicit fact. Issue resolution must remain an explicit fact.

---

## Preventive Maintenance Plan

A **Preventive Maintenance Plan** means: a published maintenance rule requiring specified maintenance against a specified target on a specified schedule using defined procedure/evidence expectations.

**MVP PM target:** a specific Asset.

**Future, not MVP:** Asset type/category targeting, location PM, meter/usage PM, grouped targets.

### MVP configuration

Name, description, maintenance category, active/retired, specific Asset, Procedure version, required Record templates, fixed calendar cadence, start/effective date, due date calculation, generation lead time, due tolerance/window, and priority/default assignment where applicable.

### Cadence

MVP uses **fixed scheduled cadence**. Example: Quarterly PM in January, April, July, October. If April PM is completed late, July does **not** shift. Completion-relative scheduling is future functionality.

### Runtime target

```text
Published PM Plan Version
        │
        │ schedule approaches
        ▼
PM Due Occurrence
        │
        ▼
Preventive Work Order
        │
        ├─ Asset
        ├─ Location
        ├─ Procedure Version
        ├─ Required Records
        ├─ Priority
        ├─ Assignment
        └─ Due window
```

Generation must eventually be deterministic and idempotent. A single PM occurrence must not create duplicate Work Orders. Missed PM must remain historically visible.

---

## Cost capture (MVP)

MVP includes basic maintenance cost facts. Do not build payroll, inventory, or procurement/AP.

**Labor.** Assigned technician, started/completed times, labor duration. Do not configure technician pay rates in this Product.

**Parts.** Part description, quantity, optional part number, optional cost. Do not build inventory yet.

**External service.** Vendor, optional external cost.

---

## Department Product blueprint

This Product fills the contract in [13 — Department Product](./13_DEPARTMENT_PRODUCT.md).

| Contract item | Facility Plant Operations |
|---------------|---------------------------|
| **Purpose** | Maintain the built facility environment: intake of maintenance attention, known undesirable conditions, corrective and preventive Work Orders, and calendar PM against specific Assets |
| **Location Functions** | None required. Empty is allowed. Optional later if Work presets need a `functionKey` |
| **Operating Rhythm** | Zero required starter Operational Cycles. Optional facility-configured windows are allowed. PM is not a Cycle |
| **Work presets** | Optional generic recurring-Work starter pack. Never required. Never auto-published. Facility-owned after install |
| **People / coverage needs** | Shared People, Department membership, and operational assignment roles. Technician is a Person, not a second identity |
| **Record definitions** | Shared Record forms: Reading, Checklist, Inspection, Acknowledgement, On-demand Record. No Plant-owned Record engine |
| **Assets used** | Shared Platform Asset registry. The Product maintains those Assets; it does not copy them |
| **Issues / exception rules** | Canonical Issue is the known undesirable condition. Request is intake. Work Order is accepted maintenance response. Completing work does not auto-resolve the Issue or restore Asset condition |
| **Domain-specific capabilities** | Work Order, Preventive Maintenance Plan, maintenance category, maintenance triage, maintenance closeout, maintenance-specific cost/parts/labor facts |
| **Run requirements** | Plant Manager view, technician view, requester-safe status, repair/request queues, Asset condition, due/overdue PM once implemented |
| **Historical / Audit questions** | Asset maintenance chronology, Location maintenance chronology, Issue history, Work Order history, PM history — projected from source facts, not a Plant ledger |
| **Starter content** | Optional **Plant Operations starter configuration**. Select-before-install. Facility-owned copies. Nothing auto-publishes. Nothing claims regulatory compliance. No fake Assets. No generic safety Procedures. PM cadence presets use real Assets |
| **Facility-configurable values** | Room bindings, people, local labels, optional cycles, published Work Plans, PM plans, Vendor contacts |
| **Platform-gap test** | See below. Missing reusable Asset/Issue/Request/Procedure/history behavior is Platform. Work Order and PM Plan are Product |

### Platform-gap test

Would multiple Department Products reasonably need this capability? If yes, strongly consider Platform ownership. If it exists only because a facility maintenance department needs it, it may belong to Facility Plant Operations.

**Likely Platform:** Asset lifecycle vs condition; Asset manufacturer/model/serial/tag completeness; Asset classification; parent/child Assets (NEXT); QR/barcode (NEXT); generic Issue; generic Request intake; attachment behavior; Vendor identity; persistent Asset Meter (LATER).

**Likely Product:** Work Order; PM Plan; maintenance category; maintenance triage; maintenance closeout; maintenance-specific cost/parts/labor facts.

---

## Starter pack (implemented, optional)

**Plant Operations starter configuration** is an optional Manager+ action from Build → Facility Plant Operations → Overview. It is not auto-launched and is not installed when the Product is installed.

Rules that remain binding:

- Optional examples to help a Facility get started — not a compliance pack
- Review/select before install; sensible defaults may be checked
- Facility-owned copies after install; Vssyl does not silently overwrite later
- Idempotent: do not duplicate and do not overwrite
- Never auto-published
- Never presented as regulatory compliance
- No fake Assets, rooms, employees, or Vendors
- No generic Lockout/Tagout, safety, or regulatory Procedures
- No persisted Preventive Maintenance Plans from starter install

**Recurring Work presets** (shared Work Plan drafts): Mechanical Room Round; Building Walkthrough; Exterior / Grounds Walkthrough; Generator Visual Check.

**Record templates** (canonical `OperationalTemplate` drafts): Equipment Condition Inspection; Mechanical Room Inspection; Generator Inspection; Basic Equipment Reading; Post-Work Order Verification.

**PM cadence presets** are UI-only in the existing PM Plan editor: Monthly (1), Quarterly (3), Semiannual (6), Annual (12), with `generationLeadDays = 7` and Routine priority. The user must select a real Facility Asset and review the Plan before save/publish. Presets are not manufacturer recommendations.

---

## MVP / NEXT / LATER

### MVP

- Cross-Department maintenance Requests
- Request triage
- Issues
- Corrective Work Orders
- Preventive Work Orders
- Calendar PM Plans
- Specific-Asset PM targets
- Fixed PM cadence
- Due/overdue PM
- Plant Manager view
- Technician view
- Requester-safe status
- Shared Work integration
- Shared Record integration
- Shared Procedures
- Assignments
- Maintenance priority
- Maintenance category
- Asset condition integration
- Explicit return to service
- Attachments using shared mechanisms
- Labor duration
- Simple parts-used capture
- Optional parts cost
- Vendor/external service capture
- Optional Vendor cost
- Asset history
- Location history
- Auditability

### NEXT

Do not implement during current MVP foundation unless a hard dependency is discovered:

- Normalized Asset category/subcategory
- Parent/child Asset hierarchy
- QR/barcode
- Asset meters
- Meter/usage-based PM
- Asset-type PM targeting
- Parts catalog
- Inventory
- Reorder points
- Vendor contracts
- Warranty workflows
- Technician trades/skills
- Advanced labor analytics
- Failure/cause/remedy taxonomy
- Downtime analytics
- Maintenance cost analytics
- SLA/response targets
- Notifications/escalations

### LATER

- Condition/predictive maintenance
- IoT/sensor triggers
- MTBF/MTTR
- Advanced RCM/FMEA
- Sophisticated inventory/procurement
- Capital planning
- Replacement forecasting
- Enterprise portfolio analytics

---

## Future commercial extensibility

Do not implement billing/tiering now. The architecture should merely avoid preventing a future distinction such as:

```text
Facility Plant Operations — Core
Facility Plant Operations — Advanced
```

Core must remain operationally complete. Advanced pricing should eventually correspond to genuine additional maintenance capability rather than arbitrary usage limits.

Customer visibility still requires an explicit `PLANT` `DEVELOPMENT → AVAILABLE` registry change after certification and commercial configuration.

---

## Documentation authority

| Class | Document |
|-------|----------|
| **CURRENT CANONICAL** | This file |
| **SUPPORTING** | [Facility Plant Operations reconciliation (2026-10-06)](../plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-06.md) — current architecture after Phase 5B |
| **HISTORICAL SUPPORTING** | [Facility Plant Operations reconciliation (2026-10-05)](../plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md) — Phase 0/1 repository audit |
| **BINDING PLATFORM CONTRACT** | [13 — Department Product](./13_DEPARTMENT_PRODUCT.md) |
| **PLATFORM MAP** | [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md) |
| **HISTORICAL / SUPERSEDED for Product architecture** | Phase 12A Plant reference guides under `docs/plant/` |

Phase 12A proved that shared rails can carry request intake, triage, and explicit work on `Repair`. That reference implementation is not this Product architecture. Where Phase 12A conflicts with this document, this document wins.
