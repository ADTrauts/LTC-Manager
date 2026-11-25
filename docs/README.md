# Vssyl documentation

Start with the [New Department Product implementation guide](product/NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md) for a Product, or the [local development and release guide](engineering/LOCAL_DEVELOPMENT_AND_RELEASE.md) for repository work. Use accepted decisions for architecture and the current schema, services and tests for shipped behavior.

## Current contracts

- [Product Constitution and accepted amendments](product/README.md)
- [Department Product contract](product/13_DEPARTMENT_PRODUCT.md) and [Department Builder architecture](product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md)
- [Platform Primitives & Engines Registry](product/15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md) and [source owner map](product/NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md#3-reuse-the-owning-engines)
- [Commercial model](product/11_COMMERCIAL_MODEL.md), [Department authority](contracted-departments/README.md) and [write manifest](../src/lib/department-authority/write-manifest.ts)
- [Dashboard contribution contract](dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md) and [Notifications & Attention](product/16_NOTIFICATIONS_AND_ATTENTION.md)

## Operational modules

| Work | Start here |
| --- | --- |
| Facility Builder, shared places and Department responsibility | [Facility section and ownership](product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md#facility-and-participation) · [Facility Builder source](../src/lib/facility-builder/) |
| Employee Builder, Teams, shifts, assignments and coverage | [Employee Builder](employee-builder/README.md) · [Eligibility](employee-builder/OPERATIONAL_ELIGIBILITY.md) · [People & Coverage boundary](product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md#people-teams-coverage-and-assignments) |
| Operating Rhythm and operational time | [Cycle service](../src/lib/operational-cycles/cycle-service.ts) · [Operational Time](../src/lib/operational-time/) |
| Records and Menus | [Records Catalog and attachments](../src/lib/canonical-logs/) · [Menus applicability](../src/lib/menu-runtime-db.ts) · [Product examples](product/NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md#5-examples) |
| Assets, Issues, Work Orders and PM | [Plant Product](product/14_FACILITY_PLANT_OPERATIONS.md) · [Shared asset operations](../src/lib/asset-operations/) · [PM services](../src/lib/preventive-maintenance/) |
| Run, Job Flow, Dashboard and Audit | [Runtime Location State](../src/lib/runtime-location-state/) · [Job Flow](../src/lib/employee-runtime-flow/) · [Dashboard contract](dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md) · [Audit reads](../src/lib/audit/) |
| Authorization and platform administration | [Contracted Department Authority](contracted-departments/README.md) · [Context entry](../src/lib/context-entry/) · [Vssyl Console implementation](../src/lib/harbor-console/) |
| Environmental Services | [Implemented building blocks and release gaps](evs/README.md) |
| Development, database and deployment | [Engineering workflow](engineering/LOCAL_DEVELOPMENT_AND_RELEASE.md) · [Canonical baseline and seed](architecture/PRELAUNCH_CANONICAL_BASELINE_2026-11-11.md) · [Verify workflow](../.github/workflows/verify.yml) |

## Approved future design

The [Phase 1 amendment](product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md) records optional Role Job Flow composition and temporal principles. The [Product contract](product/13_DEPARTMENT_PRODUCT.md) distinguishes the implemented Records Marketplace from intended distribution of Rhythm starters and Menu templates. Use the [status register](DOCUMENTATION_STATUS.md) to check whether a document is implementation guidance, an approved target, or evidence. A proposed feature needs acceptance before it becomes an approved target.

## Calendar and temporal architecture

The product owner accepted shared Operational Date Context as the initial direction. The [Calendar program](calendar/README.md) preserves the [CAL-00 discovery audit](calendar/CAL-00_TEMPORAL_ARCHITECTURE_AUDIT.md) and submits the [CAL-01 architecture contracts](calendar/CAL-01_ARCHITECTURE_CONTRACTS.md) for review. The [phase tracker](calendar/PHASE_TRACKER.md) records authorization. The accepted temporal projection target remains in Amendment 01B.

## Proposals under review

Harbor's approved sole-OWNER first release is feature-complete. See the [Harbor v1 closeout](console/HARBOR_CONSOLE_V1_CLOSEOUT.md) for the released scope, deliberately disabled features and focused verification. The documents below retain their original design/release checkpoints; a historical draft label does not supersede the closeout's release evidence.

- [Phase 5 customer offboarding request and review](console/HARBOR_CONSOLE_PHASE_5_OFFBOARDING_SCOPE.md)
- [Production browser push preparation](deployment/PRODUCTION_BROWSER_PUSH.md)
- [Internal staff invitations and independent recovery setup](console/HARBOR_STAFF_PRODUCTION_SETUP.md)
- [Five-minute shared scheduler activation draft](deployment/FIVE_MINUTE_SCHEDULED_EVALUATION.md)
- [Harbor Console Phase 5 customer-requested Record export draft](console/HARBOR_CONSOLE_PHASE_5_CUSTOMER_RECORD_EXPORTS.md)
- [Harbor Console staff authority architecture](console/HARBOR_CONSOLE_PHASE_1_STAFF_AUTHORITY_ARCHITECTURE.md)
- [Harbor Console Phase 1B Facility-scoped assistance](console/HARBOR_CONSOLE_PHASE_1B_FACILITY_ASSISTANCE_ARCHITECTURE.md)

## Historical evidence and open gaps

The [documentation inventory](DOCUMENTATION_STATUS.md) classifies every tracked document in this tree and points to replacements for superseded material. The [gaps report](DOCUMENTATION_GAPS.md) identifies the remaining documentation and verification work. Earlier [consolidation](architecture/PRELAUNCH_CANONICAL_CONSOLIDATION_EXECUTION_REPORT_2026-11-10.md) and [cutover](architecture/PRELAUNCH_CANONICAL_CUTOVER_GATE.md) records describe specific checkpoints. The [legacy archive](architecture/archive/prelaunch-2026-11-10/) preserves superseded material.
