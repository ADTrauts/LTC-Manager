# Calendar and temporal architecture program

**Program direction · November 25, 2026.** CAL-00 established a need to name a facility service date once and let each installed Department decide how that date affects its operation. The product owner accepted Option C, shared Operational Date Context first. Option D, an integrated calendar for awareness and approved operational changes, remains a possible destination.

The first proposed use case is a holiday on which resident meal service continues, retail stations change their hours, and some staffing requirements change. A manager should be able to compare the ordinary and alternative expectations for a place and explain which obligations continue. A date classification alone has no operational effect.

## Program records

| Record | How to use it |
| --- | --- |
| [Phase tracker](PHASE_TRACKER.md) | Single record of phase status, authorization, dependencies and exit evidence. |
| [Decisions](DECISIONS.md) | Accepted direction, proposals for review and choices reserved to the product owner. |
| [CAL-00 discovery report](CAL-00_TEMPORAL_ARCHITECTURE_AUDIT.md) | Historical source audit at `9f3388ac`, including test results, limitations, alternatives and all ten scenarios. |
| [CAL-01 architecture contracts](CAL-01_ARCHITECTURE_CONTRACTS.md) | Proposed primitive, ownership, lifecycle, preview contract, remediation inventory and acceptance gates. |

## Authority and vocabulary

Operational Time supplies facility timezone, civil date and local window conversions. A **Facility Date Context** would record the facility's published classification for a named date. **Domain applicability** determines what the date means to Rhythm or Coverage in an installed Department. A **Unified Temporal Projection** is the approved future read model for authorized domain facts. A **Calendar Experience** could display those projections and, in a later phase, events created for coordination. [01B temporal foundation](../product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md#amendment-g--temporal-foundation)

The [Product Constitution](../product/01_PRODUCT_CONSTITUTION.md), [canonical amendment](../product/01C_PRELAUNCH_CANONICAL_RESET_AMENDMENT_2026-11-10.md), [registry](../product/15_PLATFORM_PRIMITIVES_AND_ENGINES_REGISTRY.md), [Department Builder contract](../product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md) and [Contracted Department Authority](../contracted-departments/ARCHITECTURE.md) continue to govern their respective subjects. Calendar-specific design choices remain under review. Implementation status requires evidence from the owning code and tests.

## Handoff between programs

Commit each future authorized phase report, its decisions and verification evidence under `docs/calendar/` through a named branch and reviewed PR. Record the audited or verified commit and distinguish executed checks from inspected tests. A chat handoff points to the GitHub commit and PR. Keep individual personnel, customer operational records, credentials, local machine paths and environment values out of these reports.
