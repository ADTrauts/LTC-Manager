# New Department Product implementation guide

**Status — CURRENT.** Use this guide with the [Department Product contract](13_DEPARTMENT_PRODUCT.md), [Department Builder](16_DEPARTMENT_BUILDER_ARCHITECTURE.md), and the [engine registry](15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md). The [Constitution and accepted amendments](README.md) govern product intent. The [schema](../../prisma/schema.prisma), services, and tests establish what ships.

## 1. Define the Product and its boundaries

| Concept | What it owns |
| --- | --- |
| Platform | Shared engines and their data, identity, authority, Build, Run, and Audit contracts |
| Department Product | Vssyl-authored operating model with a stable registry identity and optional starters and domain capabilities |
| Installed Facility Department | Facility-scoped `Department` row with a local name, stable installation key, and its own people and configuration |
| Marketplace item | Optional content applied inside a Department. Records forms are implemented through Catalog install and attachment. Marketplace distribution of Rhythm starters and Menu templates is an approved design. |
| Facility-local configuration | Explicit place participation, published Rhythm, requirements, staffing, Menus or maintenance plans held by their individual owners |
| Product-specific extension | A genuinely distinct domain, such as Menus. Its UI plugs into the common shell and its facts stay in the owning domain. |

Fill the [blueprint](13_DEPARTMENT_PRODUCT.md#department-product-blueprint). Name the operation, who performs it, where, the decisions they make, and what must be reconstructable for a service date. For each optional engine say what it contributes or mark it not applicable. For every new persisted fact, name its owner and explain why existing mechanisms cannot express it.

## 2. Register and exercise the Product

1. Add a stable Product key and entry in [the Product registry](../../src/lib/department-products/registry.ts). Start at `DEVELOPMENT`. Specify the installation key, default local name, industry and facility-type metadata, display order, and only supported starter references. Use `domainCapability: null` for a shared-engine-only Product. The typed capability and starter references require explicit wiring for a new kind. They are compiled application contracts.
2. Resolve Product identity through the registry. Food and Nutrition illustrates one lineage with a separate installation key. A rename is local. [Facility classification](../../src/lib/facility-classification.ts) describes applicability. It grants no entitlement or authority.
3. Use [install.ts](../../src/lib/department-products/install.ts) to materialize or reuse the Facility Department. Use the explicit internal-development installation path only for authorized synthetic fixtures or internal workflows. Adding a registry row does not seed all Facilities. [The cycle starter adapter](../../src/lib/department-products/cycle-starter.ts) resolves supported starter references. Apply starters through their owning configuration services after install. Exercise preview, repeat application, and explicit publication where supported.
4. Use [Department Builder navigation](../../src/lib/department-administration/admin-nav.ts) and [the existing Department page](../../src/app/(protected)/admin/departments/%5BdepartmentId%5D/page.tsx). Configure the common sections. Add a dedicated section only for a real Product extension. Leave optional configuration empty where appropriate. An empty configuration creates no operational exception.
5. Extend shared reads through their actual owners. [Job Flow contributors](../../src/lib/employee-runtime-flow/load-canonical-contributors.ts) assemble authorized employee facts. [Runtime Location State](../../src/lib/runtime-location-state/) and [Space workspace](../../src/lib/unit-workspace/space/) assemble location facts. [Dashboard capabilities](../../src/lib/dashboard/capabilities.ts), [attention mappers](../../src/lib/dashboard/attention-mappers/), and [platform card registry](../../src/lib/dashboard/cards/registry.ts) compose authorized, Department-scoped facts. Use the same source for counts and drill-down. Declare the capability, source, audience, empty state, and destination in the [Dashboard contract](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md#dashboard-contribution-declarations).

## 3. Reuse the owning engines

| Engine and authoring owner | Stored facts and supported extension |
| --- | --- |
| [Facility Builder](../../src/lib/facility-builder/) | Facility, Unit hierarchy, `UnitSpace`, physical `FacilityRoomType`, and Unit/Space Department responsibility. Filter a picker by physical type, then store canonical IDs in the consuming owner. Responsibility and descriptive notes carry no requirements, workforce placement, or permission. |
| [Operating Rhythm](../../src/lib/operational-cycles/cycle-service.ts) and [Operational Time](../../src/lib/operational-time/) | Effective-dated `DepartmentOperationalCycle` periods, phases and Key Points, explicit place scope, and day expectations, actuals and adjustments where configured. Reuse publication, facility-local service-date resolution, and Key Point occurrence modes. Keep evidence and staffing with their owners. |
| [Records Catalog and attachment services](../../src/lib/canonical-logs/) | `CatalogLogDefinition` → `FacilityCatalogInstall` → `LogAttachment` → `OperationalEvidenceRecord`. Use the existing definition, placement, applicability and submission services. Requirements can target Facility, Department, Unit, Space or Asset as supported by the chosen schedule. Slots are derived. Waiver, correction and follow-up preserve original evidence. |
| [Employee identity](../../src/lib/employee-identity/) and [membership](../../src/lib/employee-membership/) | Employee Builder owns employee identity, HR title, and Department membership. [Operational role registry](../../src/lib/scheduling/assignment-roles/index.ts) plus `EmployeeOperationalRoleQualification` establishes eligibility. Authorization stays with the platform role and scoped grants. |
| [Teams](../../src/lib/department-teams/) | Employee Builder owns `DepartmentTeam`, employee membership/leadership and explicit `DepartmentTeamRoomMembership`. Use the team service and the room picker. A Supervisor Team lens can filter approved reads to those rooms. It creates no authorization, demand, qualification, or Assignment. |
| [Coverage](../../src/lib/scheduling/coverage-expectations/) | People & Coverage authors explicit Unit or Space needs as effective-dated templates/items, including role, count and time or Cycle scope. The evaluator compares need with staffing and owns Coverage episodes and transitions. Missing need creates no shortfall. |
| [Assignments](../../src/lib/scheduling/operational-assignments/) | Workforce owns plans, assigned employee, registry role and label, service date, canonical locations, instructions, completion and reopen events. Use the existing board and lifecycle. Zones can help choose a set of places at authoring time. Persist the Assignment's location snapshot. Use [Space offline](../../src/lib/offline/space/) for supported commands and receipt replay. Shifts and attendance remain separate workforce facts. |
| [Assets and Issues](../../src/lib/asset-operations/) | Asset Builder maintains shared identity, place, ownership and maintenance relationships. Issues own condition/triage and issue evidence links. Use existing Asset/Issue services. An Issue does not imply a Work Order or its resolution. |
| [Work Orders](../../src/lib/asset-operations/work-order-service.ts) | Maintenance owns `Repair` lifecycle and technician, target, closeout, evidence links and costs. Use the existing Work Order authorization and transition services. A technician assignment is a Work Order fact. |
| [Preventive Maintenance](../../src/lib/preventive-maintenance/) | Plant Maintenance owns `PreventiveMaintenancePlan`, published plan versions and generated occurrences. Reuse its scheduler, occurrence and Work Order services. PM is separate from Operating Rhythm. |
| [Notifications and Attention](../../src/lib/notifications/) | Shared event policy, outbox, recipient authority and delivery. Publish from the owning domain, use shared delivery and deduplication, and keep domain facts in the originating engine. [Scheduled Evaluation](../../src/lib/scheduled-evaluation/) is implemented. Check the active deployment configuration before depending on scheduled delivery. |
| [Dashboard](../../src/lib/dashboard/) | Platform layouts, eligibility, attention mapping, and viewer-specific composition. Layout preferences are UI state. Read operational facts from the owner under the viewer's authority. |
| [Audit / Review](../../src/lib/audit/) | Historical read composition over effective configuration, outcomes and events. Extend the domain history that supports the question. Preserve service date, attribution and stable references where the owner supports them. Avoid claiming historical reconstruction for a fact without an effective history contract. |

## 4. Install, authorize, and release

- `DEVELOPMENT` stays out of customer browse, purchase, install and operation. `AVAILABLE` permits customer selection. `RETIRED` blocks new sale and installation and can retain already installed, entitled access. [Eligibility](../../src/lib/department-products/eligibility.ts) and [Facility catalog loading](../../src/lib/department-products/load-facility-catalog.ts) also check installation, activation, billing and entitlement. Industry labels do not grant access.
- Customer selection uses [billing add-departments](../../src/lib/billing/add-departments.ts), [subscription application](../../src/lib/billing/apply-stripe-event.ts), and [entitlement reconciliation](../../src/lib/department-products/reconcile.ts). Checkout owns commercial state. Installation owns the local row and initial operator relationship. Preserve idempotency and the existing installation key.
- Resolve Facility, Department and effective operator on the server. Use [Department authority](../../src/lib/department-authority/) and the [write manifest](../../src/lib/department-authority/write-manifest.ts) for every new Department write entry point. The [authority program](../contracted-departments/README.md) governs self-operated, vendor-operated, and Facility Administrator views. The operator's authorized head/team owns operations. Facility Administrator governance and read scopes remain separate. Enforce foreign Facility, other Department, out-of-period and vendor boundaries in queries and writes. Marketplace visibility, a Team lens, or a room assignment grants no role.
- Use a single Facility tree, shared Cycle and Records owners, and shared operational authorization. Generic Work, Location Functions, Operational Types, Room Archetypes, Operational Profiles, and Department Job Role capability packages are retired. Room type is descriptive. Readiness, obligations and evidence arise from explicit owner configuration.
- Publish an AVAILABLE Product only through the product release decision. Verify entitlement/install, product-specific authority, the Dashboard contribution, no-config behavior, and real runtime and Audit paths for the capabilities being offered.

## 5. Examples

| Product | Pattern |
| --- | --- |
| **Food and Nutrition — AVAILABLE** | One Healthcare Product, persisted under `DIETARY`. [Dietary starters](../../src/lib/operational-cycles/dietary-starter.ts) configure meal periods, phases and Key Points. Records and employee qualifications reuse shared owners. Menus are a genuine extension. [Menu resolution](../../src/lib/menu-runtime-db.ts) uses explicit locations and a root Cycle stable key plus Menu period. |
| **Facility Plant Operations — AVAILABLE** | The [Plant contract](14_FACILITY_PLANT_OPERATIONS.md) uses shared Assets, service requests, Issues, Work Orders, and PM. [Optional Plant starters](../../src/lib/department-products/plant-starter.ts) use the existing Records and PM owners. There is no Plant Rhythm starter. Use a Work Order for maintenance execution and PM for scheduled maintenance. |
| **Environmental Services — DEVELOPMENT** | [EVS Cycle starters](../../src/lib/operational-cycles/evs-starter.ts), EVS registry qualifications, explicit multi-Space Assignment snapshots, reusable Zones and scoped employee execution are implemented. Internal [EVS browser](../../tests/evs-browser/ci-gate.spec.ts) and [Assignment browser](../../tests/evs-assignment-browser/ci-gate.spec.ts) specs exercise paths under synthetic configuration. The [EVS status](../evs/README.md) lists remaining release evidence. Advanced turnover workflows or bed readiness require a product decision and a separate domain-gap assessment. |
| **Laundry — illustrative** | Reuse explicit service spaces, Rhythm for collection/delivery windows, Records for checks, Workforce for roles and placement, Assets/Work Orders/PM for equipment, and shared Run/Audit. Consider a distinct capability only if a real workflow needs ownership of a linen batch, custody, or inventory balance that existing owners cannot provide. Define the need before choosing a model. |

## 6. Verification and checklist

Start on a feature branch from GitHub `main`. Follow the [local development and release guide](../engineering/LOCAL_DEVELOPMENT_AND_RELEASE.md). The [Verify workflow](../../.github/workflows/verify.yml) runs Static and hermetic, Database integration, Offline browser gate, Assignment browser gate, and Dietary pilot gate.

| Exercise | Existing checks |
| --- | --- |
| Registry, release status, install and customer isolation | [Product tests](../../src/lib/department-products/), including [eligibility](../../src/lib/department-products/eligibility.hermetic.test.ts). Run `npm run test:hermetic` and `npm run verify:db`. |
| Authority and manifest | [Write-manifest tests](../../src/lib/department-authority/write-manifest.hermetic.test.ts). Exercise authorized mutation, view-only and foreign Facility/Department denial through real endpoints. |
| Build → persisted configuration → Run and Audit | `npm run test:operational-cycles-browser`, `npm run test:operational-evidence-browser`, `npm run test:assignment-browser`, `npm run test:coverage-builder-browser`, and `npm run test:dashboard-browser` as applicable. Check configured, unconfigured, and historically effective states. |
| Product-specific and offline | `npm run test:dietary-pilot`, `npm run test:plant-browser`, `npm run test:evs-browser`, `npm run test:evs-assignment-browser`, or `npm run test:offline-browser` when relevant. For a supported offline command, verify scope, replay, single effect/receipt, and stale-authority behavior. |
| Repository and staging | `npm run verify:static` and a protected Preview using synthetic staging data. Use a disposable `VERIFY_DATABASE_URL` for SQL and browser suites. Verify any migration on that database before release. |

**Required for every Product**

- [ ] Complete the blueprint and state the canonical owner of every new fact.
- [ ] Register as DEVELOPMENT. Verify customer exclusion and idempotent internal installation.
- [ ] Reuse server eligibility, Facility/Department scoping, operator authority and the write manifest.
- [ ] Document configuration, empty states, Run composition, historical questions and Dashboard contributions for the capabilities the Product offers.
- [ ] Pass the relevant vertical and negative tests and all required PR checks. Capture evidence on a protected Preview before any release decision.

**Add only where applicable**

- [ ] Starter drafts, shared Roles/qualifications, Teams and Coverage, Cycles/Key Points, Records attachments, Menus, maintenance or another approved domain capability.
- [ ] A supported offline command, notification policy, or new Audit view when the workflow requires one.
- [ ] An explicit architecture decision for a genuinely missing shared mechanism before introducing a new owner.
