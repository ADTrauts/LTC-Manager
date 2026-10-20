# Canonical SPACE offline support — proposed implementation plan

**Current authority:** D21 authorizes the first local implementation under the [execution/security contract](./ONB_07_SPACE_OFFLINE_CONTRACT.md). Key Time corrections and expected-time adjustments remain online-only. [Current certification](./ONB_07_SPACE_OFFLINE_CERTIFICATION_2026-10-19.md) records delivery and remaining release gates. The original planning record below is retained as historical context; its planning-only restriction is superseded for this bounded delivery.

## Original planning record (historical)

October 19, 2026. **Planning authorized; implementation is not authorized. R07-01B remains blocked.** This proposal follows the user's explicit planning approval and preserves current Work/Key Time semantics, D09, publication, credentials and historical facts. [Current failure evidence](./ONB_07_FOLLOWUP_2026-10-19.md) remains valid; no new browser or application verification is claimed.

## Current owners and gaps

| Reuse | Required change |
|---|---|
| [Current SPACE execution](../../src/app/(protected)/unit/[unitId]/employee-runtime-page.tsx), [Work panel](../../src/components/department-work/work-completion-panel.tsx), [employee projection](../../src/lib/employee-runtime-flow/index.ts) | Prepare and reopen the exact authorized Space; show preparation, pending, expired, conflict and confirmed states. Remove retired Unit Workspace recovery instructions. |
| [Bundle builder](../../src/lib/offline/build-runtime-bundle.ts), [bundle API](../../src/app/api/offline/runtime-bundle/route.ts), existing OfflineBundleIssuance | Add explicit Department/Neighborhood/Space scope and issuance identity. Current Dietary milestone selection rejects canonical OTHER Neighborhoods as non-SERVERY. Select current PERIOD/KEY_TIME projections independently of legacy meal behavior; removing the type check alone is insufficient. |
| [Encrypted store](../../src/lib/offline/local-store.ts), [crypto](../../src/lib/offline/crypto.ts), [scope/expiry validation](../../src/lib/offline/bundle-validation.ts), [sign-out](../../src/components/sign-out-controls.tsx) | Scope reads/writes/replay by actor/session, Facility, Department, Neighborhood and Space. Existing active bundles are Unit-scoped; standard sign-out retains queues. New preparation must reject plaintext fallback. |
| [Sync API](../../src/app/api/offline/runtime-sync/route.ts), [processor](../../src/lib/offline/process-sync-command.ts), [sync engine](../../src/lib/offline/sync-engine.ts), existing OfflineSyncReceipt/OfflineConflict | Use typed variants: current parsing strips Work/evidence/Asset payloads and requires mealType universally. Add issuance/intent binding and atomic receipts; preserve existing command compatibility. |
| [Work owner](../../src/lib/department-work/occurrence-service.ts), [Key Time actual owner](../../src/lib/operational-cycles/key-time-day-actions.ts), [canonical timing adjustment](../../src/lib/operational-cycles/record-timing-adjustment.ts) | Reuse these writers with a shared transaction-scoped authorization/client path; reconstruct eligible intent from current server facts. Add replay protection to Key Time operations without a second fact store. |
| [Service worker](../../public/sw.js), [static offline fallback](../../public/offline.html) | Provide a scoped client projection after offline reload. Current fallback cannot recreate execution; keep protected HTML/RSC/auth/API responses out of CacheStorage. |

Findings above are source inspection, not new runtime proofs. The prior browser evidence proves the canonical SPACE's actual Save request returns 404.

## Proposed behavior and security boundary

- **Save on this tablet:** from current SPACE execution, prepare the server-authorized published Work and Key Times for that exact actor/location/date. Preparation caches instructions; it does not complete Work or record an actual. Keep prepare and complete distinct, with pending actions labelled “Saved on this tablet — not confirmed.” Show actionable preparation failures and same-intent retry.
- **Eligibility:** re-resolve installed/licensed AVAILABLE Department access, active Space/function, applicable published configuration, current assignment and operational authority. Server session/device context wins. No implicit FA/Console operation, Product enablement, publication or readiness inference. Preserve User versus Employee/PIN attribution; add no PlatformStaff execution identity.
- **Cache lifecycle:** retain the existing **12-hour maximum lease**, shortened by known authority limits; never renew offline. Bind a versioned issuance manifest/revision to exact eligible targets, actor/session version, Facility/Department/Neighborhood/Space and operational date. Encrypt bundles/commands/conflicts; require Web Crypto. No passwords, PINs, JWTs or originals. AES-GCM protects local storage, not malicious same-origin code or server authorization.
- **Expiry/recovery proposal:** expired context cannot render operational data or accept new commands. Retain already queued intent sealed; same-actor online reauthentication and explicit review are required before attempting expired intent. Do not silently discard it, extend its lease or trust the device clock as evidence of when work occurred. Separate claimed occurrence and server acceptance time; preserve canonical late-recording rules.
- **Isolation:** scope-check before decrypt/render and before sending any command. Switching Facility/actor/Space must not relabel queued intent or submit another scope's queue. Standard sign-out closes bundle/UI access but preserves sealed unsynchronized intent for the original actor's later online reauthentication. Keep explicit full-unbind clearing, with pending-count/loss disclosure. Generation checks and cross-tab invalidation prevent late responses repopulating old views. No offline login/unlock.
- **Reopen:** extend the existing static offline fallback with a versioned client renderer using the same scoped projections and command handlers. Reload must work with the network genuinely unavailable; never cache an authenticated document as the shortcut. Missing, incompatible, corrupt or expired bundles show reconnect/review guidance rather than another person's data. Quarantine incompatible pending intent for authenticated reconciliation.

## Preserve canonical operation semantics

| Operation | Offline intent and reconnect rule |
|---|---|
| Work | Reuse COMPLETE_OPERATIONAL_TASK and canonical occurrence keys/completion modes. Rehydrate the eligible published requirement and assignment on the server; never construct authority or a new task from client labels/configuration. Evidence-required Work still requires its canonical Record/evidence; no “complete anyway” path. Existing evidence/Asset commands must retain valid schemas, but new evidence/Asset features are outside this scope. |
| Key Time actual | Add a typed command for the existing completion/actual action, targeting exact expectation, cycle version, date and Space. Append OperationalCycleKeyPointActual; retain configured versus adjusted expected time and OPTIONAL/REQUIRED/NONE occurrence tracking. NONE does not become a mandatory confirmation. No manufactured Ready/Started milestone or Period completion rule. |
| Key Time correction | Separate explicit correction intent: reference the actual being corrected, retain reason and current timing capability, append the correction link without rewriting the original. A duplicate or another worker's completion must never become an automatic correction. |
| Today's Key Time expectation | Reuse canonical OperationalCycleTimingAdjustment with reason and current operational_timing.adjust capability. Freeze the reviewed baseline and resulting intended time when queuing; replaying “+5” must not repeatedly add five minutes. Baseline drift requires review. Do not edit Build, cascade adjustments to children or republish configuration. |

Expose actions only under current capability plus execution scope; do not copy legacy chrome or broaden roles to satisfy tests.

## Exactly-once effects and recovery

Use shared typed command variants with stable clientCommandId, issuance ID, scope, target/version, reviewed baseline and payload digest. No invented mealType; bound bytes/counts and reject unsupported versions.

On reconnect, derive authority from the current authenticated session/device. Recheck lifecycle, session version, D09 access, assignment, publication, Space and issuance after relevant lock waits. Cached role flags/timestamps grant no authority. Rehydrate eligible Work/Key Time intent from server facts.

In one transaction, lock command identity and the natural target, compare immutable actor/scope/digest, invoke the canonical writer and save its authoritative record reference/receipt. Thread that transaction client through authorization/writers. Same ID/same intent returns the prior result; changed payload/scope/actor is rejected. Different IDs racing one target follow canonical duplicate/conflict rules, never implicit correction. “Exactly once” means one canonical effect despite repeated delivery.

A lost response stays pending/unknown. Reconcile the same scoped command before retry, without minting another ID. Return per-command results; accepted siblings remain accepted. Reassignment, changed configuration/baseline, existing actual, lost authority, expiry or rebind require actionable rejection/review. A separately authorized correction must reference the original actual and retain its reason.

**Storage proposal:** extend existing OfflineBundleIssuance with versioned scope/manifest binding and OfflineSyncReceipt with immutable digest, issuance/scope and canonical Work/Key Time result references. Reuse OfflineConflict review. Review additive fields/constraints in one forward migration if needed; no parallel job/receipt/fact model, applied-SQL edits or guessed historical digests.

## Reviewable implementation slices — awaiting authorization

| Slice | Deliverable / acceptance gate |
|---|---|
| 1. Scope and contracts | Shared schemas, eligibility, issuance/receipt and migration review. Valid OTHER Neighborhood/SPACE works; wrong scope, denied/revoked credentials, suspension, unavailable Products and unpublished configuration deny. Existing supported payloads remain valid. |
| 2. Secure preparation/reload | Scoped encryption, expiry, sign-out/switch races and static fallback. Real offline reload at desktop/tablet shows only authorized data. Test missing/corrupt/expired bundles, unsupported crypto and pending-intent preservation. No protected-response cache. |
| 3. Work recovery | Database proof of concurrent/repeated commands, payload substitution, authority/assignment/configuration drift, rollback and lost COMMIT response. Browser disconnect → complete → reload → reconnect yields one legitimate effect/event and receipt, preserving evidence requirements. |
| 4. Key Time operations | Actual/correction/expected-time adjustment through canonical owners. Prove first-actual races, replay, correction chain/reason/capability, baseline drift, timezone/date boundaries and NONE/OPTIONAL/REQUIRED behavior. Build and original actuals remain unchanged. |
| 5. Journey certification | Replace retired Ready/API-cache injection assertions with customer actions while retaining caching, real offline mutation, exactly-once replay, conflicts and sign-out/Facility isolation. Cover password/PIN, two Spaces/Facilities/workers/tabs, rebind/revocation, expiry and partial/unknown recovery at desktop/tablet. Run affected final gates once; retain failures. |

No unchanged offline-suite rerun is useful before these changes. Implementation approval must include the proposed secure-cache expiry/recovery behavior and additive schema review; approval of this planning exercise alone approves neither. Offline gate closure requires actual changed customer-journey and relevant database evidence, normal migration/CI governance and the existing release prerequisites. Production infrastructure and real pilot acceptance remain separate.
