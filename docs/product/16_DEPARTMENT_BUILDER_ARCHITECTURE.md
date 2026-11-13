# 16 — Department Builder Architecture

**Status — CURRENT.** This contract applies the accepted [01A](01A_DEPARTMENT_BUILDER_FOUNDATION_AMENDMENT_2026-11-01.md), [01B](01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md), and [01C](01C_PRELAUNCH_CANONICAL_RESET_AMENDMENT_2026-11-10.md) decisions to the canonical application. [The baseline record](../architecture/PRELAUNCH_CANONICAL_BASELINE_2026-11-11.md) documents the transition. The [Department Product guide](NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md) maps each section to its source owners and tests.

## Standard Department Builder contract

The common shell at `/build/departments/[departmentId]` has five core sections. The [navigation and visibility rules](../../src/lib/department-administration/admin-nav.ts) and [Department page](../../src/app/(protected)/admin/departments/%5BdepartmentId%5D/page.tsx) define the actual tabs.

| Section | Owns or composes |
| --- | --- |
| **Overview** | Product identity, Department settings and a composed setup summary. Dashboard is the live supervisor attention surface. |
| **Facility** | Department lens over the existing Facility tree and explicit responsibility. The tab ID is `locations`. The lens composes owner facts and exposes Department-local descriptive notes. |
| **Operating Rhythm** | The owning Cycle editor for periods, phases, Key Points, places, draft/review/publication and effective dating. |
| **People & Coverage** | Team and workforce context composed from Employee Builder, with the owning Coverage editor for staffing needs. |
| **Records** | Canonical Records requirements and configuration for this Department. Availability follows Records admission. |

Food and Nutrition can expose **Menus**. Facility Plant Operations exposes **Maintenance**, which opens the **Preventive Maintenance** builder. These use the existing Department shell and their own services. EVS has no dedicated Builder extension.

## Facility and participation

Facility Builder is the physical owner. Use the Facility → Unit hierarchy → `UnitSpace` tree. `FacilityRoomType` is a physical classification and picker aid. Facility Builder owns physical name, ancestry, lifecycle and `UnitDepartmentResponsibility` / `UnitSpaceResponsibility`. The same Space can be shared by several Departments. Each Department's engines select canonical IDs within that scope or use the owning engine's supported broader scope. A room type, descriptive note, or responsibility row creates no automatic requirement, permission, staffing need, Assignment, or Team membership.

Operating Rhythm versions own place participation and Key Point applicability. Records attachments own requirement scope and schedule. Coverage templates own explicit Unit/Space need, role, time and count. Menus use their own place and Cycle applicability. Edit and publish through those owners. Use the facility's service date for runtime and historical evaluation.

Location Functions, Operational Types, profiles, archetypes, Experience bindings, and Facility-type Record overlays are retired. Preserve the useful historical design record through the [documentation register](../DOCUMENTATION_STATUS.md). For current workflows use the canonical IDs and direct relationships in [Prisma](../../prisma/schema.prisma).

## People, Teams, Coverage and Assignments

Employee Builder owns employee identity, Job Titles, Department membership, operational qualifications and Team organization. Teams may have explicit normal-room membership on canonical Space IDs. Responsibility removal prunes out-of-scope Team room membership. An authorized Supervisor Team lens can filter to those rooms. Team room membership grants no Department access or eligibility and creates no Coverage need or daily placement.

Coverage publishes staffing expectations separately from Team composition and daily Assignment plans. The Assignment Board owns explicit employee/role/location placement, instructions and the completion/reopen lifecycle. An Assignment Zone may assist selection. The stored locations remain the Assignment's snapshot. The accepted ONE_OFF behavior uses Workforce Assignments and supported offline commands. Generic Work Plans, presets, occurrences and a general Task engine are retired.

## Records, Run and Audit

The Records chain is definition → Facility catalog install → effective attachment → evidence. Author and place requirements through the shared owner. The Department section composes its scope. Evidence remains a Record even when a Cycle, Work Order or PM plan refers to it. Build defines configuration. Run, Job Flow and Dashboard compose live domain facts. Audit reads effective configuration and recorded outcomes for the relevant service date. Each owner keeps its own lifecycle.

Use progressive configuration. Missing optional configuration creates no missed work, overdue event, failed compliance or uncovered staffing. Use the [new Product checklist](NEW_DEPARTMENT_PRODUCT_IMPLEMENTATION_GUIDE.md#6-verification-and-checklist) to verify visible configuration, persistence, runtime behavior and denied scopes.

[Prior version and checkpoint detail](https://github.com/ADTrauts/LTC-Manager/blob/9477ec0c0c103076935c4347978ac59e9207860c/docs/product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md).
