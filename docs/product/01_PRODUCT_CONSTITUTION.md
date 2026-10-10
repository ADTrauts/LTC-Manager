# 01 — Product Constitution

**Status:** Current architecture authority  
**Certified through:** `06935aef0d2e257c1ff616694992f522360a83c1` (2026-10-02)  
**Current product identity:** **Vssyl — Business Operations Platform.** See [12 — Vssyl Brand](./12_VSSYL_BRAND.md).  
**Vocabulary:** [08 — Language Guide](./08_PRODUCT_LANGUAGE_GUIDE.md)  
**Department Product contract:** [13 — Department Product](./13_DEPARTMENT_PRODUCT.md)  
**Facility Plant Operations architecture:** [14 — Facility Plant Operations](./14_FACILITY_PLANT_OPERATIONS.md)  
**Compatibility systems:** [Legacy Surface Register](./LEGACY_SURFACE_REGISTER.md)  

This document is the one current map. Deeper documents explain a layer. Dated `LTC_MANAGER_*.md` files, wave roadmaps, and domain guidebooks are historical or operational references. They do not override this constitution.

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
| **Facility configuration** | Which rooms are bound, local times, published plans, people, installed departments | Product identity (`functionKey`, catalog definitions) |
| **Run** | What is true in the current operation | Permanent configuration |
| **History / Audit** | Expected versus actual for a requested service date, using the configuration effective that day | A central history ledger |
| **Governance** | Organization, facility access, licensing, permissions | Day-of operational truth |

### Implementation status

| State | Meaning here |
|-------|----------------|
| **Implemented** | Healthcare Food & Nutrition as the customer-visible Department Product, Location Function binding, Operational Cycles, Work projection, one Record engine, Audit / Reports, Assets and repairs as they exist today |
| **Legacy compatibility** | Systems in the [Legacy Surface Register](./LEGACY_SURFACE_REGISTER.md). Readable. Not the forward architecture. |
| **In development** | Environmental Services and Facility Plant Operations exist in the registry, tests, and internal tooling. They are not customer-visible until marked AVAILABLE. |
| **Designed, not implemented as a customer Product** | Facility Plant Operations architecture is locked in [14](./14_FACILITY_PLANT_OPERATIONS.md). Platform Assets and repairs are shared mechanisms; they are not that Product. Implementation has not started. |

A Product existing in the Vssyl registry does not make it customer-visible. Customer visibility requires AVAILABLE release state. See [13 — Department Product](./13_DEPARTMENT_PRODUCT.md).

### Shared mechanisms

**Physical world.** One Facility tree: Facility → structural Units → neighborhoods / operational Units → Rooms / Spaces. Departments do not clone the building. Facility Builder owns physical hierarchy, physical room type, and physical names.

**Location Functions.** The Product defines `functionKey` and the product label. The facility binds those functions to existing rooms on a Department profile. Runtime matches `functionKey`. Build reads the working profile. Run reads the ACTIVE profile. Audit reads the profile effective on the service date. An empty binding set matches no rooms. Dietary `food_service_area` and EVS `service_support` on the same room are independent.

**Operational Rhythm.** An Operational Cycle is a root recurring window. A Phase is one interval inside that Cycle. A Key Point is an instant on the Cycle. Occurrence tracking is NONE, OPTIONAL, or REQUIRED. Current cycles are derived. Cycles may overlap and may cross midnight. Phases may overlap and may leave gaps. Key Points are not Work.

**Work.** Product preset → facility Work Plan → publish → derived WorkRequirement → optional Assignment → sparse WorkOccurrence. Assignment does not create Work. Work may bind to a Cycle or a Phase. An empty Cycle binding means not configured.

**Records.** One engine. Manager forms are Reading, Checklist, Inspection, Acknowledgement, and On-demand Record. The forward fact is `OperationalEvidenceRecord`. Definition → facility requirement segment → derived expected slot → Record or permitted waiver → correction / follow-up. Missing expected Records are derived. Procedures are knowledge, not Records.

**Dietary timing.** Meal Due is a Key Point with tracking NONE. Ready and Service Started are Dietary Key Points with tracking REQUIRED at LOCATION grain. The canonical actual is `OperationalCycleKeyPointActual`. A service date has one authoritative timing source.

**History.** No central ledger. Log Book is submitted Records. Asset History is source facts about an Asset. Location History is source facts about a Place. Audit / Reports compares expected and actual across a range. Selectors use the configuration effective on the requested service date.

### Product workspaces

**Build / Department Builder:** Overview, Locations, Operating Rhythm, Work, People & Coverage, Records. Healthcare Food & Nutrition also has Menus. Assets and Procedures appear only where a real configurable capability exists.

**Facility Builder:** physical structure only.

**Run:** current operation — Dashboard, Locations, Employees / Assignments, Log Book, Assets, today’s Operational Rhythm, and access to Audit / Reports. Permanent configuration stays in Build.

**Audit / Reports:** manager-facing name. Review is not a workspace. The route may remain `/reports`. Internal code may still say Review.

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

Vssyl is the **operations home for multi-node service environments**: many locations, many shifts, multiple departments (Healthcare Food & Nutrition, EVS, Plant, and future modes), across long-term care and adjacent dining/hospitality environments.

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

Operations Engine, Work Engine, and Readiness are **substrate**. Business Workspace, Operations Center, Today's Work, and Unit Workspace are **homes**. Homes compose engines; they do not re-implement domain rules.

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
- Manager daily home (Business Workspace) composing those signals  
- Department operational modes via Vssyl-defined Department Products (Healthcare Food & Nutrition, EVS, Plant…) that a facility selects, licenses, then installs
- Assets / vendors as operational equipment context  
- Employee roster and operational HR **adjacent to staffing** (not a full HRIS replacement)  
- Knowledge bound to work  
- Organization parent + explicit multi-facility access  
- Department operating Organization as date-effective governance metadata (does not grant Facility access)  
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

Managers begin in **Business Workspace**.  
Supervisors begin in **Today's Work**.  
Floor staff begin in **Unit Workspace** (or logs if no unit is locked).  
**Operations Center** is a retired peer destination. Site awareness lives on Dashboard and Today's Work.

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
- **User.id** is the global person identity. **Employee** is a Facility workforce record linked by `Employee.userId` (nullable). One User may have many Employees; at most one Employee per User per Facility, including terminated. Internal Facility RoleKey is historically effective on the User↔Facility grant (`UserFacilityRolePeriod`), not on `User.roleId` or `Employee.roleType`. `Employee.roleType` is PIN/workforce classification. Employment termination ends that Facility's workforce and internal grant only — it does not disable the User. Internal access may exist without an Employee. PIN remains Employee-owned. See [USER_EMPLOYEE_IDENTITY_LINK_PHASE_2E2_2026-10-10.md](../security/USER_EMPLOYEE_IDENTITY_LINK_PHASE_2E2_2026-10-10.md).
- **Available Context** is a current enterable workspace relationship for a User: Organization membership, internal Facility access, or partner Facility access. Discovery is `listAvailableContexts`. The list is not authority; later entry must revalidate live. Employee, PIN, Harbor, Department, and corporate topology are not contexts. Internal and partner contexts at the same Facility stay separate. See [AVAILABLE_CONTEXT_RESOLVER_PHASE_2E4_2026-10-10.md](../security/AVAILABLE_CONTEXT_RESOLVER_PHASE_2E4_2026-10-10.md).
- **Account Session** is an authenticated User with no selected workspace. **Context Session** is exactly one Organization, internal Facility, or partner Facility context. `enterContext` live-revalidates the requested target and mints an exclusive session. Identity validity (User exists, active, `sessionVersion`) is separate from context validity. Identity-valid / context-invalid recovers to an account session and My Access (`/access`); identity-invalid still signs out to `/login`. PIN and Harbor stay excluded. See [ACCOUNT_SESSION_PHASE_2E5_2026-10-10.md](../security/ACCOUNT_SESSION_PHASE_2E5_2026-10-10.md).
- **My Access** (`/access`) is the User-facing directory of current enterable contexts. Rows come only from `listAvailableContexts`. Open posts `contextKey` to `enterContext`. Viewing the page does not leave the current workspace. See [MY_ACCESS_UI_PHASE_2E6_2026-10-10.md](../security/MY_ACCESS_UI_PHASE_2E6_2026-10-10.md).
