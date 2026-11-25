# Calendar decision register

November 25, 2026. “Accepted” below records an explicit product-owner decision or cites a pre-existing authoritative contract. “Proposed” records the CAL-01 recommendation awaiting product-owner architecture review. A proposed decision has no effect on access, operating configuration, Product release status or phase authorization. The [phase tracker](PHASE_TRACKER.md) governs execution.

## Accepted direction

| ID | Decision | Authority |
| --- | --- | --- |
| CAL-D00 | Accept CAL-00 discovery with its stated prerequisites. Pursue Option C first. Preserve Option D as a possible long-term direction. Authorize CAL-01 documentation and reconciliation only. | Product-owner CAL-01 authorization, November 25, 2026. [Discovery verdict and evidence](CAL-00_TEMPORAL_ARCHITECTURE_AUDIT.md) |
| Existing contracts | Operational Time, domain recurrence, the common evaluation clock, and a future projected timeline have assigned responsibilities. Progressive configuration, domain-owned evidence, workforce responsibility, and Department authority continue to apply. | [01B](../product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md), [01C](../product/01C_PRELAUNCH_CANONICAL_RESET_AMENDMENT_2026-11-10.md), [CDA](../contracted-departments/ARCHITECTURE.md). |

## Calendar-specific decisions submitted for review

| ID | Proposed decision and refinement | Owner decision required |
| --- | --- | --- |
| CAL-D01 | The current Facility Administrator publishes or cancels shared date classifications under facility governance. A published classification declares a facility fact; it grants no control of vendor or self-operated Department plans. | Confirm exclusive publisher for the first release and whether anyone may draft on its behalf. |
| CAL-D02 | The authorized owner of each affected installed Department publishes its Rhythm and Coverage responses within existing module, role, installation and operator boundaries. A Product default requires local adoption. | Confirm which existing owner actions can approve each response, including a vendor-run Department. |
| CAL-D03 | A published classification is informational until an applicable, published domain rule references it. Each owner can explain the exact link that changed an expectation. | Approve the explicit opt-in and evidence required for that link. |
| CAL-D04 | An authorized, successful lookup with no classification or matching alternative preserves ordinary weekday and effective-date behavior. Missing optional setup stays visible as unconfigured. Unavailable, unauthorized and conflicting reads never establish a baseline decision. | Approve these distinct result states. |
| CAL-D05 | Compatible effects may coexist. Two incompatible changes to the same obligation, place and operating interval require explicit resolution. Ordinary overlapping Phases and distinct Coverage slots remain valid. | Approve conflict rejection for the first release and the domain owner who may publish an explicit dated resolution. |
| CAL-D06 | Rhythm and Coverage retain their published, versioned definitions. Each rule names which baseline requirements it retains, replaces, adds or removes with an explicit reason. Reuse Cycle stable keys, Coverage items and canonical Unit/Space targeting. | Confirm the first supported scope and replacement semantics. A retired Department profile cannot represent the decision. |
| CAL-D07 | Once an owner establishes an expectation, a revised classification or cancellation produces an impact difference. An authorized revision preserves the original. A populated draft Assignment board counts as prepared. | Confirm establishment points for each owner and revision authority for a confirmed, reopened, active or closed plan. |
| CAL-D08 | The source owns occurrence revisions. Each participating operational owner retains the date context, scope, configuration versions and subsequent changes needed to explain its decisions. Missing historical basis is disclosed. | Accept minimum provenance and historical timezone policy, including pre-existing dates. |
| CAL-D09 | Records, inspections, PM, Work Order closeout and other independent obligations continue under their owner. An effect that would orphan a required Cycle-bound slot needs resolution before publication. | Confirm the blocking behavior and the affected owner's review of exceptions. |
| CAL-D10 | Determine source visibility, affected locations, acting principal and each receiving Department’s authority independently. Current viewer permissions and the historical operator period serve different purposes. | Confirm the first release audience, contracted-Department detail limits and later shareable notice policy. |
| CAL-D11 | Defer general event recurrence, external synchronization, comprehensive calendar UI and automated cross-Department impact management. Explicit actual and observed occurrences are sufficient for initial evaluation. | Confirm deferrals and the evidence needed to consider Option D. |

## Questions to settle before operational influence

1. **Date and interval.** Can actual and observed dates both influence the same obligation? Which service date governs a shift beginning before midnight, and when does an interruption use interval overlap? The proposal uses explicit occurrence identity, the start service date for a recurring operating window, and actual overlap for a timed interruption. See TEMP-03.
2. **Publication and conflict.** Who may publish a facility occurrence, a Department response and a one-date resolution? Does a response replace specific requirements or add compatible ones? A January rule revision must never change the explanation for a December board. See CAL-D01–08.
3. **Visibility and continuity.** What minimal information about an impact can cross operators? Who may resolve an orphaned safety obligation? What can an employee on an offline device learn or submit after an authorized revision? See CAL-D09–10 and TEMP-05/07.

Record each disposition with the decision ID, date, approving authority, any amendment and the phase it authorizes. The [proposed contract](CAL-01_ARCHITECTURE_CONTRACTS.md) describes how to verify the choices.
