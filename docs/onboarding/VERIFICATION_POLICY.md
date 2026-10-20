# Onboarding verification policy

Accepted October 18, 2026, for ONB-05 and subsequent phases. This changes the verification workflow, not phase scope, exit criteria, commercial policy or release prerequisites. [PHASE_TRACKER.md](./PHASE_TRACKER.md) remains the execution authority; Consult the tracker for current phase authorization/completion. Historical inventories retain the checks actually performed.

## Select checks by changed behavior

During development, test changed behavior and directly affected dependencies. Add regressions for meaningful outcomes and risks, rather than tests that merely restate source structure or implementation details. Expand coverage when an owner change, failure, integration concern or demonstrated wider impact justifies it.

Retain database-backed proof for identity, authorization, transaction boundaries, replay and recovery. Browser-check changed customer and staff journeys through their actual authorization and mutation paths. Rerun an earlier journey when its underlying owner changes or a concrete concern affects it; phase adjacency alone is not a reason to replay it.

Before declaring a phase complete, run its necessary final checks once against the final relevant implementation. Repeat passing checks after relevant changes, failures or unresolved concerns. A documentation-only edit does not require repeating application tests or rebuilding.

| Change / risk | Appropriate verification |
|---|---|
| Pure parser, planner, pricing or scope logic | Focused input/outcome regressions and directly affected consumers. |
| Identity, access, lifecycle, actor attribution or transaction owner | Relevant real database cases, including denial and concurrent/repeated submission; affected browser journeys. |
| Payment, service-order approval or recovery owner | Database-backed pricing/approval/replay/partial-failure cases with controlled provider responses; changed customer/staff browser journeys. Live payment activity requires its own authorization and is not implied by a test plan. |
| Customer/staff UI or routing | Changed browser flow and relevant role/scope denial; reuse a suitable production build, rebuilding after relevant application changes. Check relevant desktop/tablet behavior. |
| Schema or migration | Generate/validate as needed, apply the forward chain to an appropriate isolated database, and verify migration integrity at the required checkpoint. Never waive tracking/checksum prerequisites. |
| Documentation only | Link/record consistency, diff hygiene and preservation checks; label reused application evidence. |

## ONB-05 priorities when separately authorized

Prioritize service-order pricing, approved scope and duplicate-charge prevention. Product decisions about fees, waivers, scope or approval remain governed by the accepted plan/decision log; this policy supplies no new pricing or payment permission.

Meaningful cases should prove the agreed price/currency and scope, authorized customer/staff approval, stale or changed quote/scope handling, repeated/concurrent submission, payment-provider retries and out-of-order notifications, and interrupted requests reconciled before retry. Prove the recovery behavior around a charge succeeding while local execution or its response fails, so replay cannot charge twice. Preserve actual partial outcomes and mixed-actor attribution. Exercise the changed customer approval and staff delivery/recovery journeys in the browser.

## Reuse environments and evidence honestly

Reuse suitable isolated databases and production builds. Check that schema/migrations, relevant source, configuration and feature flags fit the scenario; rebuild after relevant application changes. Keep existing disposable-target guards and forward-only migration rules. Do not repeat environment provisioning merely because another slice begins.

For reused evidence, record its original command/date, source revision or relevant owner fingerprints, environment/build and coverage limits. Explain why it remains relevant and what changed afterward. If suitability cannot be established, rerun the affected check. Label each check **run**, **reused**, or **not run**. A prior pass is not a fresh run; an old failure inventory is not proof that today's failures are unchanged.

Save full logs to files. Report concise pass/fail/skip totals, any newly observed failures and actionable details. Compare identities before calling failures unchanged. Preserve historical inventories; avoid repeatedly investigating unrelated known failures unless new evidence connects them to changed behavior. A failed or interrupted attempt stays failed evidence even if a later run passes.

## Broad checks and mandatory gates

Reserve routine full-repository suites and comprehensive journey replay for ONB-07, required integration/release checkpoints, or demonstrated wider impact. This local development workflow does not weaken required repository or CI gates. The existing [Verify workflow](../../.github/workflows/verify.yml) still includes hermetic tests, static checks, production build, database verification and configured browser/pilot jobs at its triggers; retain those requirements. Existing [verification commands and database rules](../engineering/CONTINUOUS_VERIFICATION_PHASE_5_2026-08-05.md) remain applicable.

Phase exit criteria and release prerequisites remain intact. In particular, ONB-02–05 migrations must be reviewed/tracked and pass the normal Git-aware migration-integrity gate before release. No new deployment, paid implementation, XLSX or repository-renaming authority is conferred here.
