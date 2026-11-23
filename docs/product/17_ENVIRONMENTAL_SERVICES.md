# 17 — Environmental Services

**Status:** Department Product blueprint  
**Release status:** **DEVELOPMENT** — not customer-visible, not purchasable, not a billing change  
**Platform contract:** [13 — Department Product](./13_DEPARTMENT_PRODUCT.md)  
**Builder contract:** [16 — Department Builder Architecture](./16_DEPARTMENT_BUILDER_ARCHITECTURE.md)  
**Dashboard declaration:** [Department Dashboard Contract](../dashboard/DEPARTMENT_DASHBOARD_CONTRACT.md)

This is the filled blueprint. It does not mark the Product AVAILABLE. August 2026 guides under `docs/evs/` are historical.

## Product identity

The Product name is **Environmental Services**. Healthcare is the industry. A new install is named Environmental Services. A facility may rename that Department. The installation key is `EVS`.

The Product is designed for Healthcare facilities of type Hospital and Long-Term Care. It is one Product for both.

## Blueprint

| Contract item | Environmental Services |
|---------------|------------------------|
| **Purpose** | Housekeeping for a healthcare facility: who covers the Department's places, what the operating windows are, and which cleaning Records are due |
| **Place participation** | Department responsibility on canonical Units and UnitSpaces. Cycle roots use department-wide participation, so a place assigned later joins the window. Area Ready groups store explicit room ids. No Location Functions. |
| **Operating Rhythm** | Morning, Afternoon, and Evening Operations. Each has Opening, Cleaning, and Closeout Phases. Shift opened is a Key Point with tracking NONE at department grain. Area ready is a Key Point with tracking REQUIRED at location grain and starts with no rooms. |
| **Work presets** | Do not define. Generic Work is retired. Residual preset keys in code are compatibility debt. |
| **People / coverage needs** | Shared People and Assignments. Product assignment roles already include cleaning round, discharge clean, isolation clean, floor care, public area, supervisor rounding, and on-call coverage. Those roles are Assignments. They are not a second job-role system and not a discharge engine. |
| **Record definitions** | Shared Catalog forms suggested for this Product: Restroom sanitation round, Room cleaning checklist, Area inspection. A facility installs and attaches them. The Product does not own a record engine. |
| **Assets used** | Shared Assets when a cleaning or inspection problem is equipment. No EVS asset registry. |
| **Issues / exception rules** | A maintenance problem becomes an Issue and, when Plant accepts it, a Work Order. A failed inspection stays on the Record. |
| **Domain-specific capabilities** | None. Assignment zones are retired (no code reads or writes them). `UnitType.EVS_ZONE` is a Facility place type; do not give it EVS-specific behavior. |
| **Run requirements** | The published Cycle and Phase answer what is happening. Job Flow shows Assignment context, that window, and Records due. Assigned Work Orders appear in Job Flow only for Plant today. An empty Assignment does not hide place-scoped Records. |
| **Historical / Audit questions** | Which Records were completed, missed, or waived, and which REQUIRED Area Ready Key Points were recorded, for a past service date. |
| **Starter content** | The operating-rhythm starter is applied on request and stays unpublished until the facility publishes it. Catalog forms are suggestions. Nothing auto-publishes. No fake rooms or people. |
| **Facility-configurable values** | Window times, which places the Department is responsible for, which rooms share an Area Ready time, people, and local labels. |
| **Dashboard contributions** | `locations.runtime`, `cycles.published`, `coverage.planned`, `people.roster`, `maintenance.shared`, and Records when canonical logs are on. `plant.requests.filed` only through a request route to Plant. No `work.expected`, `menus` or Location Function. Customer Dashboards omit this Product while it is DEVELOPMENT. |
| **Notification policy** | The shared engine. Assignment changes, coverage, and evidence failed apply when those facts exist. Key Point overdue applies when the production Scheduled Evaluation clock is active. It is inactive today. Discharge, isolation, and supply shortage are not event types. |
| **Platform-gap test** | Cleaning coverage, rhythm, and documentation are Platform mechanisms. A discharge-clean engine, an EVS inspection store, or an EVS notification engine would be a new engine. This blueprint does not add one. |

## What stays DEVELOPMENT

The Dashboard release gate passes as of November 23, 2026 (declaration complete; tests listed in the contract). Becoming AVAILABLE still needs a separate release decision. This blueprint does not change price, sellability, or release status.
