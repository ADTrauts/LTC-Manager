# Phase 2C-2D — Offline Job Flow integration & compatibility

**Date:** November 8, 2026  
**Verdict:** **PASS WITH GAPS**  
**Nature:** Additive offline `jobFlowItemContext` snapshot aligned with canonical items; legacy Work / evidence / milestone command contracts preserved.

---

## 1. SHAs

| | |
|---|---|
| Starting HEAD (2C-2C checkpoint) | `ebaac8bd9086d6a61b0628ba9cd4132af6b4e706` |
| Ending HEAD | `b36de82` (committed after certification) |
| Prior | `bf83128` (2C-2B), `99a90ab` (2C-2A) |

Preflight: 2C-2C verified (64 hermetics), committed as `ebaac8b`. `.neon` excluded.

---

## 2. Exact files changed

| Path | Change |
|---|---|
| `src/lib/offline/types.ts` | Additive `jobFlowItemContext` + `OFFLINE_JOB_FLOW_ITEM_SCHEMA_VERSION` |
| `src/lib/offline/index.ts` | Exports |
| `src/lib/employee-runtime-flow/serialize-offline.ts` | Serialize / read item snapshots; `offlineActionForJobFlowItem` |
| `src/lib/offline/build-runtime-bundle.ts` | Load assigned WO + call-off into compose; emit `jobFlowItemContext` |
| `src/lib/employee-runtime-flow/index.ts` | Exports |
| `src/components/offline/offline-job-flow-context.tsx` | Present cached items once; view-only vs syncable badge |
| `src/lib/employee-runtime-flow/phase-2c2d-offline.hermetic.test.ts` | **New** |
| `src/lib/employee-runtime-flow/phase-2c2c-presentation.hermetic.test.ts` | Expect items serialization (2C-2D) |
| `docs/architecture/PHASE_2C2D_OFFLINE_JOB_FLOW_COMPATIBILITY.md` | This report |
| ARR register | Progress note |

---

## 3. Existing offline architecture (inventory)

| Stage | Mechanism |
|---|---|
| Bundle issue | `buildRuntimeBundle` → `OfflineRuntimeBundle` + `offlineBundleIssuance` |
| Storage | Indexed path via `local-store` / sync-engine (encrypted device key) |
| Display | `OfflineJobFlowContext`, evidence form, work completion panel, servery controls |
| Queue | `OfflineCommandEnvelope` + `OFFLINE_COMMAND_TYPES` |
| Sync | `/api/offline/runtime-sync` → `process-sync-command` |
| Receipts | `offlineSyncReceipt` / conflict rows |

**Command inventory (execution owners):**

| Command | Domain |
|---|---|
| `COMPLETE_OPERATIONAL_TASK` | Compatibility Work occurrence |
| `SUBMIT_OPERATIONAL_EVIDENCE` | Records / Harbor or fenced template |
| `RECORD_SERVERY_READY` / `RECORD_MEAL_SERVICE_STARTED` | Dietary servery milestones |
| `REPORT_ASSET_ISSUE` | Asset issue |

No Work Order completion command exists. Space-scoped offline protocol is separate (`space/1:*`).

---

## 4. Canonical offline item display contract

`OfflineJobFlowItemSnapshot` carries: `ownerKind`, `ownerId`, label, ownerState, attention, place, time (ISO due + locals), href, compatibility, informational, `offlineAction`.

Context: `schemaVersion: 1`, `lastSyncedAt`, `snapshotOperationalDate`, `items[]`.

Snapshot only — not a new operational store.

---

## 5. Offline-displayable sources

| Source | Display |
|---|---|
| COMPATIBILITY_WORK | Yes (from `flow.items`) |
| RECORD_REQUIREMENT | Yes |
| OPERATING_RHYTHM_KEY_POINT | Yes |
| WORK_ORDER | Yes (assigned-to-me via Job Flow loaders) |
| ASSIGNMENT_EXCEPTION | Yes (informational) |
| PREVENTIVE_MAINTENANCE | No standalone (WO owns execution; deduped) |
| Asset issues | Unchanged compatibility (not forced into items) |

---

## 6. Offline-actionable sources

| Source | `offlineAction` | Notes |
|---|---|---|
| COMPATIBILITY_WORK | `COMPLETE_OPERATIONAL_TASK` | Existing Work queue |
| RECORD_REQUIREMENT | `SUBMIT_OPERATIONAL_EVIDENCE` | Existing evidence path |
| SERVERY_READY / MEAL_SERVICE_STARTED | Record commands | Existing milestone path |
| KEY_TIME Key Points | `null` | Display; key-time expectations remain separate |
| WORK_ORDER | `null` | Read-only; plant context also `offlineMutationsSupported: false` |
| ASSIGNMENT_EXCEPTION | `null` | Informational |

`href` never grants an action.

---

## 7. Bundle version / backward compatibility

- Additive optional field — no breaking protocol change.
- `schemaVersion !== 1` → `readOfflineJobFlowItems` returns `[]` (predictable degrade).
- Missing `jobFlowItemContext` → empty items; `workContext` / evidence / milestones still work.
- `bundleVersion` / lease / scope validation unchanged.
- Queued `COMPLETE_OPERATIONAL_TASK` still processed by existing server path.

---

## 8. Legacy Work command preservation

- `serializeEmployeeRuntimeWorkContext` unchanged and still emitted.
- `processWorkCompletionCommand` untouched.
- One-off / published Work semantics unchanged.
- No rejection of older cached Work commands.

---

## 9. Authorization and scope

- Bundle still facility / unit / actor / sessionVersion / device scoped.
- WO load fail-closed to assigned employee + responsible Department.
- Call-off only for the actor’s own shift.
- Items do not enable arbitrary offline object fetch by `ownerId`.

Disconnected revocation limitation unchanged (documented existing lease model).

---

## 10. Time and snapshot state

- `snapshotOperationalDate` = facility service date at issue.
- Owner attention/state frozen at snapshot — no device-midnight overdue invent.
- UI labels “cached” / “Stale snapshot” when `jobFlowContext.stale`.

---

## 11. Duplicate prevention

- Composition still dedupes `ownerKind:ownerId` and PM↔WO.
- Offline strip lists `jobFlowItemContext` once; does not re-list `workContext` rows.
- `plantWorkOrderContext` remains for Plant clients; no second UI consumer yet.

---

## 12. Progressive configuration

Empty contributors → empty `items` array (context still issued when Job Flow path runs). Missing optional `jobFlowItemContext` on old bundles → safe empty.

---

## 13. Tests

**Pass (81):** 2C-2D offline hermetics, 2C-2C presentation, item/ERF/present, offline-hermetic, 2A/2B fences.

---

## 14. Browser / device verification

Not performed live. Hermetic + source contracts only.

---

## 15. Known limitations (gaps)

- Work Orders remain **read-only** offline (no completion command).
- KEY_TIME Key Points display-only offline (no new Key Point sync command).
- Offline next-action parity not fully mirrored in the strip (expectation string + item list).
- Space offline protocol separate from Runtime bundle items.
- No live tablet certification.

---

## 16. Remaining Work dependencies

- `flow.work` + `workContext` for execution
- Online CompatWork contribution
- Dashboard / supervisor Expected Work
- ARR-003 remains **OPEN**

---

## 17. Recommended Phase 2C-2E prerequisites

1. Decide whether offline WO execution is in scope (new command + sync) or stays online-only.  
2. Optional: project next-action from `jobFlowItemContext` offline.  
3. Dual-read period complete → plan CompatWork reader retirement **with** PO approval.  
4. Do **not** change Work command semantics or drop schema without approval.

**STOP** after this phase.
