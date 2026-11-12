# Phase 0 — Architecture Discovery Pack (2026-11-08)

Documentation-only audit of the current Vssyl / LTC Manager architecture prior to any consolidation implementation.

**Branch:** `main`  
**Commit:** `e179c0d52dcc3a71d83c8b0a42a1eb00945de6f8`  
**Verdict:** PASS WITH GAPS  
**Phase 1 follow-up:** [PHASE_1_ARCHITECTURE_CONTRACTS_RECONCILIATION_2026-11-08.md](./PHASE_1_ARCHITECTURE_CONTRACTS_RECONCILIATION_2026-11-08.md) and binding [01B](../product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md) (documentation reconciliation authorized; Phase 2 code removal not authorized by Phase 0 alone).

## Deliverables

| ID | File | Contents |
|---|---|---|
| A | [PHASE_0_PLATFORM_ARCHITECTURE_ATLAS_2026-11-08.md](./PHASE_0_PLATFORM_ARCHITECTURE_ATLAS_2026-11-08.md) | Layer map, builders, engines, matrices, diagrams, status |
| B | [PHASE_0_TEMPORAL_ARCHITECTURE_AUDIT_2026-11-08.md](./PHASE_0_TEMPORAL_ARCHITECTURE_AUDIT_2026-11-08.md) | Operational Time, Scheduled Evaluation, domain timing, timeline constraints |
| C | [PHASE_0_ARCHITECTURE_RECONCILIATION_REGISTER_2026-11-08.md](./PHASE_0_ARCHITECTURE_RECONCILIATION_REGISTER_2026-11-08.md) | ARR-001…ARR-029 findings, risks, phase mapping, PO decisions |

## Finding range

ARR-001 through ARR-029 are recorded in the Reconciliation Register (including ARR-026–ARR-029 from same-day explorer enrichment).

## Authority reminder

Nov 1–2 Department Builder amendments supersede older Constitution / registry paragraphs that still teach generic Work or Location Function. Live schema after `e179c0d` may still contain those objects; that is compatibility debt, not permission to extend them. Phase 1 documents that supersession; it does not delete the objects.

## Follow-up enrichment (same day as Phase 0)

Builder and temporal exploration added ARR-026–ARR-029: live Location Function bind/publish on Locations, Harbor/partner Work authoring paths, inspection DST policy fork vs Operational Time, and server-local midnight in `employee-units.ts`.
