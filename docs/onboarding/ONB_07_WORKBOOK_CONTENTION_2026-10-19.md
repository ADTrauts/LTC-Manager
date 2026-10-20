# ONB-07 R07-01A workbook contention follow-up — October 19, 2026

> **Later approved follow-up:** The user approved scoped checkpoint retirement (D23). See [implementation and current verification](./ONB_07_WORKBOOK_RETIREMENT_2026-10-19.md). The proposal and failed results below remain historical evidence.


Local R07-01A work only. **ONB-07 remains incomplete / release HOLD.** This report preserves the earlier [follow-up](./ONB_07_FOLLOWUP_2026-10-19.md), [offline certification](./ONB_07_SPACE_OFFLINE_CERTIFICATION_2026-10-19.md) and failed attempts. No commit, push, deployment, live charge, customer-data operation, external message or pilot activation.

## Causal finding and bounded correction

The migration-148 integrated failure was **canonical child-batch creation**, not parent claim, row execution or the second confirmation. Parent `823d4927-d208-493a-b31b-3179150ce3b5` still has eight committed mappings, two failed child results and eighteen unknown/unattempted rows. One registered child has no canonical batch. PostgreSQL PID 41103 / XID 70469 at 11:12:56 UTC reports an SSI pivot during SetupImportBatch INSERT; Prisma reports P2034 after the five-attempt bound. Receipt snapshots and the historical transaction log preserve that correlation; they do not reconstruct every SSI edge.

`confirmImport` already reconciled row-execution exceptions, but its initial durable claim was outside that recovery block. `confirmWorkbook` treated an exhausted child claim as a whole-request exception. This stranded remaining ready work despite the contract permitting truthful failed attempts among the 25 attempted rows.

A new database regression creates an actual SSI dependency cycle using two non-source synthetic Users: victim reads A; rival reads B, writes A and commits; victim writes B and PostgreSQL rejects it. The unchanged owner aborts after exactly five P2034 errors (PID 26262, XIDs 82188/82190/82192/82194/82196). In the controlled regression the correction reports 24 committed / one failed / three unknown on the first 28-row request, then resumes all 28 mappings through the original child identity. No exception-message fabrication, retry increase, test-concurrency reduction or weakened original assertion is involved.

Changes use existing owners and storage:

- Workbook orchestration records a pending attempt token in its existing child coordination record before invoking a canonical child. On confirmed rollback exhaustion it locks/reconciles the child first: a committed receipt wins, an active claim remains unknown, and only proven failure gets a failed attempt. Continue to other ready rows within the original 25-attempt bound. Unknown COMMIT stops that request; later work reconciles the same child identity.
- Existing SetupImportResult stores append-only WORKBOOK_ATTEMPT facts only for proven failures. A pending token belongs to mutable parent/child coordination, not to the authoritative outcome ledger. Historical intermediate unknown markers remain readable; neither kind supplies domain reference mappings. Canonical effects, child IMPORT receipts, parent WORKBOOK receipts and mappings still share the original row transaction.
- Expected sibling commits do not force a replacement identity when the original unclaimed child plan still matches exactly. A changed review requires locked proof of no success/active/unknown outcome, plus the unchanged full workbook checkpoint guard. Prior attempts/reviews survive.
- Internal ExecutionContext distinguishes coordination-only claim validation from the full mutation guard. Claims retain live authority, parent lease and signed child/parent intent checks. They no longer read the entire workbook catalog merely to insert metadata. The complete checkpoint, mappings, locked dependencies and current authorization remain checked inside every effect/receipt transaction. Standalone CSV behavior and the default context guard are unchanged.
- Results retain failed attempt history after successful recovery. The existing workspace uses distinct rendering keys for repeated attempts of the same child and labels the history accurately.

No shared retry-policy change, new migration/model, global lock, persistent planner setting, lifecycle/credential exception or publication/access change was added. Empty Role upserts remain ruled out by the prior probe. A new read-only catalog probe recorded 39 query plans and 37 live SIREAD locks: only Role was relation-scoped; the relevant identity/location indexes held page/tuple predicates. This does not justify another index. The JIT timing probe also did not establish significant compilation overhead. Neither diagnostic is a complete SSI dependency graph or production performance certificate.

## Verification and current verdict

**R07-01A exit gate: BLOCKED.** Frozen build **J8PaXDPOzqYzA_n01cjyP**; [verification inventory](./ONB_07_WORKBOOK_VERIFICATION_2026-10-19.json) records source/owner/log fingerprints. Full logs remain under ignored `tmp/onb07-r07a`; source manifest `87ebeeb780e023ea218da62b977bd92ce70419a90ce2c28fd594b4330186347f`. Local Node 24/PostgreSQL 14 does not certify remote Node 20/PostgreSQL 16.

| Check | Actual final result |
|---|---|
| Representative workbook/CSV/service concurrency | **55 passed / 0 failed / 1 skipped**, 56 total. Original recovery assertions and default cross-file concurrency retained. |
| Required integrated database gate | **3,676 passed / 3 failed / 7 skipped**, 3,686 total. All 150 migrations and seed twice pass. Current failures: workbook 26/28, Partner role cleanup 1/0, PM replacement 0/1. No further unchanged broad rerun. |
| Changed customer/Console workbook browser journeys | **8 passed / 0 failed / 0 skipped**, build J8PaXDPOzqYzA_n01cjyP. Includes desktop/tablet 25-row continuation/reload, actual lost-response recovery, denied roles, wrong site/version/formulas and Staff attribution. Isolated browser success does not erase the integrated workbook failure. |
| Build / source lint | Production build and its TypeScript **PASS**; selected six-file lint **0 errors / 0 warnings**. Earlier builds are retained as intermediate. |
| Migration governance | Normal Git-aware integrity **150 PASS**; three isolated targets each have 150 disk/applied, no checksum mismatch/pending/unfinished. No applied SQL edit, reset, drop or new checksum exception. |

All **2,608 initial index entries** are preserved. Existing working overlays remain; only new report/inventory paths are normally tracked. Historical inventories and failed logs remain. Legacy screenshot aliases encountered in the harness were restored from the retained affected-final archive; current screenshots/downloads are saved separately, and future harness paths are isolated. Only screenshot destination changed after the passing browser run; its exact tested source is retained, with assertions unchanged.

## Important intermediate findings

The first integrated checkpoint on migration 150 was **3,686 total / 3,676 passed / three failed / seven skipped**. It reached 25 committed mappings before two People-row execution transactions exhausted their five attempts during resumption, leaving the dependent membership unattempted. The original child-claim abort was corrected, but the target remained failed: 25 versus 28 expected final commits. The failed parent is `c21f807c-a1cd-459b-9152-3cef4cb8963a`; its two failed canonical batches exist, with empty target IDs, no leases and no parent mappings. This is not an unknown COMMIT or a lost reference mapping. PostgreSQL/Prisma trace associates the five rollback sequences with User insertion and concurrent catalog reads. Earlier mappings remain committed.

That checkpoint also exposed a CSV preview fixture comparing global counts while other suites delete their own Users (238 before / 223 after). Its no-mutation assertion now covers the full reviewed Facility plus exact global target identity, grants, receipts and invitations. All credential and recovery assertions remain. A newly observed unrelated PM replacement test returned zero rather than one Work Order at phase-4d line 434. No PM owner was changed and no pre-existing/baseline exception is inferred; the current gate record must carry its actual result.

The initial implementation added an unknown receipt INSERT per attempted row, unnecessarily making pending coordination another shared outcome-index writer. It is a plausible contributor to the newly observed row contention, not a proven complete SSI graph. The final bounded correction stores the pending token with the existing mutable child/lease instead. Immutable terminal failure receipts and atomic domain/receipt/mapping writes remain. Only a causally changed candidate justifies the subsequent verification; the failed checkpoint stays failed.

## Retained failures and limits

- The initial representative command failed before database access because the isolated port was omitted; its log is setup evidence, not 52 product regressions. The corrected unchanged-owner group was 52 passed / zero failed / one skipped.
- The first new real-SSI regression failed during fixture validation (missing required display name); its corrected control then failed at the intended five-rollback claim boundary.
- The first implementation preserved first-request progress but failed second-request recovery because the prior refresh logic required a child batch to exist. The corrected regression retains the original identity when its canonical plan is unchanged.
- An intermediate 55-test group was 53 passed / one failed / one skipped: partial-failure setup exhausted row-execution retries at Unit creation. No original assertion was changed.
- The later 56-test group was 53 passed / two failed / one skipped. Partial recovery exhausted row-execution retries (UnitSpaceResponsibility and User insertion), and the starvation case hit lease expiry after a 1,754-second delay coincident with local sleep/wake evidence. It remains a failed attempt, not a pass or a hidden exception. The final integrated gate inhibits idle sleep without extending any lease/review or changing suite concurrency.
- Focused claim-scope group: eight passed, including partial recovery, real five-rollback exhaustion, lost claim COMMIT, external drift after claim, canonical CSV recovery and service pricing. These overlap later checks and are not summed.

Canonical SPACE offline, its browser/PIN evidence and prior build retain their source/build fingerprints and original scope. Their runtime owners and the shared transaction helper are unchanged; no unchanged offline replay is run here. Remote CI, production Blob/ClamAV and offline key infrastructure, intended-target release governance and actual pilot acceptance remain separate open gates. Historical evidence is never presented as a fresh run. No real pilot, production readiness or rollout approval is implied.


## Remaining R07-01A decision / proposed next work

The bounded claim defect is corrected; **integrated row-execution/resumption is not certified**. The final retained 28-row parent `eeba6dce-632b-43a3-9675-5b529e2424ce` has 26 committed mappings, one failed People child (`900aa0c1-a9bd-425d-82b1-10b9cf523ca5`, row ID 28), and one unattempted membership dependency. The child exists, its lease is released, its failure has no target IDs, and no mapping is fabricated. Its last five P2034 attempts are backend 46736, XIDs 101162/101175/101182/101201/101223 at 21:53:24–27 UTC. They fail during User insertion or the atomic child receipt append. PostgreSQL records SSI pivots. This is domain-row execution during resumption, rather than parent claim, child claim, mapping corruption or an unknown COMMIT. Replaying the failed retained workbook manually is not used to change this gate result.

The final default-concurrency database checkpoint has three current failures: workbook completion is 26 rather than 28; one Partner User role period remains open after organization membership end (line 387 of partner-membership-end.concurrency.db.test.ts); PM replacement reports zero rather than one Work Order (line 434 of phase-4d-preventive-maintenance.test.ts). Partner/PM owners are unchanged by this task, but this does not prove harmlessness or a pre-existing baseline. They require separate owner triage; no authorization or lifecycle fence is removed here.

Before a larger rewrite, correlate the protected catalog reads in the mutation transaction with live SSI dependencies on the mandatory CI-equivalent PostgreSQL version. The standalone read-only probe did not capture the complete conflict graph. No additional index is justified by current evidence.

Two concrete follow-up options, neither implemented or silently selected:

1. **Recommended investigation: batch the existing protected catalog reads.** Refactor the existing setup-import catalog/workbook catalog owners to reduce database round trips and transaction duration while returning exactly the current typed facts. Preserve whole-catalog material-change detection, source/actor digests, dependencies and all current effect/receipt locks. Prove full fact/digest parity before switching reads, then run controlled concurrent writers, the unchanged recovery assertions and the required integrated gate once on that stable implementation. This is a larger read-owner refactor, not another mutation executor.
2. **Revision-fenced dependency checkpoints.** Consider only through an explicit architecture review: identify every relevant Facility/catalog/global-identity writer, define forward-compatible protected revisions, and prove external changes and expected own commits remain distinguishable. It would affect more writers and potentially require a forward migration. No partial deployment, missed writer, invented identity, historical rewrite or narrower review contract is acceptable.

Neither larger change is authorized by this review package. Increasing retries, counting only successful rows, serializing the repository suite, weakening the second-confirmation assertion, or removing the case are not alternatives. R07-01A remains blocked until the original integrated recovery case and mandatory gate actually pass.


### Concrete scope decision: retire completed identity facts with no remaining consumers

The final read-only probe of the actual failed 28-row source collected **27 query plans and 56 SIREAD locks**, including page-level User locks on heap pages 5, 7, 8, 9 and 10. Those pages contain the reviewed Facility's committed Users alongside other Facilities' Users created during this workbook's execution (counts 25/9/12/1/25 respectively). The queries are logically scoped; PostgreSQL's page predicates couple them physically. This supports the remaining read-set concern, but does not reconstruct every SSI edge. The probe rolled back; no retained failed workbook was resumed.

A concrete smaller alternative to a broad catalog rewrite needs explicit review because it changes when a later external edit requires renewed preview: retire a completed People row's identity facts **only when no remaining row consumes that person**. Continue checking the live actor, every pending People row, all pending relationship dependencies, and the full existing Facility location/organization catalogs inside the mutation transaction. A completed person still referenced by a pending relationship remains protected. Committed receipts/mappings remain authoritative historical facts. Version the internal checkpoint algorithm so older reviews retain their conservative behavior; do not migrate historical receipts or invent identities.

If approved, implement a pure dependency projection shared by the existing guard/catalog read and identity locks, with regressions proving pending consumers retain lifecycle/credential protection, external relevant drift still rejects, historical reviews remain compatible, and no duplicate/missing mappings arise. No mutation executor, isolation level, retry bound, per-request attempt cap or public workbook contract changes. If not approved, keep full committed-person protection and pursue protected read batching/revision fences instead. This alternative is **proposed only**, not implemented or a gate waiver.
