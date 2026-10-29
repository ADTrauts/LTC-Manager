# Platform Primitives & Engines Registry

**Status:** Architecture companion and reuse registry. Not the architecture authority.  
**Date:** October 29, 2026  
**Consult this before** adding a model, a source-of-truth table, a service, a resolver, an engine, a major reusable workflow, a major UI subsystem, a catalog or store, or a people, location, or work mechanism.

[01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md) remains the architecture authority. Its [current foundation](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026) (October 26, 2026) and the [Foundation amendment](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026) (October 20, 2026) win when an older paragraph disagrees, including an older paragraph in this file.

This registry answers a narrower question: **what Vssyl already owns, and how new work must reuse or extend that owner.** If this registry conflicts with the Constitution, the Constitution wins.

| Document | What it owns |
|----------|----------------|
| [01 — Product Constitution](./01_PRODUCT_CONSTITUTION.md) | The platform map and the plug-in contract |
| [03 — Domain Model](./03_PRODUCT_DOMAIN_MODEL.md) | Business relationships and [sources of truth](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) |
| [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md) | User-facing terminology |
| [13 — Department Product](./13_DEPARTMENT_PRODUCT.md) | The Department Product plug-in contract and [how to build one](./13_DEPARTMENT_PRODUCT.md#how-to-build-one) |
| [14 — Facility Plant Operations](./14_FACILITY_PLANT_OPERATIONS.md) | How Facility Plant Operations specializes shared Platform mechanisms |
| This registry | The reusable ownership map and the extend-before-inventing guardrail |

A Department Product, including Facility Plant Operations, may specialize behavior. It cannot redefine who owns a shared Platform fact.

> **Extend before inventing.**

```text
REUSE
  ↓
EXTEND
  ↓
COMPOSE
  ↓
ONLY THEN CONSIDER INVENTING
```

No new engine should begin life as a UI convenience.

---

## Purpose

Vssyl is architecturally mature enough that the greater risk is duplicate ownership.

The platform already has one physical facility tree, one people model, one Operational Cycle engine, one Records engine, one shared Asset registry, one Catalog, one "my work" composition, and one supervisor home. A feature that adds a second copy of any of those makes later work lie about what is true.

This registry exists so an engineer or agent can answer, before designing storage:

- What already exists?
- Who owns the fact?
- Who owns the lifecycle?
- What may be composed?
- What may be extended?
- What must stay singular?
- What stays invisible as implementation detail?

Duplicate ownership looks like another location tree, another employee identity, another assignment concept, another log engine, another inspection engine, another asset registry, another readiness calculation, another history store, another "my work" store, another Catalog, or another resolver for what is happening now.

---

## Core architecture rules

### Rule 1 — Name the layer first

A new feature belongs to a layer that already exists:

| Layer | What it is |
|-------|------------|
| **Platform** | Reusable operating mechanisms every facility gets |
| **Department Product** | A Vssyl-authored operating model installed into a facility |
| **Marketplace item** | Ready-made content added inside one Department |
| **Facility configuration** | The facility's rooms, times, people, published plans, and installed Departments |
| **Run** | What is true in the current operation |
| **History / Audit** | Expected versus actual for a service date, from the configuration effective that day |
| **Governance** | Organization, access, licensing, and permissions |

A new layer is a major change. It stops for a product-owner decision. See [How a new part plugs in](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026).

### Rule 2 — Find the owner before creating storage

Before adding a Prisma model, a database table, a service, a resolver, a state store, an API, a major hook, or a page-specific cache, name the canonical owner of the fact or lifecycle.

When an existing owner matches, extend it. A new fact also gets a row in the [Domain Model](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) and a word in the [Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md).

### Rule 3 — A screen composes sources

A screen may show several canonical sources together. It does not create a shadow store because one query would be easier.

### Rule 4 — Department Products consume Platform mechanisms

Food and Nutrition, Environmental Services, Facility Plant Operations, and future Department Products use the shared mechanisms: the building, Location Functions, Operational Cycles, Work, Records, Assets and repairs, shifts, daily Assignments, and Job Flow.

A Product may define its own defaults, Location Functions, Work presets, Records forms, Operating Rhythm starters, coverage needs, domain-specific behavior, and Dashboard contributions.

A Product does not receive its own location engine, employee engine, Cycle engine, Records engine, Assignment engine, Work engine, history store, or Catalog unless an explicit architecture decision changes the Constitution. Empty starters are allowed. A missing reusable mechanism is written down in the blueprint's platform-gap test before any new engine is discussed. The Product contributes Dashboard capabilities. It does not ship dashboard UI. See the [Department Dashboard Contract](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md).

### Rule 5 — Composition is allowed; ownership merging is not

One UI may show many owners. Job Flow can show the current Assignment, the current Cycle and Phase, Expected Work, Records due, and assigned Work Orders or preventive maintenance. Job Flow does not persist those in a combined "MyWorkItem" table.

### Rule 6 — UI consumes domain truth

The UI does not independently recalculate authorization, eligibility, readiness, the current Cycle, coverage, due state, a Record requirement, or Work applicability when a canonical resolver or domain already owns that answer.

### Rule 7 — Product terminology stays separate from implementation terminology

Internal names may remain in code. User-facing UI and manager documentation follow the [Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md).

| Internal | Manager language |
|----------|------------------|
| `OperationalEvidenceRecord` | Records |
| `Repair` | Work Order |
| `Unit` | Location, where the UI means the place of work |
| internal `blocked` | Needs Attention |
| `DepartmentRoomArchetype.key` | Location Function |
| `/reports`, internal Review | Audit / Reports |
| `KEY_TIME` | Key Point |

Frontline users do not see query scopes, resolver names, engine names, persistence names, or projection internals.

### Rule 8 — History is derived from historically effective truth

Audit / Reports answers expected versus actual from the configuration effective on that service date, the canonical source facts, and the corrections, waivers, and audit semantics of the domain that owns them.

There is no central history ledger. Log Book is submitted Records. Asset History is source facts about an Asset. Location History is source facts about a place.

### Rule 9 — Authorization remains server authority

A visible route, a Department lens, a Dashboard card, and a navigation item are not permission. UI may narrow presentation. UI may not broaden authority. A new Department write is classified in `src/lib/department-authority/write-manifest.ts`. A role check alone is not authority.

### Rule 10 — A new engine needs an explicit justification

A new engine or reusable primitive is permitted only when all of the following are true:

1. No current owner coherently fits.
2. Composition is insufficient.
3. The missing reusable mechanism is documented.
4. Its source of truth is defined.
5. Its non-responsibilities are defined.
6. Its relationship to existing engines is defined.
7. Product-owner architecture approval is obtained when the change adds an engine, replaces a layer, changes who runs a Department, changes a home, or changes what the Marketplace or Vssyl Console is.

Use the [proposal template](#template-for-proposing-a-new-engine) below. A small addition that extends an existing owner is not a major change.

---

## Platform Domains are classification only

The sections below group primitives so an engineer can find an owner. They are wayfinding.

> Platform Domains help engineers locate an owner. They do not own data merely because an engine is grouped beneath them.

A Platform Domain is not a new engine, module, navigation destination, database namespace, Department Product, architecture layer, or source of truth.

```text
                         VSSYL PLATFORM
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
 CONTEXT / CONFIG         OPERATING MECHANISMS       GOVERNANCE
 Facility                 Cycles                    Identity
 Locations                Work                      Access
 Location Functions       Records                   Authority
 Department install       People / Coverage         Entitlement
 Catalog                  Assets / Maintenance      Publication
                          Readiness / Recovery      History rules
        │                       │                        │
        └───────────────────────┼────────────────────────┘
                                │
                      DEPARTMENT PRODUCT
                                │
                    FACILITY CONFIGURATION
                                │
                                ▼
                               RUN
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
         Dashboard           Job Flow          Locations
         awareness           my work           place context
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ▼
                         AUDIT / REPORTS
```

The diagram is conceptual. It does not name new code modules.

### Navigation is not the same grouping

Platform Domains do not have to match application navigation.

RUN may show one **Maintenance** item with Assets, Repairs / Work Orders, and Vendors. That grouping is navigation. It does not make Maintenance one source-of-truth engine. Assets, Requests, Issues, Work Orders, Preventive Maintenance, and Vendors keep the owners in this registry. Facility Plant Operations is the Department Product. Generic **Maintenance** is not the Product name.

**People & Coverage** may group workforce experiences in Department Builder and on the floor. That grouping does not collapse User, Employee, Shift, Assignment, and Coverage into one model.

### Why this bucket is People & Coverage

The operational bucket is **People & Coverage**.

Vssyl owns operational workforce concerns: the facility Employee, the schedule and Shift, call-off, the daily Assignment, coverage, and workplace PIN.

That is not payroll, benefits, recruiting, compensation, performance management, employee relations, or a full HRIS. [07 — Product Boundaries](./07_PRODUCT_BOUNDARIES.md) keeps those outside the product. Small adjacent workforce records, where they exist, do not rename this domain to HR.

---

## Platform Domain A — Context & Configuration

There is one physical facility tree. Facility Builder owns the hierarchy, the physical room type, and physical names.

```text
Facility
  → structural Units
  → neighborhoods / operational Units
  → Rooms / Spaces (UnitSpace)
```

A Department never receives a second copy of rooms. `DepartmentLocation`, `PlantLocation`, and any other physical identity created to simplify a filter are forbidden. Location Function gives a Department meaning to an existing room. It is not another room. The same physical room may carry different functions for different Departments. Food and Nutrition `food_service_area` and Environmental Services `service_support` on the same room are independent.

Runtime matches `functionKey` on the ACTIVE profile. Build reads the working profile. Audit reads the profile effective on the service date. An empty binding set matches no rooms. Department responsibility does not imply Cycle participation.

The Department Product registry is Vssyl-owned code (`src/lib/department-products/`). A Department is the facility's installed instance. The Product name and the local Department name are different facts. Installation keys such as `DIETARY` and `PLANT` are compatibility identity, not a second Product.

Marketplace items run on Platform engines. Today only Records forms are Catalog items (`CatalogLogDefinition`). Work presets and Operating Rhythm starters still ship in code with their Product. Menu templates are not built. Moving those kinds into the Marketplace reuses this Catalog.

**Menu** is a Food and Nutrition Department-owned record: identity plus content. Applicability is explicit Department locations and root Operational Cycle stable keys mapped to a Menu period. Menu rotation is not Cycle timing. Runtime resolution is `resolveApplicableMenus`. A Menu is not a facility singleton, a Record, or Work.

**Operational scope** (internal Projection) is a read-only derivation of which existing physical places are relevant to a facility, a Department lens, and a principal. It keeps Facility Builder identities. The older Experience catalog, Operational Areas, and Operations Engine described in [the Operational Projection Constitution](../operational-projection/01_OPERATIONAL_PROJECTION_CONSTITUTION.md) are superseded. See [Current architecture reconciliation](#current-architecture-reconciliation).

---

## Platform Domain B — Operating Rhythm & Work

An **Operational Cycle** is the root recurring window. A **Phase** is one interval inside that Cycle. A **Key Point** is an instant on the Cycle. Occurrence tracking is NONE, OPTIONAL, or REQUIRED. Cycles may overlap and may cross midnight. Phases may overlap and may leave gaps.

The published Operational Cycle and Phase are the only answer to "what is happening now." No published Cycle means no window. The system does not guess from meal times. The shift and the Assignment answer "am I on, and where."

A Key Point is not a Work item, not a Record, and not a second milestone engine. Food and Nutrition timing uses Key Points only. Meal Due is tracking NONE. Ready and Service Started are tracking REQUIRED at LOCATION grain. The canonical actual is `OperationalCycleKeyPointActual`. A service date has one authoritative timing source. Preventive Maintenance is not an Operational Cycle.

**Work** is: Product preset → facility Work Plan → publish → derived Expected Work → optional Assignment of a person → sparse occurrence. A published Work Plan (`DepartmentWorkPlan` and its items) defines expected shared Work. Expected Work is derived from department-responsible locations, then applicability (including a Location Function key when the plan uses one), then Cycle participation when the item is cycle-bound. An empty Cycle binding means the item is not configured. Work may bind to a Cycle or a Phase stable key. It does not bind to Key Points.

Assignment does not create Work. Shift does not create Work. Cycle participation does not create Work unless those applicability rules say the item applies. Occurrences stay sparse (`DepartmentWorkOccurrence`).

**Job Flow** is the "my work" view in every installed Department. It shows the Assignment, the current window, what is expected now and next, Work Plan items, Records due, and assigned work orders and preventive maintenance, with one next action. It stores nothing. Each source keeps its own store and lifecycle. Plant work orders never become Work Plan items. Without an Assignment, a person sees the Work for the place they are signed into. An empty Assignment plan never hides Work.

---

## Platform Domain C — People & Coverage

These facts stay separate. They are not one staffing record.

| Fact | Question it answers |
|------|---------------------|
| **User** | Who is this person in Vssyl? |
| **Employee** | What is this person's workforce record at this facility? |
| **Shift** | Who works, for which Department, and when? |
| **Assignment** | Where do they work today, and what do they cover? |
| **Coverage** | Is the needed responsibility adequately covered? |
| **PIN** | How does this Employee sign in at a unit? |

A **User** is the global person. One identity, many places they can enter. Email identifies that person and is not issued again. The account remains when they leave a facility, hold only partner access, or have nowhere to enter.

An **Employee** is that person's workforce record at one facility. At most one Employee per User per facility. New Employees are account-backed. Employee first and last name are facility workforce facts. `User.displayName` is global presentation.

A **Shift** is `ScheduleEntry`, drawn from a `WorkShift` pattern. A call-off marks that Shift (`calledOffAt` / `callOffReason`). A call-off is not a call-down, and it is not a move. Legacy `ScheduleEntry.unitId` is not where the person works today.

An **Assignment** is the daily `OperationalAssignment`. A move changes the Assignment. Shift and Assignment never create each other. The person assigned to a Work Order (`Repair.assignedEmployeeId`) is a maintenance assignment on that Work Order, not this daily Assignment. **Client assignment** is Organization-governed partner Facility access. It is not `OperationalAssignment` and not a second placement engine.

**Coverage** is derived. Build holds the need the Department configured. Run answers who filled it, from Shifts, call-offs, and Assignments. Coverage does not rewrite the Shift into a placement, and it does not store a parallel attendance record.

---

## Platform Domain D — Records & Assurance

There is one forward Records engine. Reading, Checklist, Inspection, Acknowledgement, and On-demand Record are forms in that engine. Inspection is a Catalog purpose and a Record form. It is not a second evidence engine.

```text
CatalogLogDefinition
  → FacilityCatalogInstall
  → LogAttachment
  → derived expected requirement / slot
  → OperationalEvidenceRecord
```

`CatalogLogDefinition` is the product definition, Vssyl-published or owned by a facility or an operating organization under the same Catalog. `FacilityCatalogInstall` is the facility's adoption reference. It is not a field copy and not an `OperationalTemplate` clone. `LogAttachment` is the live facility requirement: target, timing, local overlay, and pinned Catalog version. Expected slots are derived (`resolveLogRequirementsForAttachment`). The submitted fact is `OperationalEvidenceRecord`.

Missing expected Records are derived. A waiver is excused work, not a completed Record, unless evidence was also submitted. Evidence wins. A correction does not turn a failed audit into a pass and does not rescore an earlier submission. Follow-up evidence uses `followsRecordId`. A recheck is another canonical Record on the originating attachment. It uses the originating snapshot's Catalog version and does not satisfy another scheduled slot. Corrective action stays on the Record. There is no Finding entity: a failed question stays on the evidence record. Completed evidence stays completed when it is out of standard. Overdue means the window has passed and the service date is still open. Missed means that service date has closed with no evidence and no waiver. Presentation layers do not redefine completed, missed, overdue, or waived.

`CANONICAL_LOGS_ENABLED` is a code flag for whether new work uses this chain. It is not a second record store and not a Department capability switch. The rollout table was dropped in LEG-06. With the flag off, new work stays off this chain. Historical log submissions were not copied into canonical Records.

Manager language is **Records**. "Evidence" stays internal. Due Logs answer what must be recorded now. **Log Book** is a projection over submitted Records. **Audit / Reports** is the derived expected-versus-actual layer. Neither is a submitted-evidence store. Review is not a workspace. The route may remain `/reports`.

Procedures are knowledge. They are not Records.

A new Record type extends this engine. An Environmental Services log, a Dietary log, a Plant inspection, and a compliance packet are forms, attachments, or projections on this chain. They are not new engines. Formal PDF, Excel, and CSV packets are projections of the same evidence and the derived requirements.

---

## Platform Domain E — Assets & Maintenance

There is one shared Platform Asset. It is not a `PlantAsset`, `DietaryAsset`, `EVSAsset`, or `MaintenanceAsset`.

Departments use the same Asset. Plant may maintain it. Dietary may operate it. A vendor may own title to it. The facility may own title to it. Those are relationships on the shared Asset. Identity is not copied.

| Relationship | What it is |
|--------------|------------|
| **Title** | The facility, or the company operating that Department. Existing equipment stays facility-titled. Only the company operating that Department can title an asset to itself. |
| **Maintainer** | Who runs and pays for repairs. Separate from title. |
| **Repair vendor** | The company called to fix that equipment. Not the operating partner, and not a vendor-run Department. |
| **Lifecycle** | Registry participation, such as active or retired. |
| **Condition** | Observed operating condition, such as operational, degraded, or out of service. |

An active Asset may be out of service. A retired Asset leaves active operation. Completing a Work Order does not by itself mark the Asset operational, resolve an Issue, or prove the operation recovered. Condition and Issue resolution stay explicit facts.

When a contract ends, facility-titled equipment stays. Partner-titled equipment leaves. The facility keeps an `AssetPresenceNote`: a closed note of what left. That note is not an active Asset.

While equipment is on site, the using Department, Plant, and the Facility Administrator can see it, including title.

**Preventive Maintenance Plan** and **Work Order** are Facility Plant Operations domain capabilities that sit on this shared Asset, on shared People, and on shared Records. Classifying them in this bucket does not turn them into shared Work and does not give Plant a private asset registry. A PM Plan is a published maintenance rule for a specified target on a fixed cadence. MVP target is a specific Asset. Fixed cadence does not slide when a visit is late. PM is not an Operational Cycle. Generation of a preventive Work Order is deterministic: one occurrence does not create two Work Orders. Missed PM stays historically visible.

A **Request** (`OperationalRequest`) is intake: someone is asking for maintenance attention. It may be accepted, declined, marked duplicate, or closed without maintenance work. Reported urgency is an intake signal.

An **Asset Issue** (`AssetIssue`) is the current store for a known undesirable condition in this maintenance loop. The schema treats the Asset as optional and the location as required; a location-only condition is allowed. The [Domain Model](./03_PRODUCT_DOMAIN_MODEL.md) still says the row is asset-required. That sentence is stale against the schema. The row is still maintenance-shaped: it carries maintenance priority, equipment impact, and the relationship to Work Orders. It is not a Request and not a Work Order. See [Domain F](#platform-domain-f--issues-readiness--recovery) before using it for a problem that is not this condition.

A **Work Order** is accepted Facility Plant Operations maintenance work. Persistence is `Repair`. Kinds in the Product architecture are corrective and preventive. A Work Order may target an Asset, a location, or both. Asset is not required on the Work Order. Shared recurring rounds stay on the Work Plan. A Work Order does not become a Work Plan item because Job Flow shows both.

Work Order priority, reported urgency, and Asset criticality are three facts. A critical Asset does not make every Work Order an emergency.

Required documentation on a Work Order or a PM Plan is a shared Record pinned to a published Catalog form, satisfied by an `OperationalEvidenceRecord`. It is not an Operational Template.

---

## Platform Domain F — Issues, Readiness & Recovery

Operational problems are broader than maintenance.

A maintenance Request, an Asset Issue, a Work Order, and preventive maintenance belong to Domain E. They are how the facility handles equipment and built-environment repair.

Other problems already have owners:

| Problem | Owner today |
|---------|-------------|
| Staffing gap, unfilled call-off | Coverage, derived from Shifts, call-offs, and Assignments |
| Missed, overdue, or waived Record | Records occurrence, derived from the requirement, the submission, and waiver state |
| Late or missed Key Point | Operational Cycle Key Point actual |
| Food-safety or inspection failure | The submitted Record and its derived outcome |
| Asset down or degraded | Asset condition, and an Asset Issue when that condition is the maintenance problem |
| Work not performed | Sparse Work occurrence, or the Work Order lifecycle when the work is maintenance |

Readiness and the Dashboard may show any of those. Showing them together does not make them one Issue, and it does not make recovery a Work Order.

**Readiness** is the derived place answer: Ready, In Progress, or Needs Attention. **Runtime Location State** is the place-centric composition that produces that answer for Locations, the location workspace, and Dashboard attention. It persists nothing. It reads the published Cycle, coverage, Records, and related place signals. It does not own those facts. It does not own "what is happening now"; the published Cycle and Phase do. It is not a health score. UI copy uses Needs Attention. Internal `blocked` stays internal.

**Dashboard** is the home for Supervisors and above (`/dashboard`). It composes attention from existing owners through one attention contract. It stores no operational facts. A saved `DashboardLayout` is personal or facility chrome: which cards appear, and how large. Eligibility is re-derived on every render. A saved layout cannot widen what the viewer may see. Cards are platform-owned. A Department Product contributes capabilities, never dashboard screens. `/workspace` and `/today` open the Dashboard. They are not peer homes.

**Job Flow** remains the frontline composition. A new home is not created because a screen shows several engines.

Corrective action and follow-up on a Record stay on the Records engine. A supervisor may open an Asset Issue from eligible asset evidence. That escalation does not move the Record's lifecycle into the Issue.

### What is not yet a universal Issue engine

The product idea of an operational problem includes a broken asset, a staffing failure, a missed required Record, a service failure, an EVS failure, a food-safety concern, a missing resource, a room that is not ready, a policy exception, or a workflow disruption.

`AssetIssue` does not currently own that whole list. The schema comment calls it the canonical Issue store for the known undesirable condition it persists, including a location-only condition. Widening that table by rebranding, or adding a second issue table beside it, is an architecture decision. This registry does not make that decision. See [Unresolved ownership questions](#unresolved-ownership-questions).

Until that decision, a non-maintenance problem stays with the owner in the table above and may be composed into Readiness or the Dashboard.

---

## Platform Domain G — Knowledge & Intelligence

Knowledge attaches to work context: a place, an Asset, a Work item, or a Record definition. It is not a detached intranet.

A **Knowledge article** (`KnowledgeArticle`, with a published `KnowledgeArticleVersion`) is the shared store. A Procedure is how work should be performed. A Record is what happened. A Work item or Work Order is the responsibility to perform something. Those stay distinct. Plant and other Departments reference a versioned Procedure. They do not get a private procedure store.

**AI** is assistive. Morning Brief and similar moments compress canonical, authorized state the user can already reach. AI is not a source of truth, not authority, not the readiness engine, not the schedule engine, not a Work creator, not an urgency inventor, and not an eligibility resolver. It does not invent due times. It consumes Projection-or-scope and domain answers. It does not build an independent room context, and it is not a second operating system beside the Platform.

Analytics and continuous improvement read Audit / Reports and the source facts those reports already use. There is no analytics warehouse that owns operational truth, and the Dashboard is not a BI home.

---

## Platform Domain H — Governance & Platform Services

These states answer different questions. They stay distinct.

| State | Question |
|-------|----------|
| Applicable | Is this Product designed for this kind of facility? Catalog metadata. It does not grant access. |
| AVAILABLE | May customers see, buy, and newly install this Department Product? |
| Entitled | Has this facility purchased it? `FacilityDepartmentEntitlement`. |
| Installed | Does a `Department` row exist? |
| Enabled | Is `Department.isActive` true, so the Department is admitted to shared operations? |
| Configured | Have the facility's rooms, rhythm, plans, people, and Records been set? Derived. Not a status column on Department. |
| Published | Has the facility made a draft the ACTIVE profile, Cycle, or Work Plan? |
| Ready | Is the place operationally Ready right now? A Readiness answer. |
| Authorized | May this principal do this in the current context? Server authority. |

An installed Department receives the capabilities its Product includes. When billing enforcement is on, the license must also be valid. Department capability switches were retired ([LEG-D20](../legacy-retirement/DECISIONS.md#leg-d20--department-capabilities-come-with-the-installed-department--accepted-user-october-20-2026)). Do not add a new one. Release status still hides DEVELOPMENT Products from customers. `CANONICAL_LOGS_ENABLED` remains a code flag for the Records path only.

**Workspace** is where the User is operating: Internal Facility, Organization, or Partner Facility. Run, Build, and Admin are modes inside an authorized Facility context. A Department is a lens, not a Workspace. My Account and My Access are global User surfaces. Vssyl Console is Vssyl's own desk, not a customer workspace.

Available contexts come from `listAvailableContexts`. The list is not authority. `enterContext` live-revalidates and mints the session. Organization membership grants no facility access. Portfolio visibility is not facility authority. Internal and partner contexts at the same facility stay separate.

Facility role authority for the selected grant is the current `UserFacilityRolePeriod`. `User.roleId` is a compatibility home default. `Employee.roleType` is workforce classification for PIN. They are not substitutes for each other.

Self-operated and vendor-run are derived from the operating Organization (`DepartmentOperatorRelationship`). They are not a stored switch. The operator of a vendor-run Department controls that Department and owns that period's data. The Facility Administrator sees a summary plus compliance Records.

Parent Organization, Operating Organization, Partner Organization, repair vendor, and vendor account stay apart. Words for them are in the [current foundation](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026).

Publication and effective dating belong to the domain that publishes: Cycles, Work Plans, Catalog versions, and operator periods. A later Catalog version does not reinterpret an earlier Record. Audit reads the profile and requirement effective on the requested service date.

Some maintenance rows store capture metadata (`recordedOnline`, `synchronizedAt`). The shell can show a connectivity indicator, and sign-out can clear a device cache. That cache and that metadata are not a platform sync engine, not a second Issue store, and not the history ledger. A general offline store of operational truth would be a new engine and needs the proposal template.

---

## Detailed registry

Each row is an owner or a composition. **Type** is one of: Primitive, Engine, Resolver, Catalog, Projection, Composition, Governance, Domain.

Domain in the first column is wayfinding only.

### A — Context & Configuration

| Platform Domain | Primitive / Engine | Type | Owns | Explicitly does not own | Primary consumers | User-facing? | Reuse / extension rule | Canonical sources |
|-----------------|-------------------|------|------|-------------------------|-------------------|--------------|------------------------|-------------------|
| A | Facility | Primitive | The operational site: timezone, tenancy boundary, physical tree root | Departments, people, Assets, what is happening now | Every engine, Console provisioning, onboarding | Yes | Extend Facility. Do not add a Site aggregate or a second tenancy root. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms), [03](./03_PRODUCT_DOMAIN_MODEL.md) |
| A | Physical location tree | Primitive | Facility → Unit → UnitSpace identity, physical names, physical room type | Department meaning, Cycle participation, readiness, Work | Facility Builder, Location Function binding, Run locations, Assets | Partially. UI says Location for the section and Room / Space for `UnitSpace`. | Bind functions and plans to existing ids. Never copy a room per Department. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms), [08](./08_PRODUCT_LANGUAGE_GUIDE.md) |
| A | Location Function | Primitive | Product `functionKey` and label, bound by the facility to an existing room on the Department profile. Persistence: `DepartmentRoomArchetype.key`. | The room, physical type, a label slug, another Department's function on that room | Cycles, Work applicability, Records targeting, Run | Yes. The word is Location Function. | Add a Product key in the blueprint. Bind it to rooms the facility already has. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms), [13](./13_DEPARTMENT_PRODUCT.md) |
| A | Department Product registry | Catalog | Vssyl-authored Product identity, release status, industry and facility-type applicability, starter declarations | Entitlement, installation, local names, customer-editable rows | Marketplace, install, Dashboard capability derivation | Yes, as the Product name | Add a DEVELOPMENT registry entry and fill the blueprint. Do not add a second product catalog. | [13](./13_DEPARTMENT_PRODUCT.md) |
| A | Department installation | Primitive | The facility's installed instance (`Department`), including local name and `Department.key` | Product identity, license, readiness, configuration-complete | Build, Run lens, authority | Yes | Install idempotently through the Product path. Do not mint a second Food and Nutrition Department. | [13](./13_DEPARTMENT_PRODUCT.md#sources-of-truth) |
| A | Department operator relationship | Governance | Who runs one Department for a date-effective period (`DepartmentOperatorRelationship`) | Parent Organization, partnership, repair vendor, a stored self-operated switch | Vendor-run authority, data ownership, Asset title rules | Yes, as vendor-run or the operating company | Record an operator that already exists. Derive self-operated vs vendor-run. | [01](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026), [03](./03_PRODUCT_DOMAIN_MODEL.md) |
| A | Catalog / Marketplace | Catalog | Shared definitions for Records forms today; the same Catalog is the future home for Work presets, rhythm starters, and Menu templates. Included or Paid. | A second catalog, engines, Department licenses | Console authoring, facility install, Department-owned forms | Yes | New item kinds reuse this Catalog. Owner-scoped forms stay unsold. | [01](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026) |
| A | Menu | Domain | Food and Nutrition offering identity, content, and explicit applicability (`Menu`, cycle settings, location and cycle applicability) | Operational Cycle timing, Records, Work, a facility-wide singleton, historical menu snapshots | Today's Menu on the space workspace | Yes | Extend Menu and `resolveApplicableMenus`. Do not infer rooms from neighborhoods or bind a cycle row id. | [01](./01_PRODUCT_CONSTITUTION.md#product-workspaces), [08](./08_PRODUCT_LANGUAGE_GUIDE.md) |
| A | Operational scope | Resolver | A read-only request view of places already in the facility tree. It persists nothing. | Which rooms exist, which Location Functions they carry, live Cycle / Work / Records, authorization, an Experience catalog | Locations, sidebar, loaders that must not invent eligibility | No | Filter through the existing scope path. Place membership stays on the tree and the Department's bindings. Do not add `DepartmentLocation`. Do not revive Experience keys. | [LEG-D10](../legacy-retirement/DECISIONS.md#leg-d10--projection-fallbacks-are-removed--accepted-program-default-october-20-2026), [RETIRED](../platform-vision/RETIRED.md) |
| A | Service date and facility context | Resolver | Facility-local service date and timezone for Run and Audit | The Cycle window, entitlement, the User's home facility | Dashboard, Records occurrence, Audit selectors | Partially. People see "today" in facility time. | Consume operational time. Do not store a page-specific today. | [Dashboard architecture](../dashboard/ARCHITECTURE.md) |

### B — Operating Rhythm & Work

| Platform Domain | Primitive / Engine | Type | Owns | Explicitly does not own | Primary consumers | User-facing? | Reuse / extension rule | Canonical sources |
|-----------------|-------------------|------|------|-------------------------|-------------------|--------------|------------------------|-------------------|
| B | Operational Cycle | Engine | The published root recurring window. Persistence: root PERIOD on `DepartmentOperationalCycle`. | Phases and Key Points as peer cycles, PM cadence, Menu rotation, meal-time guesses, a persisted "current operation" row | Run rhythm, Work bindings, Menu resolution, Audit | Yes | Add a Cycle on the Department profile and publish it. Do not create a Department Cycle engine. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms), [03](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) |
| B | Phase | Primitive | One interval inside a Cycle (nested PERIOD) | A second window engine, Work itself | Work phase binding, Run timeline | Yes | Add phases on the Cycle. Gaps and overlaps are allowed. | [08](./08_PRODUCT_LANGUAGE_GUIDE.md), [13](./13_DEPARTMENT_PRODUCT.md) |
| B | Key Point | Primitive | An instant on a Cycle, plus the canonical actual `OperationalCycleKeyPointActual` when tracking requires it | Work, Records, a meal-milestone engine | Food and Nutrition timing, Runtime Location State, Audit | Yes. Avoid "Key Time" in product copy. | Add a Key Point with NONE, OPTIONAL, or REQUIRED tracking. One timing source per service date. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms), [LEG-D07](../legacy-retirement/DECISIONS.md#leg-d07--food--nutrition-meal-timing-uses-key-points-only--accepted-program-default-october-20-2026) |
| B | Work Plan | Engine | Recurring shared Work configuration after publish (`DepartmentWorkPlan`, items, applicability) | Work Orders, Records, Assignments, Key Points | Expected Work, Job Flow, Dashboard expected-work | Yes | Apply a Product preset into a facility draft. Publish explicitly. Never auto-publish. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms), [13](./13_DEPARTMENT_PRODUCT.md) |
| B | Expected Work | Resolver | What shared Work applies now or on a service date, derived from the published plan | The plan definition, occurrence facts, Work Orders, Records due | Job Flow, Dashboard, Audit | Yes | Extend the applicability derivation. Do not cache a second expected-work table as truth. | [03](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) |
| B | Work occurrence | Primitive | Sparse actuals for shared Work (`DepartmentWorkOccurrence`) | The definition of Work, Work Order execution | Job Flow completion, Audit actuals | Partially | Write an occurrence only when shared Work is actually recorded. Do not pre-materialize every slot as a Task. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms) |
| B | Job Flow | Composition | Nothing. It reads Assignment, Cycle, Work Plans, Records, and assigned work orders. | Any canonical store, a combined work lifecycle, authorization | Floor staff in every Department | Yes. It is the "my work" view. | Add a source beside the others. Do not merge stores. Work orders on Job Flow need Plant scope. | [01](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026) |

### C — People & Coverage

| Platform Domain | Primitive / Engine | Type | Owns | Explicitly does not own | Primary consumers | User-facing? | Reuse / extension rule | Canonical sources |
|-----------------|-------------------|------|------|-------------------------|-------------------|--------------|------------------------|-------------------|
| C | User | Primitive | Global person, email, password, display name, session version | Employee, PIN, Department, facility role, payroll | Login, My Account, available contexts | Yes, as the Vssyl account | Extend User. The same email is the same person. | [01](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026) |
| C | Employee | Primitive | Facility workforce record for one User, including name and PIN workforce classification | Global identity, where they work today, Work, HRIS | Roster, Shift, Assignment, PIN | Yes | One Employee per User per facility. Do not create a Department-specific or partner-specific person. | [08](./08_PRODUCT_LANGUAGE_GUIDE.md), [03](./03_PRODUCT_DOMAIN_MODEL.md) |
| C | Work shift pattern | Primitive | The reusable shift pattern (`WorkShift`) a Department schedules from | A dated Shift, Assignment, coverage math | Schedule authoring | Partially | Add a pattern. Dated work is still a Shift. | [03](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) |
| C | Shift | Primitive | Who works, for which Department, when (`ScheduleEntry`) | Where they work today, Work, the current Cycle, Department eligibility, payroll hours | Call-off, coverage derivation, "am I on" | Yes | Mark call-off on this row. Do not write placement here. Ignore legacy `unitId` as Assignment. | [01](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026) |
| C | Call-off | Primitive | The mark that this person is not working that Shift | The day's Assignment, a replacement placement, coverage as a stored status | Coverage, Dashboard call-offs | Yes | Set `calledOffAt` on the Shift. A move is a separate Assignment change. | [08](./08_PRODUCT_LANGUAGE_GUIDE.md) |
| C | Assignment | Primitive | Where a person works today and what they cover (`OperationalAssignment` and its plan) | Whether they were scheduled, the Work definition, the current Cycle, Work Order technician assignment, client-assignment access | Job Flow personal scope, coverage derivation | Yes | Change the Assignment when the person moves. Absence of an Assignment must not hide Work. | [03](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) |
| C | Coverage | Resolver | The derived answer: is needed responsibility adequately covered, from configured need plus Shifts, call-offs, and Assignments | Shift rows, Assignment rows, Work, a staffing-record table | Dashboard coverage, Runtime Location State, People & Coverage | Yes | Extend the derivation. Do not persist a parallel coverage fact. | [08](./08_PRODUCT_LANGUAGE_GUIDE.md), [Dashboard card catalog](../dashboard/CARD_CATALOG.md) |
| C | PIN | Governance | Workplace sign-in for one Employee at a unit (`Employee.sessionVersion`) | A separate person, User session version, facility authority | Unit kiosk, floor sign-in | Yes | Extend Employee PIN. Sign-out of the User does not sign out the PIN. | [01](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026) |

### D — Records & Assurance

| Platform Domain | Primitive / Engine | Type | Owns | Explicitly does not own | Primary consumers | User-facing? | Reuse / extension rule | Canonical sources |
|-----------------|-------------------|------|------|-------------------------|-------------------|--------------|------------------------|-------------------|
| D | Records engine | Engine | The one forward chain from Catalog definition to submitted Record | A per-Department log engine, Inspection as a second engine, `OperationalTemplate`, Task dual-write | Every Department, PM and Work Order required forms, Audit | Yes. Say Records. | New forms are Catalog definitions plus attachments. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms), [LEG-D05](../legacy-retirement/DECISIONS.md#leg-d05--one-records-engine--accepted-user-october-20-2026) |
| D | Catalog definition | Catalog | Field identity (`fieldKey`), purpose, rules, published version snapshot | The facility's live requirement, submitted answers | Console, Department-authored forms, install | Partially. Authors see the form. Floor staff see the Record. | Add fields with the existing evidence field types. A reusable section is copied into the definition. Runtime does not read a component library. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms) |
| D | Facility Catalog install | Primitive | The facility's adoption of a definition (`FacilityCatalogInstall`) | A cloned template, field copies, the requirement target | Attachment, Marketplace installed items | No | Install the definition. Do not copy it into a private template. | [13](./13_DEPARTMENT_PRODUCT.md#sources-of-truth) |
| D | Log attachment | Primitive | The live requirement segment: target, timing, local overlay, pinned version (`LogAttachment`) | The submitted fact, Catalog schedule metadata (recommendations only) | Derived slots, Run due Logs, PM/WO pins | No | Place the installed form on a room, asset, or other supported target. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms) |
| D | Derived requirement | Resolver | Whether a Record was required, and the slot's completed / missed / overdue / waived class | A stored requirement row that redefines those words, the submission | Due Logs, Audit, Dashboard records | Partially. People see due, missed, overdue. | Consume `resolveLogRequirementsForAttachment` and the shared occurrence classification. | [03](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) |
| D | Submitted Record | Primitive | What was documented (`OperationalEvidenceRecord`), including pinned meaning, score inputs, media metadata, and attestation | The requirement, Asset Issue lifecycle, file bytes (those live in private object storage) | Log Book, Audit, follow-up, optional Asset Issue escalation | Yes, as a Record | Submit through this model. A later Catalog version does not rescore it. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms) |
| D | Waiver, correction, follow-up | Domain | Excuse with a reason, a correction that preserves the original, and a later Record linked by `followsRecordId` | A completed Record (unless evidence was also submitted), a Finding entity, a pass rewritten from a fail | Audit, supervisor review | Yes | Use the existing semantics. Evidence wins over a waiver. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms) |
| D | Inspection | Domain | A Record form whose score, section totals, critical failures, and Pass / Pass with exceptions / Fail outcome are derived from the snapshot and the answers | A second inspection engine, Audit / Reports, an automatic zero for missed or waived inspections | Floor submission, Audit packets | Yes, as an Inspection Record | Author an INSPECTION Catalog purpose. Do not add `PlantInspection` or an EVS inspection store. | [08](./08_PRODUCT_LANGUAGE_GUIDE.md), [14](./14_FACILITY_PLANT_OPERATIONS.md#records) |
| D | Log Book | Projection | Nothing. It reads submitted Records. | Due work, a second evidence store | History of what was recorded | Yes | Add a view over `OperationalEvidenceRecord`. Due work stays on the requirement resolver. | [08](./08_PRODUCT_LANGUAGE_GUIDE.md) |
| D | Audit / Reports | Composition | Nothing. It compares expected and actual for a service date or range using effective configuration and source facts. | A Review store, a central history ledger, rescoring | Managers, survey packets, historical questions | Yes. The route may stay `/reports`. | If a report lacks a fact, extend the source domain. Do not create a report-owned snapshot table. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms), [03](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) |

### E — Assets & Maintenance

| Platform Domain | Primitive / Engine | Type | Owns | Explicitly does not own | Primary consumers | User-facing? | Reuse / extension rule | Canonical sources |
|-----------------|-------------------|------|------|-------------------------|-------------------|--------------|------------------------|-------------------|
| E | Asset | Primitive | Shared equipment identity: name, location, classification fields that exist, tag, and the registry row | The room's identity, PM execution, Department Product identity, a private Plant copy | Dietary, EVS, Plant, Facility Administrator, Job Flow when a work order targets it | Yes | Extend `Asset`. Do not add `PlantAsset` or a second identity for the same equipment. | [14](./14_FACILITY_PLANT_OPERATIONS.md#assets), [01](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026) |
| E | Asset lifecycle and condition | Primitive | Registry participation versus observed condition, including `AssetStatusHistory` | Work Order status, Issue resolution, automatic recovery on work-order completion | Asset screens, return-to-service, history | Yes | Record condition as its own fact. Lifecycle and condition stay different columns and different words. | [14](./14_FACILITY_PLANT_OPERATIONS.md#asset-lifecycle-vs-condition) |
| E | Title, maintainer, repair vendor | Primitive | Who holds title, who maintains, who is called to repair. Title is facility or the operating company. | Operating Organization as a synonym for title, Partner Organization as a synonym for repair vendor | Asset Builder, contract-end handling, Plant | Yes | Set the three relationships on the shared Asset. Maintainer runs and pays for repairs. | [01](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026), [CDA](../contracted-departments/README.md) |
| E | Asset presence note | Primitive | The facility's closed note that partner-titled equipment was on site (`AssetPresenceNote`) | An active Asset, repair history | Contract end | Partially | Write the note when partner-titled equipment leaves. Do not keep it in the live registry. | [01](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026) |
| E | Preventive Maintenance Plan | Domain | The published rule: target Asset, cadence, procedure, required Records, lead time, priority (`PreventiveMaintenancePlan` and version) | Operational Cycles, shared Work rounds, the generated Work Order's lifecycle | PM board, preventive Work Orders, Job Flow as assigned PM | Yes | Extend the plan. Fixed cadence does not slide. One occurrence, one Work Order. | [14](./14_FACILITY_PLANT_OPERATIONS.md#preventive-maintenance-plan) |
| E | Maintenance Request | Domain | Intake asking for maintenance attention (`OperationalRequest`), including reported urgency | The problem itself, the Work Order, authoritative priority | Plant triage, requesting Departments | Yes. Say Request. | Open a Request from any Department. Acceptance creates or links maintenance work. It does not become shared Work. | [14](./14_FACILITY_PLANT_OPERATIONS.md#request) |
| E | Asset Issue | Domain | The current maintenance condition row (`AssetIssue`): location required, asset optional, priority, equipment impact, link to Work Orders | Staffing gaps, missed Records, late service, food-safety outcomes, policy exceptions, Request intake, Work Order execution | Plant, asset evidence escalation, Asset history | Yes, as an Issue when the speaker means this condition | Extend this row for this maintenance condition. Do not rebrand it into a universal problem store. See Domain F. | [14](./14_FACILITY_PLANT_OPERATIONS.md#issue), schema comment on `AssetIssue` |
| E | Work Order | Domain | Accepted maintenance work (`Repair`): corrective or preventive, priority, target, technician, closeout, cost facts the Product already stores | Shared Work Plans, Record submission, Asset condition, Issue resolution, daily Assignment | Repairs queue, Job Flow for assigned orders, requester status | Yes. Say Work Order. `Repair` stays internal. | Add a Work Order field on this lifecycle. Do not fold the lifecycle into `DepartmentWorkPlan`. Technician assignment is `Repair.assignedEmployeeId`, not `OperationalAssignment`. | [14](./14_FACILITY_PLANT_OPERATIONS.md#work-order), [08](./08_PRODUCT_LANGUAGE_GUIDE.md) |
| E | Vendor | Primitive | The repair or service company called for equipment (`Vendor`) | The operating partner, a vendor account, a Partner Organization | Work Order external cost, Asset repair vendor | Yes, as repair vendor | Add a vendor on the facility list. Do not reuse it as the Department operator. | [08](./08_PRODUCT_LANGUAGE_GUIDE.md) |

### F — Issues, Readiness & Recovery

| Platform Domain | Primitive / Engine | Type | Owns | Explicitly does not own | Primary consumers | User-facing? | Reuse / extension rule | Canonical sources |
|-----------------|-------------------|------|------|-------------------------|-------------------|--------------|------------------------|-------------------|
| F | Operational problem | Domain | No cross-domain table. The name is the product idea of something wrong, which several owners already record. | `AssetIssue` rows, Work Orders, Record submission, a generic Issue engine | Dashboard attention, recovery conversation | Yes, in ordinary language | Compose the owning domain. Open an architecture decision before a universal Issue primitive. | This registry, [14 platform-gap test](./14_FACILITY_PLANT_OPERATIONS.md#platform-gap-test) |
| F | Readiness / Runtime Location State | Composition | The composed place answer for a request, including Ready, In Progress, and Needs Attention. Persists nothing. | Issue persistence, Record submission, Work completion, the published Cycle, coverage rows, a UI-local status | Locations, location workspace, Dashboard needs-attention | Yes. Never show Blocked. Never say Complete for green. | Extend Runtime Location State. Screens consume it. They do not recompute it. | [03](./03_PRODUCT_DOMAIN_MODEL.md), [08](./08_PRODUCT_LANGUAGE_GUIDE.md#readiness-language) |
| F | Dashboard | Composition | Nothing operational. `DashboardLayout` owns card order and size for a person or facility default. | Source facts, coverage arithmetic, Record requirements, Work Order lifecycle, authorization, Department-shipped cards | Supervisors and above, partner managers on `/partner` | Yes. It is the supervisor home. | Add a platform card that reads an existing owner through the attention contract and Fact Pack. | [Dashboard architecture](../dashboard/ARCHITECTURE.md), [contract](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md) |
| F | Attention | Composition | Nothing. Mappers translate existing module outputs into `DashboardAttentionItem`. | Severity as a stored domain, a second issue queue | Dashboard needs-attention | Partially | Add a pure mapper from an owner that already computes the condition. | [Dashboard architecture §5](../dashboard/ARCHITECTURE.md#5-attention-contract) |

### G — Knowledge & Intelligence

| Platform Domain | Primitive / Engine | Type | Owns | Explicitly does not own | Primary consumers | User-facing? | Reuse / extension rule | Canonical sources |
|-----------------|-------------------|------|------|-------------------------|-------------------|--------------|------------------------|-------------------|
| G | Knowledge article | Primitive | Facility-scoped guidance and its published version, linked to a place, Asset, Work item, or Catalog definition | Records, Work responsibility, a private Department procedure store | Work execution, Asset and place context, Build procedures | Yes. Procedures & Resources. | Attach an article to the work context. Do not create a wiki module with its own operational truth. | [01](./01_PRODUCT_CONSTITUTION.md) principle 5, [14](./14_FACILITY_PLANT_OPERATIONS.md#procedures) |
| G | AI Moments | Composition | Nothing. Cached, facility-scoped, opt-in compression of authorized state. | Truth, authority, readiness, schedules, Work creation, urgency, eligibility | Morning Brief and similar moments on an existing home | Yes, labeled as the brief | Ground the moment on canonical state. If the state is missing, extend the owner. | [01](./01_PRODUCT_CONSTITUTION.md), [08](./08_PRODUCT_LANGUAGE_GUIDE.md#ai-language) |

### H — Governance & Platform Services

| Platform Domain | Primitive / Engine | Type | Owns | Explicitly does not own | Primary consumers | User-facing? | Reuse / extension rule | Canonical sources |
|-----------------|-------------------|------|------|-------------------------|-------------------|--------------|------------------------|-------------------|
| H | Session and Workspace | Governance | Account session versus one selected context; Workspace type Internal Facility, Organization, or Partner Facility | Run / Build / Admin as Workspaces, Department as a Workspace, operational truth | Shell, Switch workspace | Yes | Enter a context. Do not invent a workspace type for a feature. | [01](./01_PRODUCT_CONSTITUTION.md#operating-workspace-shell) |
| H | Available context | Resolver | The directory of contexts a User may try to enter (`listAvailableContexts`). Entry is `enterContext`, which revalidates. | Authority by itself, PIN, Console, rows invented from home facility | My Access, login routing | Yes, as My Access | Add a real relationship, then let the resolver list it. Do not post a role and trust it. | [01](./01_PRODUCT_CONSTITUTION.md) Governance |
| H | Authorization | Governance | Whether this principal may do this here: route registry, facility role period, Department write manifest, domain checks | Navigation visibility, Dashboard scope, a Department lens | Every mutation and every sensitive read | No | Classify Department writes in the write manifest. UI may only narrow. | [01](./01_PRODUCT_CONSTITUTION.md), [CDA](../contracted-departments/README.md) |
| H | Organization relationships | Governance | Parent, Operating, and Partner Organization, partner Department scope, portfolio visibility | Facility access from membership alone, repair vendor, Asset title | Console, Admin partners, vendor-run Departments | Yes, with the words that must stay apart | Attach a company that already exists. Console creates the company. Saving a partnership does not. | [03](./03_PRODUCT_DOMAIN_MODEL.md), [08](./08_PRODUCT_LANGUAGE_GUIDE.md) |
| H | Release, entitlement, install, enabled | Governance | The four distinct commercial and admission facts, plus publication on the owning domain | Readiness, authorization, a capability environment switch | Marketplace, customer operability | Partially. Customers see available products and Enabled. | Keep the states apart. Capabilities come with the installed Department. | [13](./13_DEPARTMENT_PRODUCT.md), [LEG-D20](../legacy-retirement/DECISIONS.md#leg-d20--department-capabilities-come-with-the-installed-department--accepted-user-october-20-2026) |
| H | Publication and effective dating | Governance | Which profile, Cycle, Work Plan, Catalog version, or operator period is effective for a date | A central history ledger | Run (ACTIVE / published), Audit (effective that day) | Yes, as Make live / publish | Publish in the owning domain. Audit must read the effective version, not the latest draft. | [01](./01_PRODUCT_CONSTITUTION.md#shared-mechanisms) |

---

## Source-of-truth matrix

Use this before implementing a feature. The owner is the domain that already answers the question. A screen may compose several rows. It may not replace one.

| Question | Owner |
|----------|--------|
| What physical place is this? | Facility physical tree |
| What role does this room play for a Department? | Location Function binding on that Department's profile |
| What is happening now? | Published Operational Cycle and Phase |
| Who was supposed to work? | Shift |
| Where are they covering today? | Assignment |
| Is needed responsibility covered? | Coverage derivation |
| What recurring work is expected? | Published Work Plan / Expected Work |
| What documentation is due? | Records requirement / expected slot |
| What was actually documented? | `OperationalEvidenceRecord` |
| What equipment is this? | Asset |
| Who owns the equipment, who maintains it, who repairs it? | Title, maintainer, and repair vendor on that Asset |
| What maintenance attention was requested? | Request |
| What undesirable equipment or location condition is known? | Asset Issue |
| What maintenance work was accepted? | Work Order |
| Is the location Ready? | Runtime Location State |
| What should this person do? | Job Flow composition |
| What should the supervisor look at first? | Dashboard composition |
| What happened historically? | Audit / Reports, from effective configuration plus source facts |
| Can this user do this? | Authorization in the current context |
| Which company runs this Department? | Department operator relationship |
| May this facility use this Product? | Release state, entitlement, installation, and enabled, each for its own question |

Homes must not invent an alternate answer for these rows.

---

## Current architecture reconciliation

Older documents name mechanisms this registry does not carry forward. Where they appear below, they are retired or superseded. They are not current primitives.

| Older or retired concept | Current architecture | Rule |
|--------------------------|----------------------|------|
| Operations Engine / `OperationInstance` | Published Operational Cycle and Phase | Do not rebuild OperationInstance. Tables were dropped in LEG-06. "What is happening now" is the Cycle and Phase. No meal-time guess. |
| Task / Task Sync | Work Plans and Expected Work, plus separate Work Orders and Records, composed by Job Flow | Do not make Task a mandatory intermediary. The Task table was dropped in LEG-06. |
| Logs and Inspections as separate engines | One Records engine. Inspection is a Record form. | Do not add an inspection evidence engine, an EVS log engine, or a Dietary log engine. |
| Evidence as the manager noun | Records | Keep `OperationalEvidenceRecord` internal. |
| Review as a workspace or fact store | Audit / Reports, a derived expected-versus-actual layer | Do not create a Review source-of-truth store. The route may remain `/reports`. |
| Business Workspace, Operations Center, Today's Work | Dashboard for Supervisors and above. Job Flow for "my work." Unit workspace for the place. | Do not rebuild peer homes that answer the same persona question. `/workspace` and `/today` open the Dashboard. |
| `OperationalTemplate` | Catalog, install, attachment, and Records | Do not make OperationalTemplate the layer after Catalog. The template tables were dropped in LEG-06. Leftover template-link columns on a Work item are not a Record path. |
| Department capability switches | Capabilities come with the installed Department Product | Do not add a capability-toggle architecture. `CANONICAL_LOGS_ENABLED` is only the Records-path code flag. |
| Experience product tree | Platform, Department Product, Marketplace item, facility configuration, Run, History / Audit, Governance | Keep the experience *principle*. Do not reintroduce Experiences, Operational Areas, or an Experience catalog as the product structure. |
| Industry packs | A Department Product plus Marketplace items | Do not revive `applyIndustryPack()`. |
| Finding entity | A failed question stays on the submitted Record | Do not add a Finding store unless an architecture decision defines one. Corrective action stays on the Record. |
| Generic Maintenance as a Department Product | Facility Plant Operations, on shared Assets and repairs | Maintenance may be a navigation group and a capability. It is not the Product name and not one engine. |
| `AssignmentOverride` and the legacy unit schedule grid | Shift for attendance, Assignment for the day's place | Do not write placement onto the Shift. |

### Experience principle, without an Experience tree

[The Experience ↔ Engine boundary](../experience-runtime/10_EXPERIENCE_ENGINE_BOUNDARY.md) still states a principle worth keeping:

- Engines serve the surfaces people use.
- Those surfaces do not duplicate engine truth.
- One engine serves many surfaces.
- One surface may compose several engines.

The current Constitution does not organize the product as an Experience tree. Temperature Monitoring, Meal Service, and similar Experience keys are not installable modules. Location Functions, Marketplace items, and Department Products express that variety instead. The boundary document's Operations Engine, Task dual-write, LogTemplate, and "Breakfast is active because OperationInstance says so" are superseded by the rows above.

The same limit applies to [the Operational Projection Constitution](../operational-projection/01_OPERATIONAL_PROJECTION_CONSTITUTION.md). Its useful rule remains: scope is a read-only derivation that keeps physical identity and does not write engine records. Its Experience catalog, Operations Engine, and Today's Work / Operations Center ownership rules do not.

### Documents that still teach an older shape

These files contain useful history or a useful principle. Where they disagree with the current foundation, follow the foundation and this registry. This task does not rewrite them.

| Document | What is still useful | What is superseded |
|----------|----------------------|--------------------|
| [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md) | Domain words for Facility, Location Function, Records, Work Order, People & Coverage | The **Operation** row still defines a live service commitment. The **Task** row still calls Task a Work Engine projection. Both are retired. |
| [03 — Domain Model](./03_PRODUCT_DOMAIN_MODEL.md) | Ownership table, organization relationships | The entity row for Inspection still reads like a separate engine. The Issue row says `AssetIssue` is asset-required; the schema allows a location-only Issue. The relationship diagram is marked historical. |
| [09 — Decision Model](./09_PRODUCT_DECISION_MODEL.md) | "Can an existing home compose this?" and the AI limits | Placement still sends work to Business Workspace, Operations Center, Today's Work, the Operations Engine, and a Review zone. |
| [07 — Product Boundaries](./07_PRODUCT_BOUNDARIES.md) | What Vssyl does not become | The smell test still lists Workspace / OC / Today / Unit as the homes to avoid duplicating. Current homes are Dashboard, Job Flow, and the unit workspace. |
| [Dashboard architecture](../dashboard/ARCHITECTURE.md) and [Department Dashboard Contract](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md) | Cards are platform-owned. Layout stores no operational facts. Attention is mapped from owners. | Capability prose still mentions `isDepartmentEngineEnabledForFacility` and `RecordEngineRollout`. Those switches and that table were retired. Derive capabilities from install, license when enforcement is on, and real configuration. |
| [14 — Facility Plant Operations](./14_FACILITY_PLANT_OPERATIONS.md) starter pack | Shared Work presets and the rule that starters are optional and unpublished | One paragraph still calls Record starters compatibility `OperationalTemplate` drafts. Forward forms are Catalog definitions. |
| [Location programming realignment](../department-administration/13_LOCATION_PROGRAMMING_REALIGNMENT.md) | Runtime Location State as one composed place answer | It still describes an Experience registry and a Builder of Overview, Locations, and Teams. Current Department Builder is Overview, Locations, Operating Rhythm, Work, People & Coverage, and Records. |
| [Reference capabilities index](../reference-capabilities/00_REFERENCE_CAPABILITIES_INDEX.md) | The business ability to run, cover, recover, and learn | The stack runs through a platform-vision constitution and an Experience layer. It is not the current product tree. |
| [04 — Persona Model](./04_PERSONA_MODEL.md) | Who starts at the Dashboard | Some workflows still name Operations Center and Workspace Focus. |

---

## New feature decision gate

Every new feature, wave, or implementation prompt should be able to answer these before storage or a new screen is proposed.

1. What user problem is being solved, in canonical product language?
2. Which architecture layer owns it?
3. Which Platform Domain contains it?
4. Which existing primitive, engine, or resolver already owns the relevant fact?
5. Does this proposal extend that owner, or does it accidentally create another owner?
6. If several domains appear together, can they be composed without merging stores?
7. Does an existing home already answer the persona's question?
8. Are eligibility, readiness, the current Cycle, coverage, due state, and authorization being consumed rather than recalculated?
9. Does the proposed UI leak an internal implementation noun?
10. Does historical truth stay correct for a past service date?
11. Does this reuse the canonical Catalog, location, people, Record, Asset, and Work models?
12. If no owner fits, why is a new reusable mechanism required?

If 4 already has an owner, stop at extend or compose. If 12 is the only path, use the template below and obtain the architecture decision Rule 10 requires.

---

## Template for proposing a new engine

```text
Missing capability:

Why no existing owner can own it:

Why composition of existing owners is insufficient:

Proposed source of truth:

Proposed lifecycle:

What this mechanism explicitly will NOT own:

Which Platform Domains it interacts with:

Which Department Products may consume it:

Which current surfaces may consume it:

Historical / migration implications:

Why this does not create a parallel location / people / catalog / Work / Record / Asset model:

Product-owner architecture decision:
```

No new engine should begin life as a UI convenience.

---

## Forbidden patterns

These are concrete ways to duplicate ownership. Do not introduce them.

- A second physical location tree
- `DepartmentLocation` or other shadow tables of rooms
- A Department-specific employee identity
- A partner-specific duplicate User
- An EVS-specific log engine
- A Dietary-specific log engine
- A separate forward Inspection engine
- A Plant-specific Asset registry
- A duplicate Asset identity for equipment Dietary operates and Plant maintains
- A new Catalog for a new Marketplace item type
- A new `OperationalTemplate` layer after the Catalog
- A second Assignment engine, including treating client assignment as daily placement
- A Shift that creates an Assignment
- An Assignment that creates Work
- A Work Order that becomes a Work Plan item
- A Record that becomes a Work item because both appear in Job Flow
- A Job Flow persistence store
- A Dashboard persistence store for source facts
- A UI-local readiness calculation
- A UI-local coverage calculation
- A UI-local eligibility filter that disagrees with the server
- A screen-specific current-operation heuristic
- Meal-time guessing for "what is happening now"
- Rebuilding OperationInstance or the Operations Engine
- Rebuilding Task Sync or a mandatory Task row
- A second Audit or history fact store
- A generic Issue implementation created by rebranding `AssetIssue`
- Treating every operational problem as maintenance, or every recovery as a Work Order
- Treating navigation visibility as authorization
- A Department Product that ships its own Dashboard
- A new home created because an existing home contains a lot of information
- Engine, persistence, or resolver vocabulary shown to frontline users
- A capability environment switch for a Department Product
- A stored self-operated / vendor-run flag
- A central history ledger to make a report easier to query
- An AI path that creates Work, readiness, urgency, or eligibility

---

## Practical reuse examples

### EVS recurring cleaning workflow

Environmental Services is a Department Product. It does not bring its own engines.

```text
Environmental Services Department Product
    ↓
Location Functions on existing rooms
    ↓
Operational Cycle / Phase where the facility publishes them
    ↓
Work Plan for expected cleaning work
    ↓
Records for required documentation / inspection
    ↓
Job Flow, Locations, and the Dashboard consume that canonical state
    ↓
Audit / Reports reconstruct historical performance
```

`EVSLogTemplate`, `EVSLogSubmission`, `EVSInspection`, and `EVSReadiness` are not models to add.

### Refrigerator failure in Dietary

Do not create one equipment-incident row that owns the Asset, the condition, the request, the repair, and the dietary response.

```text
Asset
    ↓
observed condition, and an Asset Issue when that condition is the maintenance problem
    ↓
maintenance Request
    ↓
Work Order
    ↓
repair and explicit return-to-service facts
```

Separately, Readiness may consume the asset or problem state as an input. The Dashboard may show it. Food and Nutrition Run may react operationally, including a Record if documentation is required. Those consumers do not own the repair lifecycle.

### Employee calls off

```text
Shift
    ↓
Call-off marks that Shift
```

Then, separately:

```text
Replacement / available workforce
    ↓
Daily Assignment
    ↓
Coverage derives the current answer
    ↓
Job Flow uses Assignment for personal scope
```

Assignment is not the attendance system. The original Shift is not rewritten into a fake placement.

### A new report

A page that needs one query does not get a `ManagerDailyReportSnapshot` that becomes the source of truth.

```text
historically effective configuration
+
canonical source facts
+
domain historical semantics
    ↓
Audit / Reports composer
    ↓
presentation model
```

If a source fact is missing, extend the source domain.

### A new Department Product

```text
New Department Product
    ↓
Product-owned defaults
Location Functions
Operating Rhythm starters
Work presets
Records forms
Coverage needs
Marketplace starter content
Dashboard contribution
    ↓
runs on shared Platform mechanisms
```

It does not add `NewDepartmentCycleEngine`, `NewDepartmentLogEngine`, `NewDepartmentEmployeeModel`, `NewDepartmentAssetTable`, or `NewDepartmentHistoryEngine`.

---

## Document governance

Update this registry when:

- a genuinely new reusable Platform primitive is approved
- ownership moves from one mechanism to another
- a mechanism is retired
- a legacy store becomes non-canonical
- a new shared resolver becomes authoritative

Do not update this registry merely because:

- a new page exists
- a route was added
- a component was added
- a Department Product uses an existing engine differently
- navigation was reorganized

The registry describes architecture ownership, not every UI surface.

When a major change is decided, the Constitution, the Language Guide, the Domain Model, the Department Product contract, and any persona, commercial, `AGENTS.md`, or Cursor rule that still describes the old shape move together. This registry moves with them. It does not move ahead of the Constitution.

---

## Unresolved ownership questions

These are recorded so later work does not pretend they are settled. This document does not decide them.

1. **How far an Issue extends.** `AssetIssue` is the current store for a known undesirable condition in the maintenance loop. Asset is optional; location is required. The Domain Model's "asset-required" sentence does not match the schema. The row does not today own staffing gaps, missed Records, late service, food-safety outcomes, or policy exceptions. Plant's platform-gap test already names a generic Issue as likely Platform *if* more than maintenance needs it. Whether those other problems should become `AssetIssue` rows, or whether a broader primitive is required, needs a product-owner architecture decision. Until then, do not rebrand `AssetIssue`, and do not add a second issue table.

2. **Work Order and PM Plan if a second Department needs them.** [14](./14_FACILITY_PLANT_OPERATIONS.md#platform-gap-test) already places Work Order and Preventive Maintenance Plan on Facility Plant Operations, and shared Asset behavior on the Platform. Another Department needing the same lifecycle would reopen that platform-gap test. It would not be solved by copying `Repair` into a Department-specific table.
