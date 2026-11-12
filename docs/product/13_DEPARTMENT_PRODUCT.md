# 13 — Department Product

**Status:** Binding product/architecture rule  
**Plug-in contract:** [Current foundation](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026), [01A](./01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md), [01B](./01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md). This document is what a Department is, and the blueprint a new Department Product must fill.  
**Does not:** Persist a second Facility Industry column, redesign Stripe SKUs, delete Department history, start EVS product design, or change Facility Plant Operations release status  
**Facility Plant Operations architecture:** [14 — Facility Plant Operations](./14_FACILITY_PLANT_OPERATIONS.md)

**Phase 1 note:** Do not add Location Functions or generic Work presets to a new Product blueprint. Residual registry `workPresets` / “Location Functions” customer strings are compatibility debt for Phase 2 code cleanup — not forward Product design.

---

## Release state

A product existing in the Vssyl registry does not make it customer-visible.

Customer visibility requires release status **AVAILABLE**.

| Status | Meaning |
|--------|---------|
| **DEVELOPMENT** | Internal only. May exist in source, Console, tests, seeds, and Harbor work. Not listed in Marketplace. Not selectable in the customer Department picker. Cannot be newly purchased. |
| **AVAILABLE** | Certified customer Product. Visible in Marketplace. Can be purchased / entitled and installed. |
| **RETIRED** | Not offered for new purchase or new install. Existing entitled installations remain. |

Current catalog:

| Product | Release status |
|---------|----------------|
| Food and Nutrition | AVAILABLE |
| Environmental Services | DEVELOPMENT |
| Facility Plant Operations (`PLANT`) | AVAILABLE |

Food and Nutrition is one Product. It is designed for Healthcare facilities of type Hospital and Long-Term Care. It is not `HOSPITAL_FOOD_NUTRITION` plus `LONG_TERM_CARE_FOOD_NUTRITION`, and it is not the generic Vssyl solution for every food-service business. Future food-service Products may use the same Platform mechanisms with different Operating Rhythm, Records, domain capabilities (for example Menus), and starter content — not Location Functions or generic Work.

A Department Product and a facility Department are not the same concept.

| Concept | Meaning | Example |
|---------|---------|---------|
| **Department Product** | Vssyl-authored operating model | Food and Nutrition |
| **Facility Department** | Local installed instance / local name | Food and Nutrition |

Healthcare is the industry, not part of the Product name. A new install is named Food and Nutrition. A facility may rename that Department. The Product identity does not change when the local name does.

Compatibility: the canonical Product key is `HEALTHCARE_FOOD_NUTRITION`. Existing Department rows and entitlements keep the installation key `DIETARY`. `DIETARY` resolves to Food and Nutrition and is not a second sellable Product.

Vssyl Console owns the Records / Logs catalog, not Department Product release metadata. Department Product release state lives on the code registry until Console-backed product metadata exists. When other Marketplace item kinds move into the Catalog, the Console publishes them too, and marks each item Included or Paid.

---

## Customer journey

```text
AVAILABLE Department Product
        ↓
Marketplace selection
        ↓
Commercial entitlement
        ↓
Facility installation
        ↓
Local configuration
        ↓
Run
```

Vssyl Inc. publishes Department Products. The customer chooses which **AVAILABLE** products a facility uses, licenses those products, then installs only the selected products.

```text
Choose Department Products
→ License
→ Install
→ Configure
→ Run
```

Do not invert this order. Selection may stay ephemeral until payment succeeds. Abandoned checkout creates no entitlement and no Department row. DEVELOPMENT products never enter this journey.

**Inside a Department (Foundation amendment, October 20, 2026).**
- Configure includes adding **Marketplace items** to the Department: Records forms, Operating Rhythm starters, and Menu templates (not Work presets).
- The Product's starter content is the items pre-selected for it.
- Each item is Included or Paid ([11](./11_COMMERCIAL_MODEL.md#marketplace-items)). A Paid item needs a valid purchase first.
- Items run on Platform engines. They never add one.
- Today only Records forms are Marketplace items. See the [Constitution amendment](./01_PRODUCT_CONSTITUTION.md#foundation-amendment--october-20-2026).

---

## Sources of truth

| Question | Source of truth |
|----------|-----------------|
| What Department Products has Vssyl developed? | Department Product Registry |
| Which of those are customer-visible? | Registry `status === AVAILABLE` |
| What products did this facility purchase? | `FacilityDepartmentEntitlement` |
| What Departments are installed? | `Department` |
| Which Marketplace items does a Department use? | Today: Records forms through `FacilityCatalogInstall` and `LogAttachment`. Other item kinds are not built. |
| Which Departments may a customer enter? | Eligibility: AVAILABLE or entitled RETIRED + valid entitlement + installed + active |
| Is an installed Department admitted / enabled? | `Department.isActive` |
| What is locally configured? | Existing facility-scoped Build models |
| What Industry / Facility Type is this facility? | Derived from `Organization.organizationType` and `Facility.vocabularyProfile` (`src/lib/facility-classification.ts`) |
| Which industries / facility types is a Product designed for? | Registry `industry` + `facilityTypes` |

Installation creates the operational Department. It does not invent local facility configuration (locations, operating times, membership, work, or Records).

Department Builder is the post-install configuration home:

Overview, Locations, Operating Rhythm, Work, People & Coverage, Records.

Food and Nutrition also has Menus. Menus are Department-owned identity records (`Menu`) with optional rotating-cycle content (`MenuCycleSettings` + `MenuItem`). Applicability is explicit: `MenuLocationApplicability` consumes canonical Department locations, and `MenuOperationalCycleApplicability` stores a root Operational Cycle `stableKey` plus a `menuPeriodKey` mapping to existing Menu content. They are not Cycles, Records, or Work, and they are not a facility-wide singleton. Runtime Menu resolution is implemented as `resolveApplicableMenus` in `menu-runtime.ts` / `menu-runtime-db.ts`. It answers which ACTIVE Menus apply at an exact location during a canonical root Operational Cycle on a facility service date, then loads that slot's content. It does not choose a winner, inherit neighborhood rooms, match MealType, bind `DepartmentOperationalCycle.id`, or snapshot historical Menu configuration. The first Run consumer is Today's Menu on the Space workspace Overview. Temperature/log integration is not implemented. Vssyl provides product-owned operating-rhythm starters where a product has one. The customer applies those starters explicitly, edits local facts, and publishes them. Nothing is auto-published.

Configuration readiness is derived from those operational facts. Do not persist `CONFIGURED` / `UNCONFIGURED` / `SETUP_COMPLETE` on Department.

`Department.isActive` means the Department is enabled for shared operations. It does not mean licensed, configured, ready, or healthy. All Departments should say **Enabled**, not “operationally active.”

---

## Ownership

| Concept | Owner | Persistence |
|---------|--------|-------------|
| **Department Product** | Vssyl Inc. | Code registry (`src/lib/department-products/`) |
| **Entitlement** | Commercial authorization | `FacilityDepartmentEntitlement.departmentKey` |
| **Department** | Facility installation | Existing `Department` row (`facilityId` + `key`) |
| **Operating Organization** | Facility Administrator chooses the operator. A vendor-run Department is controlled by that operator, who owns that period's data. | `DepartmentOperatorRelationship` (date-effective). |
| **Partner Organization** | Facility Administrator attaches a company that already exists. Vssyl Console creates the company and invites its first people. The invitation does not open the facility. | `FacilityPartnerOrganization` + access periods. |
| **Partner Department Scope** | Facility Administrator | `FacilityPartnerDepartmentScope` (timestamp periods). The Departments that company may operate here. |
| **isActive** | Operational state | `Department.isActive` |

New Department installs initialize an explicit facility-operated operator relationship (`organizationId = Facility.organizationId`) as of the install date. Contracted operators are configured under Admin → Departments → Manage → Operating organization.

External Facility partnerships are managed under Admin → Organization → Partners. Saving a partnership does not create the company, and it does not by itself open the facility to that company's people. After the company is attached and the head is accepted, vendor accounts open the Departments that company runs. They do not open Facility Builder, Administration, or another Department.

`Department.key` is the facility installation key. For Food and Nutrition it remains `DIETARY`. For EVS and Plant it matches the Product key. Existing facility rows with those keys remain installations. No backfill, no retroactive charges, no automatic entitlements for legacy rows. DEVELOPMENT rows stay in the database; they are filtered out of customer pickers and Marketplace.

Industry and facility-type applicability live on the Product registry (`HEALTHCARE`, `HOSPITAL`, `LONG_TERM_CARE`). They are catalog metadata for future Marketplace organization and recommendations. They do not grant visibility, entitlement, or installation.

Facility classification is derived from existing fields. Do not add `Facility.industry` or `Facility.facilityType` columns that duplicate `Organization.organizationType`.

Applicability / relevance ≠ release state ≠ entitlement ≠ installation.

Marketplace category tabs (Healthcare | Hospitality | Education) wait until more than one AVAILABLE Product justifies them.

Do not revive retired industry packs (`applyIndustryPack()`).

---

## Shared catalog model

Marketplace and Admin installed-product context project from `deriveFacilityDepartmentCatalog` / `loadFacilityDepartmentCatalog`. The customer Department picker, Build, Run, and Admin installed list use `loadCustomerOperableDepartments` / `evaluateCustomerDepartmentOperability`.

- AVAILABLE products (DEVELOPMENT hidden; RETIRED not offered)
- installed products (Department rows)
- licensed products (ACTIVE entitlements)
- grandfathered installed AVAILABLE products while `BILLING_ENTITLEMENTS_ENABLED` is off, including facilities already billed for another Product
- available-to-add (`!licensed && !operable`)
- operable (`released + entitled + installed + active`)
- Marketplace **Installed** means operable — the same customer meaning as Admin → Departments, not merely that a Department row exists

No second catalog table. No installation status table. Adding Departments belongs in Admin → Departments → Marketplace, not the Department picker.

Facility Plant Operations V1 became AVAILABLE on October 7, 2026 after whole-Product release certification. Billing/commercial packaging is a separate decision. Architecture is [14](./14_FACILITY_PLANT_OPERATIONS.md).

---

## License then install

Checkout and add-departments accept **AVAILABLE Department Product registry keys**, not pre-existing Department rows. DEVELOPMENT keys are rejected.

After Stripe sync writes an ACTIVE (or PAST_DUE) entitlement, `installDepartmentsForActiveEntitlements` calls `installDepartmentProduct`. Installation is idempotent and reuses an existing row. It never mints `DIETARY_2` or a second Food and Nutrition Department.

Incomplete / abandoned payment does not install. If payment succeeds and installation fails, a later webhook or billing sync retries the same reconcile.

`createFacilityDepartment` remains an internal primitive. It is not the customer Add Department path.

---

## Customer routes vs dev bootstrap

Normal customer routes no longer call `ensureDefaultDepartments`. Visiting Employees, All Departments, Department Settings, or saving onboarding locations does not install Food and Nutrition + EVS + Plant.

Location responsibility backfill uses only Departments that are already installed.

CLI / seed / provision may still bootstrap the original trio for local development.

---

## Admission vs registry

| Question | Answered by |
|----------|-------------|
| What operational products does Vssyl publish? | Department Product registry |
| Can this active facility Department use shared engines? | Open department admission (`isActive`) |
| Does an installed Product Department get its Product's capabilities? | Yes: install, plus a valid license when billing enforcement is on (Foundation amendment, October 20, 2026). Not a deployment switch. |

The registry is not a shared-engine allowlist.

Department capability switches are removed (LEG-D20). A Department key admits the shared engines: cycles, Job Flow composition, evidence/Records, and assets. Plant runtime follows install plus Harbor or customer-operable access. Assignments are part of every Department. Generic Work Plans are not a forward shared engine. `CANONICAL_LOGS_ENABLED` remains a separate switch. DEVELOPMENT products stay hidden from customers by release status. Progressive configuration applies ([01B Amendment F](./01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md#amendment-f--progressive-configuration-formal-platform-principle)).

---

## Local configuration after install

An **Operational Cycle** is the Department’s recurring operating rhythm. Persistence may still use DRAFT / PUBLISHED / RETIRED with effective dating. The facility publishes a draft to make it the ACTIVE profile.

Published **Operational Cycles** are the current Run rhythm. **Phases** are one-level intervals. **Key Points** (persisted as `KEY_TIME`) are instants, not Work and not Records. Occurrence tracking is NONE, OPTIONAL, or REQUIRED. Department responsibility does not imply cycle participation. Run may show an active Cycle with no active Phase when phases leave gaps. Legacy meal-milestone presentation must not override a current Cycle.

**Places.** Facility Builder owns the physical tree and Department responsibility. Product configuration aims Operating Rhythm, Records, Coverage, and Menus at canonical Unit / UnitSpace ids (or department-wide responsibility). **Location Functions are retired** — do not add `functionKey` catalogs to new Products ([01B](./01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md)).

**Generic Work.** **Retired.** Do not ship Work presets or Work Plans as Product content. Residual code/registry flags are Phase 2 cleanup.

**Records.** One engine. A Vssyl Catalog definition (`CatalogLogDefinition`) is installed (`FacilityCatalogInstall`) and placed as a facility requirement segment (`LogAttachment`) on canonical targets (`FACILITY` / `DEPARTMENT` / `UNIT` / `SPACE` / `ASSET`). Expected slots are derived. The fact is `OperationalEvidenceRecord`. A permitted waiver, correction, and follow-up stay distinct from the Record. Operational templates were dropped in LEG-06. They are not the next layer after the Catalog.

Job Flow is the employee's composition of the current Cycle window, Records due, Assignment context, and assigned maintenance. The Dashboard is the supervisor home. Audit / Reports answers a service date. None of these is a second Run.

Department Products that exist today:

| Product | Implemented | Not designed |
|---------|-------------|--------------|
| **Food and Nutrition** | Breakfast / Lunch / Dinner Cycles with Prep, Service, and Cleanup Phases. Key Points: Meal Due (NONE), Ready and Service Started (REQUIRED, LOCATION). Menus. Healthcare-scoped. Legacy Work presets / function keys may still exist in code as compatibility debt. | — |
| **Environmental Services** | Morning / Afternoon / Evening Operations starters (DEVELOPMENT). Legacy function keys may still exist in code. | A second location tree |
| **Facility Plant Operations** | AVAILABLE V1: Request / Issue / Work Order corrective loop, Preventive Maintenance, and optional unpublished starters. Platform Assets and repairs remain shared. See [14](./14_FACILITY_PLANT_OPERATIONS.md) and the [release addendum](../plant/FACILITY_PLANT_OPERATIONS_V1_RELEASE_CERTIFICATION_2026-10-06.md#release-addendum--2026-10-07). | Inventory, meter PM, IoT, predictive maintenance, and dedicated Product billing SKU. |

Configure Overview, Facility, Operating Rhythm, People & Coverage, Records (plus Menus or Preventive Maintenance) in Department Builder. Notification policy configures the shared engine; it does not send notifications. Physical rooms stay in Facility Builder. The engine contract is [16 — Notifications & Attention](./16_NOTIFICATIONS_AND_ATTENTION.md). The Builder contract is [16 — Department Builder Architecture](./16_DEPARTMENT_BUILDER_ARCHITECTURE.md).

---

## How to build one

A new Department Product is a registry entry plus the blueprint below. It is not a new application, and it does not receive its own copy of the platform.

Facility Plant Operations is the filled example: [14 — Facility Plant Operations](./14_FACILITY_PLANT_OPERATIONS.md). Environmental Services has not filled this contract.

1. Write every blueprint row before implementation.
2. Add the Product to `src/lib/department-products/registry.ts` with status **DEVELOPMENT**. Customers cannot see, buy, or install it until a separate decision marks it **AVAILABLE**.
3. Use the Platform engines: Facility responsibility + canonical places, Operational Cycles, Records, Assets and repairs, shifts, Assignments, Job Flow composition, and Notifications & Attention. Empty starters are allowed. Notification behavior is a published policy on the shared engine, not a Department notification engine. Do not add Location Functions or generic Work. A second engine is allowed only when the platform-gap row names a mechanism the platform does not have.
4. Put starter forms in the existing Catalog (`CatalogLogDefinition`). Do not add a template model or a second catalog.
5. Declare the Dashboard contribution. The Product contributes capabilities. It does not ship dashboard screens. The rules are the [Department Dashboard Contract](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md).
6. Classify every new Department write in `src/lib/department-authority/write-manifest.ts`. Who may run a vendor-run Department is already decided by the platform. The Product does not add roles or a separate partner application.
7. Do not add a capability environment switch. An installed Department receives the shared engines. Release status is what keeps a DEVELOPMENT Product away from customers.
8. Remain DEVELOPMENT until the blueprint, the Dashboard release gate, and the write classification are complete. Becoming AVAILABLE does not change price or sellability by itself.

A Department that needs its own engine, home, catalog, or authority model is a major change. Stop and decide that with the product owner before building it. After the decision, update this contract together with the [current foundation](./01_PRODUCT_CONSTITUTION.md#current-foundation--october-26-2026).

## Department Product blueprint

Every new Department Product must define these before implementation.

| Contract item | Question it answers |
|----------------|---------------------|
| Purpose | What operation this product runs |
| Place participation | How starters use department-wide responsibility and/or explicit canonical Unit/UnitSpace ids. **Do not** define Location Functions. |
| Operating Rhythm | Cycle, Phase, and Key Point starters, including occurrence tracking. Empty is allowed. |
| Work presets | **Do not define.** Generic Work is retired. |
| People / coverage needs | Teams and coverage the product expects |
| Record definitions | Forms: Reading, Checklist, Inspection, Acknowledgement, On-demand Record |
| Assets used | Which platform Assets the product relies on |
| Issues / exception rules | What becomes an Issue |
| Domain-specific capabilities | Only mechanisms the platform does not already have |
| Run requirements | What must be true during the current operation |
| Historical / Audit questions | What a past service date must be able to answer |
| Starter content | Which Marketplace items are pre-selected for the Department, what install copies, and what stays unpublished until the facility publishes |
| Facility-configurable values | Times, room bindings, people, local labels |
| Dashboard contributions | Which Dashboard capabilities and attention sources the product produces, its drill-down homes, and its "not configured" states. Products contribute capabilities, never dashboard UI. See the [Department Dashboard Contract](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md). |
| Notification policy | Which platform events this product expects the shared Notifications & Attention engine to watch, the default thresholds, protected categories, recipient reasons, escalation, and grouping. Empty is allowed. The product does not ship delivery. See [16](./16_NOTIFICATIONS_AND_ATTENTION.md). |
| Platform-gap test | Which required behavior no existing Platform mechanism can express |

A Department Product does not receive a new location tree, Cycle engine, Work engine, Record engine, history store, or notification engine unless that platform-gap test shows a missing reusable mechanism. Notification policy is not that missing mechanism.

A Department Product cannot become AVAILABLE, or ship a new operational capability, until its Dashboard contribution declaration and the [Dashboard release gate](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md#release-gate) are complete, and every new Department write is classified in the write manifest (`src/lib/department-authority/write-manifest.ts`). An unclassified write fails that test. Food and Nutrition and Facility Plant Operations were declared on October 20, 2026. The Environmental Services declaration is a draft.

Facility Plant Operations is implemented against this contract. Its architecture is [14](./14_FACILITY_PLANT_OPERATIONS.md). V1 is AVAILABLE as of October 7, 2026.
