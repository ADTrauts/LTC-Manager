# ONB-07 FR-01 / R07-07 correction and final review

October 19, 2026, America/New_York. **FR-01 / R07-07: local PASS. Candidate ready for final review and separately authorized commit/draft-PR/remote CI. Release HOLD; ONB-07 incomplete.** No commit, staging, push, PR creation, deployment or live operation occurred.

[Current verification inventory](./ONB_07_SPACE_DATE_LOCK_VERIFICATION_2026-10-19.json) · [Updated inclusion manifest](./ONB_07_CANDIDATE_INCLUSION_2026-10-19.json) · [Commit/CI handoff](./ONB_07_FINAL_REVIEW_HANDOFF_2026-10-19.md).

## Correction and review

- `public/space-offline-store.js`: expose the existing lease/date/context guard; invalid context locks tab secrets. The same guard checks prospective preparation before persistence and before publishing wrapping material. Recovery preserves original metadata/AAD and remains review-only. Zero temporary key bytes in `finally`; revalidate decrypts before returning data.
- `public/space-offline.js`: use that guard in the existing one-second timer and immediate focus/visible-document/pageshow restoration. Clear instructions, Space label, Work/actual and replay controls on lock. Reject detached-view/generation changes and revalidate before rendering asynchronous results. Keep online preparation/recovery available.
- `public/sw.js`: public shell **v2 → v3**. No IndexedDB version change, pending-command eviction or database migration.
- `tests/offline-browser/date-guard.spec.ts`: ten desktop/tablet public-renderer regressions, including a still-valid lease across New York midnight, pre-boundary control, encrypted command preservation, immediate foreground locking, late preparation and late decrypt denial.
- `tests/offline-browser/date-boundary.spec.ts`: six real authenticated customer cases, with native timers, actual disconnect/reload/queue, idle/focus/visibility restoration and fresh credential-backed same-actor review. Target 12 is unused by earlier full-gate conflict/replay cases. Facility timezone changes are confined to the isolated fixture and restored in `finally`.
- `tests/offline-browser/ci-gate.spec.ts`: screenshot path only now uses `info.outputPath`, preventing future cross-run artifact overwrites. Its behavioral assertions and mutation paths are unchanged.

D24 clarifies enforcement of D21; there is no new operational-date calculation or product policy. Server authorization, credentials/lifecycle, licensing, publication, current-fact checks, atomic effects/receipts, bounded retries, recovery proofs and 12-hour maximum are unchanged. There is no new migration or applied-SQL change. Review found no remaining actionable FR-01 defect within this bounded scope.

## Actual corrected-source evidence

Application build **`kM54rZEnzG5pildBnjPxm`**, `.next-onb07-date-lock-final-build`; local Node **24.19.0**, PostgreSQL **14.18**, retained isolated migration-150 target. All three loopback-served public scripts exactly match corrected disk SHA-256 values in the inventory. Public scripts are served directly; the final renderer adjustment was present before build completion and before all accepted browser checks. Test/harness-only changes afterward do not alter compiled application owners.

| Check | Result / evidence selection |
|---|---|
| Final focused guard regression | **10 passed / 0 failed**, desktop/tablet. Synthetic intercepted HTTP is explicitly separate from customer journey proof. |
| Affected real rebuilt-app journeys | **16 distinct cases passed / 0 outstanding failures**: six date-boundary/recovery cases and ten cache, missing-context, real offline reload/mutation/lost-response reconciliation, sign-out/recovery and expiry/scope cases. Results are selected across run-specific logs; not one claimed fresh 16/16 consolidated run. Earlier duplicate/superseded cases are not added to totals. |
| Boundary measurements | New York operational date October 19 → October 20, midnight `2026-10-20T04:00:00Z`; original leases extend beyond it. Native idle timer locks in **876.6 ms desktop / 873.0 ms tablet**. Focus: **11.9 / 11.0 ms**; visible-document: **13.1 / 10.8 ms**. Test allows 100 ms scheduling tolerance around the existing one-second timer; observed idle results are within one second. |
| Pending intent and recovery | Exactly one command before/after locking; encrypted envelope byte equality before recovery, identical command ID/ciphertext after recovery. No new action, Space label, instructions or replay control while locked. Real fresh same-actor online login and explicit issuance recovery render review only; zero server receipt is fabricated by review. |
| Build / TypeScript / selected lint | Production build and its TypeScript passed; final standalone TypeScript and focused lint results are in the inventory. Public lint: **0 errors / 3 retained unused-destructuring warnings**; test lint: zero findings. No full lint/suite claim. |
| Source/index/history checks | Exact index preservation, expected-file reconciliation, current served-source hashes, old manifest/probe hashes, reused-owner fingerprints, link/JSON/diff checks recorded in inventory. |

The date-boundary journey controls browser `Date` only; backend time/authorization and credential proofs remain real. It prepares through the customer button at local 23:59:50, uses the unmodified server-issued date/lease, and crosses the client date boundary with native navigation/timers. This is controlled-clock local certification, not a production overnight soak. Tablet is Chromium touch emulation, not physical Safari certification. Recovery returns to real browser time for credential UI; it still explicitly reviews the locked original issuance without restoring cached instructions or renewing its original lease.

## Failed attempts and preservation limitations

All failed attempts remain in `tmp/onb07-date-lock`: sandbox Chromium launch (10 failed before behavior), PostgreSQL startup permission failure, first font-download build failure, two cached Turbopack port failures, fixture preparation without profile flags, invalid shorthand fixture role, retained-admin credential mismatch (16 failed before target behavior; subsequent two-case setup attempt also failed), full-clock boundary reload failures and Date-helper reload failure. Diagnostics proved this Playwright version replaces Performance navigation entries even through its Date helpers; the existing new/restored-document guard correctly denied those reloads. The final test uses a test-only Date proxy and preserves real navigation/native timers. No production guard was weakened.

**Unexpected artifact change:** the existing reload test overwrote `tmp/onb07-space/offline-{tablet,chromium}.png` at its old fixed paths before output isolation. Those auxiliary images were absent from the historical hashed inventories; historical original bytes were not recovered. Do not cite those paths as original-build images. Current images are copied under `tmp/onb07-date-lock/current-offline-*.png`. All referenced historical inventories, logs, failed probes and manifests remain unchanged; the preservation audit checks their hashes. This limitation is explicit, not a retrospective claim of complete artifact preservation.

The original 247 staged paths / 2,612 index entries and final working overlays remain intact. The earlier final-review manifest and report are preserved byte-for-byte as `*_PRE_FR01_2026-10-19.*`; the original final-review verification JSON remains historical. The failed original date-boundary probe is not rewritten as a pass. The updated manifest enumerates every final file, changed owner, new test/document and inclusion decision; it flags the auxiliary artifact overwrite above. No unrelated nonignored change is accepted.

## Reused evidence and remaining gates

R07-01A's final migration-150 checkpoint **3,684 passed / 0 failed / 7 skipped**, workbook browser **8/8**, and the canonical SPACE **20 database/contract** checks remain reused evidence. Relevant server/replay, schema/migration, payment, identity, scanner, workbook retirement and receipt owners are unchanged. Earlier SPACE browser/PIN evidence is reused only for unchanged journeys; changed renderer journeys are checked above. No unchanged full database suite, broad browser replay, scanner run or migration deployment was performed here.

Partner membership-end, PM replacement and intermediate partial-recovery exhaustion remain unexplained intermittent findings. Later passing checkpoints are not claimed causal fixes. Remote **Node20/PostgreSQL16** gates have not run. Production private Blob/ClamAV hosting/TLS/secrets/updates/scheduling/owners and managed offline recovery keys/HTTPS/rotation/retention remain pending. All ten program migrations / 150 total and compatible timing writers must precede runtime availability. Public signup remains disabled/unmodified. Actual pilot Facility/workflow/owners/training/support/authorization and real acceptance/effort evidence remain pending.

Next: approve the exact reconciled integrated commit, one draft integration PR and mandatory remote CI, using the handoff's literal pathspec plan. No partial deployment, production readiness or pilot acceptance is inferred from local passes.
