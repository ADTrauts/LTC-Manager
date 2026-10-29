# 01 — Product Constitution

**Status:** Current architecture authority  
**Certified through:** `06935aef0d2e257c1ff616694992f522360a83c1` (2026-10-02)  
**Current product identity:** **Vssyl — Business Operations Platform.** See [12 — Vssyl Brand](./12_VSSYL_BRAND.md).  
**Vocabulary:** [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md)  
**Department Product contract:** [13 — Department Product](./13_DEPARTMENT_PRODUCT.md)  
**Facility Plant Operations architecture:** [14 — Facility Plant Operations](./14_FACILITY_PLANT_OPERATIONS.md)  
**Compatibility systems:** [Legacy Surface Register](./LEGACY_SURFACE_REGISTER.md)  
**Plug-in contract:** [Current foundation — October 26, 2026](#current-foundation--october-26-2026)

This document is the one current map. Deeper documents explain a layer. Dated `LTC_MANAGER_*.md` files, wave roadmaps, and domain guidebooks are historical or operational references. They do not override this constitution. Where an older paragraph in this document disagrees with the current foundation, the current foundation wins.

---

## Canonical platform model

```text
VSSYL PLATFORM
    reusable operating mechanisms

DEPARTMENT PRODUCT
    Vssyl-authored domain framework

FACILITY CONFIGURATION
    local implementation

RUN
    current operational truth

HISTORY / AUDIT
    historically effective configuration + source facts

GOVERNANCE
    organization, access, licensing, permissions
```

| Layer | Owns | Does not own |
|-------|------|----------------|
| **Platform** | Physical facility tree, Location Functions mechanism, Operational Cycles, Work, Records, Assets, Issues where present | A department’s domain rules |
| **Department Product** | Purpose, function keys, rhythm starters, Work presets, Record definitions, coverage needs, starter content | A second location tree, Cycle engine, Work engine, Record engine, or history store |
| **Facility configuration** | Which rooms are bound, local times, published plans, people, installed departments, Marketplace items added to each Department | Product identity (`functionKey`, catalog definitions) |
| **Run** | What is true in the current operation | Permanent configuration |
| **History / Audit** | Expected versus actual for a requested service date, using the configuration effective that day | A central history ledger |
| **Governance** | Organization, facility access, licensing, permissions | Day-of operational truth |

### Implementation status

| State | Meaning here |
|-------|----------------|
| **Implemented** | Food and Nutrition and Facility Plant Operations V1 as customer-visible AVAILABLE Department Products, Location Function binding, Operational Cycles, Work projection, one Record engine, Audit / Reports, shared Assets and repairs |
| **Legacy compatibility** | Systems in the [Legacy Surface Register](./LEGACY_SURFACE_REGISTER.md). Readable. Not the forward architecture. |
| **In development** | Environmental Services exists in the registry, tests, and internal tooling. It is not customer-visible until marked AVAILABLE. |

Status reconciliation (October 17, 2026): Facility Plant Operations V1 became AVAILABLE on October 7, 2026; see the [release addendum](../plant/FACILITY_PLANT_OPERATIONS_V1_RELEASE_CERTIFICATION_2026-10-06.md#release-addendum--2026-10-07) and [14](./14_FACILITY_PLANT_OPERATIONS.md). This corrects stale implementation-status prose; it does not change Product release policy or billing behavior.

A Product existing in the Vssyl registry does not make it customer-visible. Customer visibility requires AVAILABLE release state. See [13 — Department Product](./13_DEPARTMENT_PRODUCT.md).

### Foundation amendment — October 20, 2026

The product owner decided this amendment on October 20, 2026. It is a constitution revision under Governance. It changes no release status, price or sellability today. Building it needs its own authorized scope.

**What a customer adds, in three layers.**

```text
Vssyl Platform                 every facility
  → Department Product         licensed and installed per facility
      → Marketplace items      added inside a Department
```

- **Marketplace items** are ready-made content Vssyl publishes: Records forms (Reading, Checklist, Inspection, Acknowledgement, On-demand Record), Work presets, Operating Rhythm starters and Menu templates.
- An item runs on Platform engines. It is never a second engine.
- A Department Product's starter content is the set of Marketplace items pre-selected for it.
- Forms a Department head or a vendor builds ([LEG-D19](../legacy-retirement/DECISIONS.md#leg-d19--departments-and-vendors-can-make-their-own-forms--accepted-user-october-20-2026)) live in the same Catalog. Only their owner sees them, and they are never sold.
- **Built today:**
  - Only Records forms come from the Catalog (`CatalogLogDefinition` → `FacilityCatalogInstall`).
  - Work presets and Operating Rhythm starters ship in code with their Product.
  - Menu templates do not exist.
  - Moving these into the Marketplace reuses the Catalog. It does not add a second catalog.

**Included or Paid.** Vssyl marks each Marketplace item Included or Paid in the Console. Included is the default. Department pricing is unchanged. See [11 — Commercial Model](./11_COMMERCIAL_MODEL.md#marketplace-items).

**Capabilities come with the installed Department.**
- An installed Department gets everything its Department Product includes. When billing enforcement is on, its license must also be valid.
- Deployment-wide switches no longer turn a Product's capabilities on or off.
- Release status still keeps DEVELOPMENT Products from customers. Internal preview uses an install in an internal facility, as Plant does today. Plant has no env override ([LEG-D20](../legacy-retirement/DECISIONS.md#leg-d20--department-capabilities-come-with-the-installed-department--accepted-user-october-20-2026)).

**Foundation round (decided by the product owner, October 20, 2026).** The [Domain Model](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) records each owner.

- **Shift and Assignment are separate.**
  - The shift (`ScheduleEntry`, from a `WorkShift` pattern) answers who works, for which Department, and when.
  - The daily Assignment (`OperationalAssignment`) answers where they work and what they cover.
  - Neither creates the other.
  - A call-off marks the shift. A move changes the Assignment.
- **Assignments are part of every Department.**
  - Without an Assignment, a person sees the Work for the place they are signed into.
  - With one, they see the Work for their assigned places.
  - An empty Assignment plan never hides Work.
- **One "my work" view.**
  - It shows a person's Work Plan items, the Records due at their places, and the work orders and preventive maintenance assigned to them (`Repair.assignedEmployeeId`), side by side.
  - Each keeps its own store and lifecycle. Plant work orders never become Work Plan items.
- **"What's happening now" is the published Cycle and Phase.**
  - The shift and Assignment answer "am I on, and where".
  - No published Cycle means no window. The system never guesses.
  - The meal-time guess (`meal-daypart.ts`) and the AI snapshot's placeholder "Current operation" are removed.
  - Food & Nutrition meal timing uses Key Points only ([LEG-D07](../legacy-retirement/DECISIONS.md)).
- **Job Flow is the "my work" view.**
  - It is the employee's "my day" screen in every Department, always on.
  - It shows the Assignment, the current window, what is expected now and next, Work items, Records due, and problems at the person's places, with one next action.
  - It stores nothing. It reads Assignments, Cycles, Work Plans, Records and work orders.
  - The capability switches retired in LEG-05. Job Flow is the my-work view in every installed Department.
  - Assigned work orders and preventive maintenance appear beside Work and Records. They stay in their own stores.
- **Employee goals** do not exist. They are recorded as a future idea: not designed, not scheduled.

**Stale text in this document.** These lines name surfaces that are retired or being replaced. The program named corrects them; they are not current guidance.

| Text | Replaced by |
|---|---|
| Principle 7 names the Operations Engine, Operations Center, Business Workspace and Today's Work | The Operation entity retired on September 25, 2026 ([RETIRED](../platform-vision/RETIRED.md)). Its tables were dropped in LEG-06. The homes are the Dashboard ([DSH-04](../dashboard/PHASED_PLAN.md)). |
| "Managers begin in Business Workspace", "Supervisors begin in Today's Work", "Manager daily home (Business Workspace)" | The Dashboard ([DSH-04](../dashboard/PHASED_PLAN.md)) |
| "Department operating Organization as date-effective governance metadata" | Vendor-run Departments ([CDA-07](../contracted-departments/PHASED_PLAN.md)) |
| Legacy `/logs` as a live record store | The Catalog record chain. The legacy tables were dropped in LEG-06. |
| `RecordEngineRollout`, `OperationalTemplate`, and a department staying on a previous record engine | The rollout and template tables were dropped in LEG-06. One Catalog chain is the Record path. |

### Current foundation — October 26, 2026

The product owner asked that future building add a part to this structure. A new feature plugs into a layer that already exists. It does not create a second platform, a second Department, a second catalog, a second people model, or a second home.

Deeper documents keep the detail: [what a Department is](./13_DEPARTMENT_PRODUCT.md), [who owns each fact](./03_PRODUCT_DOMAIN_MODEL.md), [the words](./08_PRODUCT_LANGUAGE_GUIDE.md), [who starts where](./04_PERSONA_MODEL.md), [what we sell](./11_COMMERCIAL_MODEL.md). Program logs under `docs/contracted-departments/`, `docs/dashboard/`, `docs/legacy-retirement/`, and `docs/onboarding/` record how a decision was reached. They do not replace this section.

**What the platform is.** Vssyl is one Business Operations Platform for a physical facility. Every facility gets the same engines: the building, Location Functions, Operational Cycles, Work, Records, Assets and repairs, shifts, and daily Assignments. A Department Product is a Vssyl-authored operating model installed into that facility. A Marketplace item is ready-made content added inside one Department. Run is what is true today. History answers a past service date from the configuration that was effective that day. Governance is the company, the facility account, and who may enter.

**What a Department is.** A Department Product and a Department are not the same thing. Food and Nutrition is the Product. Healthcare is the industry it belongs to, not part of the name. A new install is named Food and Nutrition. A facility may rename that Department. The stored installation key remains `DIETARY`. The Product brings its Location Functions, rhythm starters, Work presets, Record forms, and coverage needs. The facility binds those to its own rooms, times, and people. Environmental Services stays DEVELOPMENT. Food and Nutrition and Facility Plant Operations are AVAILABLE. A Department does not receive its own location tree, Cycle engine, Work engine, Record engine, or history store.

**Who runs a Department.** Each facility has one Facility Administrator. That person keeps the building, the account, and which company operates each Department, and can transfer the role. Every Department is run by its head and its members. The Facility Administrator only views a self-operated Department unless they are its head. A vendor-run Department is controlled by the operating partner, who owns that period's data. The Facility Administrator sees a summary plus compliance Records. Self-operated and vendor-run are derived from who the operator is. They are not a stored switch.

**Who can exist.**

| Person | What they are | What they are not |
|---|---|---|
| User | The global person. One identity, many places they can enter. | An Employee, a PIN, or a Department |
| Employee | That person's workforce record at one facility. At most one per User per facility. | The global identity |
| Facility role | Staff, Lead, Supervisor, Manager, GM, Facility Administrator, on the current facility grant | An Organization role |
| Organization Administrator / member | Affiliation with a company. Membership grants no facility access. | A facility role, and not a partner login by itself |
| Partner head, Operator, Viewer | A vendor account inside a facility the company operates | Facility Builder, Administration, or another Department |
| PIN | Workplace sign-in for one Employee at a unit | A separate person |
| Harbor staff | A Vssyl Console operator | A customer user |

A User remains when they leave a facility, hold only partner access, or have nowhere to enter. Their email identifies that person and is not given to anyone else. Signing up with that email and the right password adds a facility to the same User. The wrong password is refused without saying whether the email is already in use.

A partner company is born in Vssyl Console. Console invites the first Organization Administrator and the first members. That invitation does not open a facility. The Facility Administrator attaches a company that already exists and records it as a Department's operator. Saving a partnership does not create the company.

**Words that must stay apart.**

| Word | Means |
|---|---|
| Parent Organization | The company that owns the facility |
| Operating Organization | The company that runs one Department for a period of dates |
| Vendor-run | That operating company is not the facility's own company |
| Partner Organization | The facility's explicit partnership with an outside company |
| Repair vendor | The company called to fix a piece of equipment |
| Vendor account | A person from the operating partner, signed in on the partner workspace |

**Assets.** The operating partner can add equipment in their Department, in the facility's rooms, and set title, responsible maintainer, and repair vendor. Title is the facility or that partner. Existing equipment stays facility-titled. While it is on site, the using Department, Plant, and the Facility Administrator see it, including title. When the contract ends, facility-titled equipment stays and partner-titled equipment leaves. The facility keeps a closed note of what left. That note is not an active asset. Only the company operating that Department can title an asset to itself.

**What is happening, and what is mine.** "What's happening now" is only the published Cycle and Phase. The shift says who is scheduled. The daily Assignment says where they cover. A call-off marks the shift. A move changes the Assignment. Neither creates the other. Job Flow is the one "my work" view in every Department. It shows Work Plan items, Records due, and assigned work orders side by side, without merging their stores. An empty Assignment never hides Work.

**Homes.** Supervisors and above begin at `/dashboard`. Floor staff begin at their unit, or at `/logs` when they have no unit. `/logs` is a short page for them. It does not send them back to the Dashboard. `/workspace` and `/today` open the Dashboard. The partner workspace begins at `/partner`. The accepted Partner head also sets up that Department at `/partner/people`, `/partner/coverage`, `/partner/rhythm`, `/partner/work`, `/partner/menus`, and `/partner/assets`. They do not receive Facility Builder or Administration. A new facility is set up at `/setup`, one question at a time: Set up your Vssyl. The answer opens the next question: Vssyl, Products, the building, equipment, who runs each ready Department, people, then acknowledgement. That Department question names the operating company and the Department head. It does not open Department Builder. The head sets that Department up after acknowledgement. Checkout returns to the building. Facility Builder and Asset Builder remain the tools for the building and equipment. Opened from setup, each of those builders hides the rest of the platform until Back to setup, which opens the next question. Acknowledging setup does not license a Product or publish a Department.

**Marketplace.** It exists so a facility can add ready-made content inside a Department it already installed, without buying a new engine. The items are Records forms, Work presets, Operating Rhythm starters, and Menu templates. Each is Included or Paid. Included is the default. A Department Product's starter content is the items pre-selected for it. Forms a Department head or a vendor builds live in the same Catalog, are visible only to their owner, and are never sold. Today only Records forms are Catalog items. The other kinds still ship with the Product. Moving them into the Marketplace reuses the Catalog. It does not add a second one.

**Vssyl Console.** Console (`/console`) is Vssyl's own operating desk, not a customer workspace. It creates a customer facility and its Facility Administrator, creates a partner company and invites its first people, publishes Catalog forms, and holds the claim queue for a company that already exists and has no administrator. Customers do not enter Console to run a shift.

**How a new part plugs in.**

1. Name the layer: Platform, Department Product, Marketplace item, Run, History, or Governance.
2. Use an engine that already exists. A missing reusable mechanism is the only reason to add one, and that reason is written down before the build.
3. A new Department Product follows [How to build one](./13_DEPARTMENT_PRODUCT.md#how-to-build-one) and fills the blueprint, including its Dashboard contribution. It contributes capabilities. It does not ship dashboard UI.
4. A new Department write is classified in `src/lib/department-authority/write-manifest.ts`. A role check alone is not authority.
5. A new fact names its owner in the [Domain Model](./03_PRODUCT_DOMAIN_MODEL.md#ownership-of-truth) and its word in the [Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md).
6. Schema changes are a new forward migration. Applied migrations stay as they are.
7. Release status, price, and sellability do not change as a side effect of a build.

**A major change is a conversation first.** A major change is one that replaces a layer, adds an engine, changes who runs a Department, changes a home, or changes what the Marketplace or Vssyl Console is. Stop and discuss it with the product owner. Decide whether it is the best situation. Do not build it during that conversation. After the decision, update the foundation, the language guide, the domain model, the Department Product contract, and any persona, commercial, `AGENTS.md`, or Cursor rule that still describes the old shape. Those materials move together. A small addition that follows the seven steps above is not a major change.

### Shared mechanisms

**Physical world.** One Facility tree: Facility → structural Units → neighborhoods / operational Units → Rooms / Spaces. Departments do not clone the building. Facility Builder owns physical hierarchy, physical room type, and physical names.

**Location Functions.** The Product defines `functionKey` and the product label. The facility binds those functions to existing rooms on a Department profile. Runtime matches `functionKey`. Build reads the working profile. Run reads the ACTIVE profile. Audit reads the profile effective on the service date. An empty binding set matches no rooms. Food and Nutrition `food_service_area` and EVS `service_support` on the same room are independent.

**Operational Rhythm.** An Operational Cycle is a root recurring window. A Phase is one interval inside that Cycle. A Key Point is an instant on the Cycle. Occurrence tracking is NONE, OPTIONAL, or REQUIRED. Current cycles are derived. Cycles may overlap and may cross midnight. Phases may overlap and may leave gaps. Key Points are not Work.

**Work.** Product preset → facility Work Plan → publish → derived WorkRequirement → optional Assignment → sparse WorkOccurrence. Assignment does not create Work. Work may bind to a Cycle or a Phase. An empty Cycle binding means not configured.

**Records.** One engine. Manager forms are Reading, Checklist, Inspection, Acknowledgement, and On-demand Record. The forward chain is:

```text
CatalogLogDefinition
  → FacilityCatalogInstall
  → LogAttachment
  → derived requirement
  → OperationalEvidenceRecord
```

`CatalogLogDefinition` is the Vssyl-published product definition. `FacilityCatalogInstall` is the facility’s adoption reference (not a field copy, and not an `OperationalTemplate` clone). `LogAttachment` is the facility requirement segment (target, timing, local overlay, pinned catalog version). Expected slots are derived (`resolveLogRequirementsForAttachment`). The submitted fact is `OperationalEvidenceRecord`. Missing expected Records are derived. Procedures are knowledge, not Records.

This chain is the Record path. The legacy log, inspection, and operational-template tables were dropped in LEG-06. `CANONICAL_LOGS_ENABLED` remains a code flag and is not a second record store.

Harbor / Vssyl Template Studio (`/console/catalog`) authors `CatalogLogDefinition` + `CatalogLogField` using the existing `OperationalEvidenceFieldType` set. Field identity is `fieldKey`, not the label. Catalog schedule and applicability metadata are Marketplace recommendations only; the facility `LogAttachment` remains the live requirement.

Exception behavior is declarative data on the Catalog definition (`rulesJson`) plus the existing per-field standard. `evaluateEvidenceRules` is the shared evaluator. Submitted meaning is pinned in the Catalog version snapshot. A later version does not reinterpret earlier evidence. Corrective action stays on `OperationalEvidenceRecord`. A supervisor may create an existing Asset Issue from eligible asset evidence. Follow-up evidence uses `followsRecordId`. A recheck is another canonical record on the originating Log Attachment, including scheduled attachments, and it uses the originating snapshot’s Catalog version. It does not satisfy another scheduled slot. Photos, files, and signatures are `OperationalEvidenceAttachment` rows on that record. The row stores metadata and a provider-neutral storage key. Bytes live in private durable object storage, not in the relational record and not on an application-instance filesystem. An INSPECTION is still a Catalog purpose. Its score, section totals, critical failures, and outcome (Pass, Pass with exceptions, or Fail) are derived from the immutable submission snapshot and the submitted answers. Formal PDF, Excel, and CSV packets are projections of that same evidence and the derived requirements. They are not a second record. Requirement occurrence state is derived once from the expected requirement, submitted canonical evidence, waiver state, service-day timing, and as-of timestamp. Review and formal reporting consume the same occurrence classification and summary. Presentation layers do not redefine completed, missed, overdue, or waived. Completed evidence stays completed when it is out of standard or needs review. A waiver is excused work, not a completed record, unless evidence was also submitted — evidence wins. Overdue means the window has passed and the service date is still open. Missed means that service date has closed with no evidence and no waiver. A failed inspection is completed evidence with a derived score; missed, waived, and overdue inspections do not receive a zero score. N/A is a real compliance response and leaves that question out of the possible points. Evidence status stays the submission lifecycle and is not the audit grade. A later Catalog version does not rescore an earlier audit. Repeating groups, calculated fields, and reusable authoring sections are Catalog structure. A reusable section is copied into the draft when an author inserts it. The published definition and the submission snapshot contain that copy. Runtime does not read the component library. Calculated values are derived from the pinned snapshot and the submitted answers. A later formula does not recalculate an earlier record. Record-engine authority for new work follows `CANONICAL_LOGS_ENABLED`. The rollout table was dropped in LEG-06. With the flag on, a Department uses this Catalog chain. With the flag off, new work stays off that chain. Historical log submissions were not copied into canonical Records. A recheck does not rewrite the original score. Corrective action does not turn a failed audit into a pass. There is no Finding entity yet: a failed question stays on the evidence record, record-level corrective action is the immediate response, and an Asset Issue remains an optional escalation when the problem is an asset. Submitted media is not deleted by a correction, and a follow-up does not copy the original record’s files. Attestation remains a boolean confirmation. A signature is a PNG artifact plus the signed-in person and time. Local facility upload helpers are not the evidence-media store.

Log Book is a projection over `OperationalEvidenceRecord`. Audit / Reports (Review) is a derived expected-versus-actual layer. Neither is a submitted-evidence store.

**Food and Nutrition timing.** Meal Due is a Key Point with tracking NONE. Ready and Service Started are Food and Nutrition Key Points with tracking REQUIRED at LOCATION grain. The canonical actual is `OperationalCycleKeyPointActual`. A service date has one authoritative timing source.

**History.** No central ledger. Log Book is submitted Records. Asset History is source facts about an Asset. Location History is source facts about a Place. Audit / Reports compares expected and actual across a range. Selectors use the configuration effective on the requested service date.

### Product workspaces

**Build / Department Builder:** Overview, Locations, Operating Rhythm, Work, People & Coverage, Records. Food and Nutrition also has Menus. Menus are first-class Department-owned records listed at `/menus` and edited at `/menus/[menuId]`. A Menu is identity plus content. Applicability is separate configuration: explicit Department locations and canonical Operational Cycle identities, each mapped to an existing Menu period. Menu rotation is not Operational Cycle timing. They are not a facility singleton. Runtime Menu resolution is `resolveApplicableMenus`: exact location + date-effective root Operational Cycle occurrence + ACTIVE applicability + stored cycle→period mapping + Menu rotation. The first Run consumer is a read-only Today's Menu block on the Space workspace when an ACTIVE current Operational Cycle exists. Temperature/log integration and historical Menu snapshots are not implemented. Assets and Procedures appear only where a real configurable capability exists.

**Facility Builder:** physical structure only.

**Run:** current operation — Dashboard, Locations, Employees / Assignments, due Logs (`/staffing/logs` when canonical Logs are on), Log Book (history), Assets, today’s Operational Rhythm, and access to Audit / Reports. Permanent configuration stays in Build. Due Logs answer “what must be recorded now?” Log Book answers “what has already been recorded?” They are not the same surface.

**Audit / Reports:** manager-facing name. Review is not a workspace. The route may remain `/reports`. Internal code may still say Review.

### Operating Workspace (shell)

**Workspace** is where the User is operating. Supported types in this phase: Internal Facility, Organization, and Partner Facility.

```text
Global identity
  → Workspace
  → Workspace-owned navigation
  → Mode / governance
  → Department lens
  → Locations / operational content
```

**Run / Build / Admin** are modes (or governance) inside an authorized Facility context. They are not Workspaces.

**Department** is a subordinate operational lens inside a Facility or Partner Facility workspace. It is not a Workspace.

**My Account** and **My Access** are global User surfaces, not Workspaces.

**Harbor / Vssyl Console** is excluded from this shell. Quick PIN sessions do not receive a global Workspace selector.

**Switch workspace** is the shell control for moving between current enterable Workspaces. Rows come from `listAvailableContexts` / `presentAvailableContexts`. Selection posts `contextKey` to `enterContext`, which live-revalidates and replaces the session. Same-Facility internal and partner hats are distinct rows. Organization visibility is not Facility authority. **My Access** remains the detailed inventory. FacilitySwitcher / OrganizationSwitcher are no longer shell chrome.

---

## Purpose of this constitution

The product now presented as **Vssyl** completed twelve modernization waves under the earlier LTC Manager name. The codebase is large enough that **feature imagination outruns shared definition**.

This constitution answers:

> **What is Vssyl?**

It does **not** answer “what should we code next” in isolation. Coding decisions must pass through this document, the capability model, and the decision model.

---

## Mission

**Help frontline teams run complex physical operations — starting with dietary/food service — by making “how is today going?” answerable in seconds, and making recovery possible without leaving the floor.**

We replace spreadsheet-and-radio coordination with **operational awareness at the point of service**: coverage, readiness, logs, issues, inspections, and knowledge bound to the place and moment of work.

---

## Vision

Vssyl is the **operations home for multi-node service environments**: many locations, many shifts, multiple departments (Food and Nutrition, EVS, Plant, and future modes), across long-term care and adjacent dining/hospitality environments.

Long-term:

- The product remains **facility-operational**, not clinical.
- **Organization** is the parent for multi-facility access — not a second product.
- **Intelligence** intensifies moments already owned by Operations / Work / Knowledge — it does not become a chatbot home.
- **Industry configuration** (neutral copy, packs, data-driven modes) completes the platform language — without forking the product tree per industry.

---

## Product principles

### 1. Operations before documentation

Documentation is a **byproduct of doing work**, not a separate career path inside the app.

### 2. Software where work happens

Tablet- and unit-first execution (PIN, kiosk, Unit Workspace) outranks laptop-only admin UX.

### 3. Role- and location-scoped clarity

People see what they need for **this role, this facility, this department lens, this place, this operation** — not the entire ERP surface.

### 4. Awareness before analytics

“What needs me now?” beats historical warehouses, vanity KPIs, and scorecards as the primary experience.

### 5. Knowledge attached to work

SOPs and guidance live on the unit, issue, template, or asset — not as a detached intranet.

### 6. Resilience under disruption

Issues, readiness, call-downs, and recovery assistants exist so the day can continue when something breaks.

### 7. Engines serve homes — homes do not duplicate engines

The Platform engines are the substrate. The Dashboard, Unit Workspace, and the partner workspace are the homes. Homes compose engines. They do not re-implement domain rules. Operations Center, Business Workspace, and Today's Work are retired names for homes.

---

## Non-negotiable values

| Value | Meaning in product |
|-------|-------------------|
| **Facility safety of data** | Active facility scopes queries; facility switch must not leave stale prior-facility content. |
| **Role honesty** | Preferences and AI cannot unlock what RBAC denies. |
| **Deterministic operational truth** | Readiness, Focus, and agenda never invent urgency or fake due times. |
| **Authoritative sources** | Summaries link to the module that owns the work (issue, unit, coverage, OC). |
| **Forward-only schema discipline** | Migrations do not rewrite history; dual-write and flags protect floor flows. |
| **AI as grounded moments** | Briefs and assistants are opt-in, facility-scoped, cacheable, provider-gated — never a Workspace generation console. |

---

## What belongs in Vssyl

- Facility-day operational readiness and exception awareness  
- Location / unit execution (logs, meal rhythm, issues, inspections)  
- Supervisor walk, coverage, call-downs, handoffs  
- Manager daily home is the **Dashboard**  
- Department operational modes via Vssyl-defined Department Products (Food and Nutrition, EVS, Plant…) that a facility selects, licenses, then installs
- Assets / vendors as operational equipment context  
- Employee roster and operational HR **adjacent to staffing** (not a full HRIS replacement)  
- Knowledge bound to work  
- Organization parent + explicit multi-facility access  
- A vendor-run Department is controlled by its operator, who owns that period's data. Vendor accounts open the Departments their company runs. The relationship stays date-effective.  
- Commercial licensing of **operational departments** (not seats)  
- Design system and navigation zones that enforce the above  

---

## What does not belong

See also [07_PRODUCT_BOUNDARIES.md](./07_PRODUCT_BOUNDARIES.md).

We do **not** become:

- An EHR / EMR / clinical documentation system  
- Payroll or full HRIS  
- General ledger / accounting ERP  
- Messaging-first collaboration suite  
- Inventory accounting / warehouse WMS  
- Generic project-management / ticket SaaS divorced from operations  
- Analytics-as-home (BI warehouse first UX)  

**Integrations later; ownership never by default.**

---

## Decision hierarchy

When conflict arises, prefer — in order:

1. **Floor operability** (can staff finish the meal / round safely?)  
2. **Facility data integrity** (correct facility, department, timezone)  
3. **Role clarity** (right person sees right surface)  
4. **Canonical terminology** (see Language Guide)  
5. **Home composition** (Workspace / OC / Today / Unit keep distinct jobs)  
6. **Engine purity** (do not copy readiness/issue rules into a second home)  
7. **Feature richness**  

No feature may violate (1)–(3) to satisfy (7).

---

## Product philosophy

Vssyl is an **operational platform**, not a module menu.

The story of a day:

```text
Operational Cycle (what window is active)
  → Work and Records (what the window requires)
  → Execution at the place
  → Audit / Reports (what was expected, and what was recorded)
```

Supervisors and above begin in the **Dashboard**.  
Floor staff begin in **Unit Workspace** (or logs if no unit is locked).  
**Operations Center** is a retired peer destination. Site awareness lives on the Dashboard. Detail lives in the area that owns it.

---

## Long-term direction

1. Finish **platform language** (industry/neutral configuration) without scattering “Wave 12” meaning.  
2. Deepen **multi-facility** safely (access already explicit; rollups later).  
3. Grow **adjacent departments** through readiness profiles and mode lenses — not forked apps.  
4. Keep **AI** as moments on OC / Today / Issues / cached Workspace peek.  
5. Add **supply / communications / inventory** only as **operational signals**, never as accounting systems of record.

---

## Commercial model

Vssyl is sold as **one product**. Price scales with the operational footprint we support, not with how many people the facility allows to log in.

Binding numbers, setup-fee rules, and Stripe catalog shape: [11_COMMERCIAL_MODEL.md](./11_COMMERCIAL_MODEL.md) (ADL-013).

---

## Governance

- Changing this constitution requires an explicit product decision (documented ADR or constitution revision).  
- Implementation waves cite which constitution clauses they serve.  
- Ambiguous feature placement uses [09_PRODUCT_DECISION_MODEL.md](./09_PRODUCT_DECISION_MODEL.md).
- **User.id** is the global person identity. **Employee** is a Facility workforce record linked by `Employee.userId` (nullable). One User may have many Employees; at most one Employee per User per Facility, including terminated. Every newly created production Employee is represented by a Vssyl User. PIN is workplace authentication for that Employee context, not a separate human identity. Historical unlinked Employees remain transitional until migration. Internal Facility RoleKey is historically effective on the User↔Facility grant (`UserFacilityRolePeriod`), not on `User.roleId` or `Employee.roleType`. `Employee.roleType` is PIN/workforce classification. Employment termination ends that Facility's workforce and internal grant only — it does not disable the User. Internal access may exist without an Employee. PIN remains Employee-owned. See [USER_EMPLOYEE_IDENTITY_LINK_PHASE_2E2_2026-10-10.md](../security/USER_EMPLOYEE_IDENTITY_LINK_PHASE_2E2_2026-10-10.md).
- **Available Context** is a current enterable workspace relationship for a User: Organization membership, internal Facility access, or partner Facility access. Discovery is `listAvailableContexts`. The list is not authority; later entry must revalidate live. Employee, PIN, Harbor, Department, and corporate topology are not contexts. Internal and partner contexts at the same Facility stay separate. See [AVAILABLE_CONTEXT_RESOLVER_PHASE_2E4_2026-10-10.md](../security/AVAILABLE_CONTEXT_RESOLVER_PHASE_2E4_2026-10-10.md).
- **Account Session** is an authenticated User with no selected workspace. **Context Session** is exactly one Organization, internal Facility, or partner Facility context. `enterContext` live-revalidates the requested target and mints an exclusive session. Identity validity (User exists, active, `sessionVersion`) is separate from context validity. Identity-valid / context-invalid recovers to an account session and My Access (`/access`); identity-invalid still signs out to `/login`. PIN and Harbor stay excluded. See [ACCOUNT_SESSION_PHASE_2E5_2026-10-10.md](../security/ACCOUNT_SESSION_PHASE_2E5_2026-10-10.md).
- **My Access** (`/access`) is where a User can work: the directory of current enterable contexts. Rows come only from `listAvailableContexts`. Open posts `contextKey` to `enterContext`. Viewing the page does not leave the current workspace. See [MY_ACCESS_UI_PHASE_2E6_2026-10-10.md](../security/MY_ACCESS_UI_PHASE_2E6_2026-10-10.md).
- **Organization Portfolio** (`/organization/<id>`) is the Facilities and operating relationships visible to the current Organization. Owned Facilities come from `Facility.organizationId`. Client Facilities come from a current `FacilityPartnerOrganization`. Operating departments come from `DepartmentOperatorRelationship`. Portfolio visibility is not Facility authority. Personal Open uses a matching Available Context and `enterContext`. PIN and Harbor stay excluded. See [ORGANIZATION_PORTFOLIO_PHASE_3A_2026-10-11.md](../security/ORGANIZATION_PORTFOLIO_PHASE_3A_2026-10-11.md).
- **Organization membership** is affiliation with an Organization (`ORG_ADMIN` / `ORG_MEMBER`). **Client assignment** is Organization-governed partner Facility access when Facility delegation permits it. An Organization member is not a client Facility assignment. Members remains membership governance; ORG_ADMIN may manage client assignments from a member row. Clients remains facility-first staffing. Both directions use the same partner staffing services. See [ORGANIZATION_MEMBER_CLIENT_ASSIGNMENT_PHASE_3B_2026-10-11.md](../security/ORGANIZATION_MEMBER_CLIENT_ASSIGNMENT_PHASE_3B_2026-10-11.md).
- **My Account** (`/account`) is who the User is and how they sign in. `User.displayName` is global presentation identity; a name change is non-revoking and remints the current User session. Employee names stay Facility workforce facts. Password change and Sign out everywhere increment `User.sessionVersion` and end every User JWT, including this browser. PIN and Harbor stay excluded. See [GLOBAL_USER_NAV_ACCOUNT_PHASE_2E8A_2026-10-10.md](../security/GLOBAL_USER_NAV_ACCOUNT_PHASE_2E8A_2026-10-10.md) and [GLOBAL_USER_PROFILE_SECURITY_PHASE_2E8B_2026-10-10.md](../security/GLOBAL_USER_PROFILE_SECURITY_PHASE_2E8B_2026-10-10.md).
- **Current context** is the workspace the User is presently acting within. Shell menus may display it from the live session plus already-loaded names. Display is not authority.
- **Password login** authenticates the global User, then `routeAuthenticatedUser` lands them from live available-context count: 0 or many → account session `/access`; exactly one → live `enterContext`. Login does not classify facility-native vs organization-only Users and does not repair grants from `User.facilityId` / `User.roleId`. PIN and Harbor stay outside this router. See [LOGIN_CONTEXT_ROUTING_PHASE_2E7_2026-10-10.md](../security/LOGIN_CONTEXT_ROUTING_PHASE_2E7_2026-10-10.md).
- **Onboarding and invite completion** follow explicit intent: signup, signup verification, Facility account invite, Organization member invite, and Organization claim enter the exact created/accepted context through `enterGrantedContext` → `enterContext`. Identity-only Employee↔User linkage preserves the current session. See [ONBOARDING_CONTEXT_ENTRY_PHASE_2E7B_2026-10-10.md](../security/ONBOARDING_CONTEXT_ENTRY_PHASE_2E7B_2026-10-10.md).
