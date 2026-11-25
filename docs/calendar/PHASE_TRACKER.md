# Calendar phase tracker

**Status on November 25, 2026.** CAL-00 discovery is accepted. The product owner selected Option C as the initial direction and authorized CAL-01 documentation and reconciliation. The CAL-01 contracts are submitted for architecture review. No CAL-02–08 execution has been authorized. Recording or merging a document does not approve its proposals or open the next phase.

| Phase | Status | Dependency and evidence required to exit |
| --- | --- | --- |
| CAL-00 · Discovery and feasibility | Complete, accepted by product owner | [Audit](CAL-00_TEMPORAL_ARCHITECTURE_AUDIT.md) at `9f3388ac`. 164 tests in 16 selected files passed during discovery. Timezone probes, ten scenarios, four alternatives and certification limits are recorded there. |
| CAL-01 · Architecture contracts | Documentation authorized and delivered for review. Product decisions pending. | Review [contracts and prerequisites](CAL-01_ARCHITECTURE_CONTRACTS.md) and [decision register](DECISIONS.md). Record owner dispositions and the exact scope of any next authorization. |
| CAL-02 · Temporal reconciliation | Proposed, awaiting separate authorization | After CAL-01 review, reconcile existing date readers, applicability and window conversion. Record reproducible before/after cases and outcomes per TEMP finding. Establish which bounded preview can pass and what remains blocked for activation and certification. |
| CAL-03 · Facility Date Context | Proposed | Requires approval of primitive ownership, publishing authority, occurrence identity and lifecycle. Prove facility isolation, ordinary defaults, prospective revision and cancellation in the separately authorized scope. |
| CAL-04 · Operational preview | Proposed | Requires CAL-03 and the applicable CAL-02 preview gates. Demonstrate ordinary versus alternative owner-selected versions, places, staffing changes, continuing obligations and explainable conflicts, with zero operational writes. |
| CAL-05 · Controlled operational integration | Proposed | Requires an accepted preview, per-owner establishment and revision policy, write authority and activation gates. Demonstrate the same decision in preparation, application, Run, offline reconciliation and Review. |
| CAL-06 · Unified Temporal Projection | Approved architectural target in 01B; delivery proposed | Depends on permission-aware, bounded source projections. Prove source identity, deduplication, date meaning and forecast versus established status with at least one real owner. |
| CAL-07 · Calendar experience | Possible future direction | Requires sufficient coordination demand and CAL-06 projections. Approve event ownership, audience, navigation and any recurrence or synchronization separately. |
| CAL-08 · Integrated certification | Proposed | Prove scenarios A–J, all seven TEMP findings for supported surfaces, operator handover, concurrent edits, independent compliance obligations, offline replay and historical provenance. Record gaps and evidence on the tested commit. |

## Gate record

- **CAL-00.** The product owner accepted discovery with prerequisites. The original audit’s provisional sequence is historical. Its option and scenario labels retain their original meaning.
- **CAL-01.** The authorized changes are the program documents, discovery archive, decision register and documentation indexes. Proposed contracts describe future behavior. [Decision status](DECISIONS.md)
- **Next scope to consider.** Review the pending decisions and authorize a bounded CAL-02 reconciliation, starting with the owner readers and fixtures for TEMP-01–03. Keep the remaining four findings visible as gates for the consumers they affect. The next authorization should specify permitted changes, validation evidence and stop point.
