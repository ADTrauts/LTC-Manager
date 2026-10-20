# ONB-07 canonical SPACE offline local certification — October 19, 2026

**Current FR-01 supplement:** [date-lock correction and evidence](./ONB_07_SPACE_DATE_LOCK_2026-10-19.md) closes R07-07 locally on build `kM54rZEnzG5pildBnjPxm`. The original results below remain dated evidence, not a fresh rerun. R07-01A is now locally passing under D23; see the current blocker list. Remote/release/actual pilot gates remain pending.

Local implementation only under D21. **ONB-07 remains incomplete; release HOLD.** No commit, push, deployment, signup enablement, live charge, customer-data operation, external message or pilot activation. [Contract](./ONB_07_SPACE_OFFLINE_CONTRACT.md) defines the first delivery and its key/lease/recovery limits. Earlier inventories retain historical results; this record supersedes the legacy SPACE Save 404 boundary only to the extent proven below.

## Reviewable implementation slices

1. **Contracts/schema:** `space/1` strict command/scoped manifest; eight nullable columns on existing issuance/receipt models in additive migration 149; migration 150 adds the canonical timing-parent fence. Dedicated versioned AES-256-GCM server escrow, tab-only wrapping secrets, explicit credential-backed recovery and numeric limits were documented before storage changes. No new operational fact store or credential cache.
2. **Preparation/reload:** current exact Space, installed/licensed Department, active function/publication, confirmed assignment and current actor/device context. Encrypted Work instructions and Key Times; protected HTML/RSC/API responses stay network-only. Going offline switches to the public lease-controlled view; genuine protected-route reload uses that public shell. Maximum 12-hour lease, known authority shortening, no offline renewal; expiry/sign-out/scope change remove keys and operational display while preserving encrypted pending intent. Explicit safe cleanup preserves unresolved commands; full-unbind discloses their loss.
3. **Replay/recovery:** canonical Work completion and append-only Key Time actual only. Existing evidence rules and NONE/OPTIONAL/REQUIRED remain. Corrections/expected-time changes are visibly online-only. Current authority, licensing, assignment, publication, supervisor direction, target facts and PIN binding are rechecked under locks. Effect/event and authoritative receipt commit atomically per command; same ID/digest returns its outcome, changed intent rejects. Reconcile unknown responses before same-ID retry. Failed attempts/unknown outcomes are distinguished without file-wide rollback claims.
4. **Customer certification:** password and real PIN journeys, desktop and Chromium tablet viewport, actual disconnect/reload/mutation and server reconciliation. Retired Ready/Started controls map to substantive Work/actual outcomes; no legacy runtime or implicit administrative execution is restored.

## Causal findings resolved

- Public JavaScript required explicit platform route-registry entries; initial proxy 404 preserved as a failed attempt.
- Same-origin validation uses the existing request-origin owner because Next's internal URL differs from the browser origin behind its proxy.
- PostgreSQL proved an online insert/FK versus replay advisory-lock inversion. Canonical completion writers now acquire Facility before target locks; Key Time/compatibility timing also share canonical cycle locks. No retry increase or isolation reduction.
- JSONB key ordering broke real key recovery. Match every scope field semantically and preserve original authenticated metadata bytes for existing ciphertext.
- A held-lock regression proved a child-only timing adjustment could leave replay on its older Serializable snapshot. The canonical online owner now atomically increments a dedicated parent revision; the existing retry rereads current timing and conflicts, preserving published definition/version/timestamp and history.
- Supervisor not-required/cancelled/reopened direction is material; replay must not silently replace it. Current sparse Work occurrences are locked before reviewed-fact checks.
- An authenticated PIN Neighborhood cannot follow a changed device binding without reauthentication.
- Harness corrections reuse one CDP network session, explicitly transport Secure cookies in denial probes, select stable manifest targets across viewports and use distinct synthetic credentials/targets. Failed setups, parse failures, consumed-target interruptions and passing intermediate candidates remain in the inventory.

## Evidence and gate verdict

Frozen build **eYn2LNGJB_kx6ATlH7XPy**, source manifest **a48ab414027acf3903c8257de7652ba4a9e00537d44ad915eb7fd38521e9fdfb**. Full local logs and fingerprints: [verification inventory](./ONB_07_SPACE_OFFLINE_VERIFICATION_2026-10-19.json), `tmp/onb07-space/artifact-manifest.json` and `tmp/onb07-space/source-fingerprints.json`. Logs are retained local artifacts, not remote CI evidence.

| Check | Actual result |
|---|---|
| Final affected database/contract group | **20 passed / 0 failed / 0 skipped**: 17 SPACE cases and three canonical Cycle owner cases (18 database-backed, two pure). Real transactions, concurrent online/replay, atomic receipt failure/rollback, lost COMMIT response, same-ID recovery, changed intent, scope/role/licensing, expiry/authentication, observed lock-wait timing adjustment and expiry, timezone changes, supervisor direction, PIN binding/attribution, known rollback exhaustion and tracking/evidence semantics. |
| Final offline desktop/tablet | **18 passed / 0 failed.** Includes encrypted canonical instructions through actual offline reload. |
| Final changed Dietary PIN journeys | **2 passed / 0 failed**, on the frozen build. |
| Mixed partial-result/retry journey | Included in the final **18-case** run on both viewports: one conflict plus one committed sibling, with no duplicate sibling on retry. Earlier two-case augmentation is retained separately and is not added to final totals. |
| Earlier full Dietary run | **10 passed / 0 failed** on build CU7d1ancdZCL7aX1N7HQV. Reuse only its eight unchanged non-offline cases; both changed cases rerun above. No claim of a fresh full ten-case run on the frozen build. |
| Unchanged dependency/compatibility evidence | Earlier affected group **22 passed** (13 SPACE and one Cycle test overlap final checks; eight unchanged Work/body/semantic cases reused); compatibility/session/Key Time group **38 passed**. Do not add overlapping totals. |
| Build / schema / migration / discovery | Build and its final TypeScript **PASS**; Prisma validation **PASS**; normal migration integrity **150 PASS**; discovery **446 files / 57 SQL suites PASS**. |
| Selected lint | **0 errors / 4 warnings** across final boundary checks; warnings are retained, not suppressed. No whole-repository lint pass is inferred. |

**Local canonical SPACE delivery: PASS. R07-01B local capability gate: PASS within D21's approved first-delivery scope.** Remote CI, wider repository release readiness, production readiness and actual pilot acceptance remain separate open gates.

Both forward migrations are tracked normally. Applied/disk history on the isolated target: 150/150, zero mismatch/pending/unfinished. Existing applied SQL, checksum exception policy, historical receipts and legacy paths are preserved. Original 2,593 index entries remain byte-identical; new files are tracked separately and existing candidate/overlay changes remain reviewable. No unrelated working changes are intentionally replaced.

## Assertion mapping and limits

| Retired obligation | Current substantive proof |
|---|---|
| Service worker / authorized bundle / cache boundaries | Public code cached; actual authenticated preparation encrypts IDB; protected HTML, RSC and API absent from CacheStorage; other tab cannot retrieve its key. |
| Shell reload / missing bundle | Actual protected Space URL reloads with network disabled; absent/locked/expired context displays no operational data or mutation controls. |
| Ready / Started queue, refresh, replay | Canonical Work and Key Time actual queued offline and persisted through reload; a real server response is discarded after COMMIT, then same-ID reconciliation proves one effect/event/actual and receipt. |
| Conflict and sign-out isolation | Another authorized worker's actual causes conflict, not correction. Standard sign-out preserves ciphertext; other actor cannot recover; fresh original actor explicitly reviews and submits the same pending identity. |
| Device/capacity recovery | PIN rebind denies; expiry preserves intent; eight-envelope admission refuses overflow; cleanup does not evict pending intent; full-unbind cancel demonstrates disclosure and preservation. |

Tablet evidence is a Chromium emulated touch viewport, not physical-device/Safari certification. Browser coverage proves the eight-envelope bound; 200-command/2-MiB admission and revision protection also enforce in the IDB transaction but were not exhaustively stress-tested. Streaming UTF-8 byte limits have focused automated proof. All production timing writers must use the fence before canonical offline is made available; mixed old/new writers are not certified. Full destructive unbind is not exercised; cancel/disclosure is. No production key provisioning, real customer pilot or live billing was tested.

## Remaining release actions

- **R07-01A remains unresolved:** latest broader integrated evidence is the prior 3,657 passed / 1 failed / 7 skipped checkpoint (migration 148). Workbook 25-row resumption still exhausted bounded P2034 retries there. This task makes no causal workbook fix and does not erase that failure with focused success. No new full-suite pass is claimed.
- Remote CI/normal release integration has not run for this candidate. Local Node 24/PostgreSQL 14 does not certify the remote Node 20/PostgreSQL 16 jobs. Mandatory gates are not waived.
- Production requires separately authorized private Blob/ClamAV hosting, TLS/CA/secrets, engine/signature updates, ownership and support processor scheduling; local scanner evidence remains historical. Canonical offline also needs managed recovery keys/rotation/retention ownership and production HTTPS. No deployment/configuration authority is inferred.
- Actual pilot Facility/workflow/customer and delivery owners/training window/authorization remain pending. Synthetic demonstrations do not substitute for actual acceptance or effort measurements.
