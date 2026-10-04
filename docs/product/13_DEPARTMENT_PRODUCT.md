# 13 — Department Product

**Status:** Binding product/architecture rule  
**Does not:** Persist Facility Industry, add a second industry, redesign Stripe SKUs, delete Department history, or start Plant Operations / EVS product design

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
| Dietary | AVAILABLE |
| Environmental Services | DEVELOPMENT |
| Plant Operations | DEVELOPMENT |

Vssyl Console owns the Records / Logs catalog, not Department Product release metadata. Department Product release state lives on the code registry until Console-backed product metadata exists.

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

---

## Sources of truth

| Question | Source of truth |
|----------|-----------------|
| What Department Products has Vssyl developed? | Department Product Registry |
| Which of those are customer-visible? | Registry `status === AVAILABLE` |
| What products did this facility purchase? | `FacilityDepartmentEntitlement` |
| What Departments are installed? | `Department` |
| Which Departments may a customer enter? | Eligibility: AVAILABLE or entitled RETIRED + valid entitlement + installed + active |
| Is an installed Department admitted / enabled? | `Department.isActive` |
| What is locally configured? | Existing facility-scoped Build models |

Installation creates the operational Department. It does not invent local facility configuration (locations, operating times, membership, work, or Records).

Department Builder is the post-install configuration home:

Overview, Locations, Operating Rhythm, Work, People & Coverage, Records.

Dietary also has Menus. Vssyl provides product-owned operating-rhythm starters where a product has one. The customer applies those starters explicitly, edits local facts, and publishes them. Nothing is auto-published.

Configuration readiness is derived from those operational facts. Do not persist `CONFIGURED` / `UNCONFIGURED` / `SETUP_COMPLETE` on Department.

`Department.isActive` means the Department is enabled for shared operations. It does not mean licensed, configured, ready, or healthy. All Departments should say **Enabled**, not “operationally active.”

---

## Ownership

| Concept | Owner | Persistence |
|---------|--------|-------------|
| **Department Product** | Vssyl Inc. | Code registry (`src/lib/department-products/`) |
| **Entitlement** | Commercial authorization | `FacilityDepartmentEntitlement.departmentKey` |
| **Department** | Facility installation | Existing `Department` row (`facilityId` + `key`) |
| **isActive** | Operational state | `Department.isActive` |

`Department.key` for the registry trio (`DIETARY`, `EVS`, `PLANT`) is the installation key **and** the product key. Existing facility rows with those keys remain installations. No backfill, no retroactive charges, no automatic entitlements for legacy rows. DEVELOPMENT rows stay in the database; they are filtered out of customer pickers and Marketplace.

Industry currently classifies products in the registry (`healthcare`). It is catalog metadata only — not a Facility or Organization field and not a billing unit.

Do not revive retired industry packs (`applyIndustryPack()`).

---

## Shared catalog model

Marketplace and Admin installed-product context project from `deriveFacilityDepartmentCatalog` / `loadFacilityDepartmentCatalog`. The customer Department picker, Build, Run, and Admin installed list use `loadCustomerOperableDepartments` / `evaluateCustomerDepartmentOperability`.

- AVAILABLE products (DEVELOPMENT hidden; RETIRED not offered)
- installed products (Department rows)
- licensed products (ACTIVE entitlements)
- grandfathered UNMANAGED installs of AVAILABLE products while `BILLING_ENTITLEMENTS_ENABLED` is off
- available-to-add (`!installed && !licensed`)
- operable (`released + entitled + installed + active`)

No second catalog table. No installation status table. Adding Departments belongs in Admin → Departments → Marketplace, not the Department picker.

Future Plant completion is an explicit `PLANT` `DEVELOPMENT → AVAILABLE` registry change after certification and commercial configuration. It must not appear before that change.

---

## License then install

Checkout and add-departments accept **AVAILABLE Department Product registry keys**, not pre-existing Department rows. DEVELOPMENT keys are rejected.

After Stripe sync writes an ACTIVE (or PAST_DUE) entitlement, `installDepartmentsForActiveEntitlements` calls `installDepartmentProduct`. Installation is idempotent and reuses an existing row. It never mints `DIETARY_2`.

Incomplete / abandoned payment does not install. If payment succeeds and installation fails, a later webhook or billing sync retries the same reconcile.

`createFacilityDepartment` remains an internal primitive. It is not the customer Add Department path.

---

## Customer routes vs dev bootstrap

Normal customer routes no longer call `ensureDefaultDepartments`. Visiting Employees, All Departments, Department Settings, or saving onboarding locations does not install Dietary + EVS + Plant.

Location responsibility backfill uses only Departments that are already installed.

CLI / seed / provision may still bootstrap the original trio for local development.

---

## Admission vs registry

| Question | Answered by |
|----------|-------------|
| What operational products does Vssyl publish? | Department Product registry |
| Can this active facility Department use shared engines? | Open department admission (`isActive`) |

The registry is not a shared-engine allowlist.

---

## Local configuration after install

An **Operational Cycle** is the Department’s recurring operating rhythm. Persistence may still use DRAFT / PUBLISHED / RETIRED with effective dating. The facility publishes a draft to make it the ACTIVE profile.

Published **Operational Cycles** are the current Run rhythm. **Phases** are one-level intervals. **Key Points** (persisted as `KEY_TIME`) are instants, not Work and not Records. Occurrence tracking is NONE, OPTIONAL, or REQUIRED. Department responsibility does not imply cycle participation. Run may show an active Cycle with no active Phase when phases leave gaps. Legacy Dietary meal-milestone presentation must not override a current Cycle.

**Location Functions.** The Product owns `functionKey` and the label. The facility binds that key to existing rooms. Dietary’s function is `food_service_area`. EVS functions are `resident_care` and `service_support`. Plant defines none. Runtime matches the key on the ACTIVE profile. Build uses the working profile. Audit uses the profile effective on the service date. The same physical room may carry different functions for different Departments.

**Work.** Product Work presets copy into facility drafts when a manager applies them. They are never auto-published. A published Work Plan determines expected Work. Work may bind to a Cycle or Phase stable key. It does not bind to Key Points. An empty Cycle binding means not configured. Expected Work is derived from department-responsible locations, then applicability (including a Location Function key when used), then cycle participation when the item is cycle-bound. Assignment does not create Work. Occurrences stay sparse.

**Records.** One engine. A Product Record definition becomes a facility requirement segment. Expected slots are derived. The fact is `OperationalEvidenceRecord`. A permitted waiver, correction, and follow-up stay distinct from the Record. Run projects Location Function requirements through the same ACTIVE bindings Cycles and Work use.

Today’s Work combines the current Cycle with expected Work. Audit / Reports answers a service date. It is not a second Run.

Department Products that exist today:

| Product | Implemented | Not designed |
|---------|-------------|--------------|
| **Dietary** | `food_service_area`. Breakfast / Lunch / Dinner Cycles with Prep, Service, and Cleanup Phases. Key Points: Meal Due (NONE), Ready and Service Started (REQUIRED, LOCATION). Work presets bind Opening to Prep, Meal Service Support to Service, Leftover Handling to Cleanup. Station Reset is cycle-free. Menus. | — |
| **Environmental Services** | `resident_care`, `service_support`. Morning / Afternoon / Evening Operations. | A second location tree |
| **Plant Operations** | Platform Assets and repairs are available to any department that uses them. | The Plant Department Product: maintenance requests, work orders, PM programs, technician workflows, parts and vendors as a product design |

When Vssyl-authored Work belongs to a Phase, the preset binds that Work to the Phase stable key. Changing a preset affects future drafts only.

Configure Locations, Operating Rhythm, Work, People & Coverage, and Records in Department Builder. Physical rooms stay in Facility Builder.

---

## Department Product blueprint

Every new Department Product, starting with Plant Operations, must define these before implementation:

| Contract item | Question it answers |
|----------------|---------------------|
| Purpose | What operation this product runs |
| Location Functions | `functionKey` values and product labels. Empty is allowed. |
| Operating Rhythm | Cycle, Phase, and Key Point starters, including occurrence tracking. Empty is allowed. |
| Work presets | Starting Work and any Cycle or Phase binding |
| People / coverage needs | Teams and coverage the product expects |
| Record definitions | Forms: Reading, Checklist, Inspection, Acknowledgement, On-demand Record |
| Assets used | Which platform Assets the product relies on |
| Issues / exception rules | What becomes an Issue |
| Domain-specific capabilities | Only mechanisms the platform does not already have |
| Run requirements | What must be true during the current operation |
| Historical / Audit questions | What a past service date must be able to answer |
| Starter content | What install copies, and what stays unpublished until the facility publishes |
| Facility-configurable values | Times, room bindings, people, local labels |
| Platform-gap test | Which required behavior no existing Platform mechanism can express |

A Department Product does not receive a new location tree, Cycle engine, Work engine, Record engine, or history store unless that platform-gap test shows a missing reusable mechanism.

Plant Operations is the next product expected to use this contract. Designing it has not started.
