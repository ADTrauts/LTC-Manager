# Vssyl — Phase 2D final release preflight

Date: November 9, 2026 (America/New_York). Active repository: `ADTrauts/LTC-Manager`.

**Certification: BLOCKED.**
**Deployment recommendation: BLOCKED — REMEDIATION REQUIRED.**

The candidate's identity is reconciled and all eight authorization persona cases pass the final browser/HTTP matrix. No unauthorized operational disclosure was confirmed. However, the actual Runtime Location State database prefetch drops explicit Coverage Space targeting. A configured staffing shortfall disappears from runtime slots and Dashboard Coverage. This is one material functional defect, reproduced by two failing assertions. It prevents a release recommendation.

No application fix was made. No production/staging migration, production data write, push, deployment, promotion, rollback, or new architecture phase was performed.

## Candidate identity and source protection

| Item | Verified result |
|---|---|
| Starting and ending source HEAD | `e1fc6d2b56e47d84df0a2a16993cf3a518eacb21` |
| Assessed final candidate | `e1fc6d2b56e47d84df0a2a16993cf3a518eacb21` — identified, but blocked for release |
| Previously certified application tip | `9bc5f8320f8491a0c66dab894391bdf3f199d4cb` |
| Intermediate documentation commit | `8abdb944f90745ac873938f42270f42be246fa96` |
| Ancestry | `9bc5f83` → `8abdb94` → `e1fc6d2`; all exist and are ancestors of starting HEAD |
| Changes at `8abdb94` | Adds the 2D-6 report; updates the Architecture Reconciliation Register |
| Changes at `e1fc6d2` | Edits only the 2D-6 report's candidate references to its preceding documentation commit |
| Executable/config/schema/migration differences after `9bc5f83` | None |
| Non-documentation tree digest | SHA-256 `bcc8fd14752be322cf6e4d2a5ad481d092879e494dea427be19965488150061c` at all three commits |

Digest method: SHA-256 of the sorted `git ls-tree -r` records, including object IDs, for every tracked path outside `docs/`. Complete Git tree IDs are in the evidence JSON. The summary named the latest commit; the report named its documentation parent. These are the same application implementation, not competing executable candidates. The newly discovered defect exists in that implementation; the prior green evidence does not certify this missing integration behavior.

The actual source checkout is `/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager`. It was already dirty: the canonical Coverage migration file was deleted, an untracked directory named `20261109180000_coverage_template_item_space 2` contained an identical copy, and the existing R4 evidence/harness and `.neon` were untracked. These were preserved. The duplicate migration's bytes match the committed candidate; the dirty directory must not be uploaded or used as a migration source.

A separate Git clone with independent metadata and detached HEAD was created under this chat's `work/phase2d-preflight`. It contains the exact committed migration path and excludes the source checkout's untracked material and credentials. Fresh `npm ci --ignore-scripts`, explicit Prisma generation, clean candidate typecheck, and a fresh 189-migration disposable database succeeded. Browser execution used the locked Next.js 16.3.5 application with webpack and localhost PostgreSQL. Next dev added generated type directories to **only the isolated clone's** `tsconfig.json`; no application source was changed. This generated config change was removed after testing.

Local `main` had already advanced to `fdd3ac7` before this preflight; its reflog records the preceding Phase 2D commits. It is 20 commits ahead and 24 behind the stored/live remote `main`, which remains `56de3123ae6e5aa99a2979d8a6200469389c3cdb`. The candidate branch has no upstream. This preflight changed no branch refs and pushed nothing. Documentation is left uncommitted, so no later certification SHA is implied.

## Authorization fixture and results

The fixture uses two synthetic Facilities, Dietary, EVS, Plant, shared and Department-exclusive Spaces, a separately restricted Neighborhood, independent Department notes, nonempty explicit Records requirements, completed evidence in every Department including the foreign Facility, published Cycles, explicit Coverage needs, Teams with explicit room memberships, and a confirmed Assignment to one room. IDs are deterministic valid CUID-format values. Accounts use the canonical activation/access-grant helper and current role/partner period models. No resident or real employee data is used.

| Persona | Actual grants/model | Actual surfaces and result | Result |
|---|---|---|---|
| Dietary-only | Internal MANAGER; Dietary primary membership; MANAGE Dietary, NONE EVS/Plant | `/dashboard`, shared SPACE, `/staffing/logs`; 3 authorized requirements and Due=3; EVS/Plant markers absent | PASS |
| EVS-only | PARTNER_MANAGER, EVS operator, explicit partner scope/access/role periods, accepted vendor head | `/partner`, `/partner/logs`; 2 EVS requirements and Due=2; Dietary/Plant markers absent | PASS |
| Multi-Department | Internal MANAGER explicitly recorded as Dietary and Plant head | Both `/dashboard?scope=department:…` lenses; Dietary 3 and Plant 2 present; no EVS expansion | PASS |
| Facility-wide | Single FACILITY_ADMINISTRATOR; live CDA map gives VIEW Dietary/Plant and SUMMARY contracted EVS | Facility Dashboard admits the customer-operable Dietary/Plant set; exact Due=5; no foreign/EVS-private contribution | PASS |
| Read-only | Same supported Administrator account; VIEW Dietary; not its head | Authorized read present. Actual `createDepartmentTeam` service rejects; Team row count unchanged | PASS |
| Limited employee | STAFF; EmployeeUnitAccess to one Neighborhood; confirmed Assignment to shared room | Assigned SPACE permitted. Different Neighborhood and unassigned room in the allowed Neighborhood show explicit assignment denial with no private data. Dashboard viewer resolver refuses this role | PASS |
| Unauthorized Department attempt | Dietary manager with forged EVS cookie, lens and target identifiers | Dashboard falls back to Dietary. EVS target, explicit Log Book department and completed-record drill-down deny access. Populated search service rejects EVS | PASS |
| Cross-facility attempt | Dietary account has no second-Facility grant | Foreign SPACE and evidence drill-down 404; foreign Dashboard lens cannot expand scope; valid foreign Facility switch returns 403 | PASS |

The broad and read-only scenarios intentionally reuse the one Administrator: the production model permits one seat, not a fabricated second Administrator or a new read-only role. Broad visibility was verified from the live policy result, not assumed from the title. EVS remains DEVELOPMENT and is excluded from native customer Dashboard selection. Its tested persona uses the existing supported partner Dashboard path; native EVS customer visibility is not claimed.

The final matrix has **8 pass / 0 fail / 0 skip**, with **21 actual response bodies inspected**. Chromium rendered and inspected the Dietary and EVS partner Dashboards, including a screenshot. Other persona scenarios use authenticated HTTP against the real Next application plus direct server integration; this is not a claim that eight separate browser UI journeys were completed. There is no invented authorization API.

Server integration adds shared-room notes, actual Team room resolution, populated evidence search, and strict aggregate assertions. All eight persona server cases also pass. Team rooms remain independent from today's Assignment: three explicit Team rooms do not authorize the employee outside the one assigned room.

## Payload, aggregate, and overfetch evidence

- Exact authorized Records Due counts are 3 Dietary, 2 EVS, 2 Plant and 5 for the authorized facility composition. Operational markers from other Departments are absent in the tested payloads. Forged Department fact calls fail before their loaders run.
- The same physical Space returns distinct Dietary and EVS notes through their scoped readers. Shared physical metadata does not add the other Department's requirements or Teams.
- Actual evidence search returns the populated Dietary record and rejects unauthorized EVS/foreign Facility searches. Route drill-down denials were tested against existing synthetic records, not nonexistent IDs.
- Dietary Dashboard Attention includes its three Records and one Menu configuration warning; Plant's scoped attention includes its two Records. Facility attention contains the permitted five Records plus that Menu warning. No unauthorized EVS contribution was observed. The EVS partner's eligible attention behavior is reported as implemented; its Records card is positively populated.
- Runtime readiness is explicitly `deferred_legacy_engine`, with null readiness state. No quantitative readiness percentage exists on this path to certify. No percentage was invented or reported as passing.
- `facts.ts` still performs internal Facility-lens location overfetch, then filters actionable refs by authorized Department and Team rooms before loading operational state. The populated HTTP and integration checks found no unauthorized serialized or aggregate contribution from this overfetch. This remains internal efficiency debt, not a proven disclosure.
- The first search test detected the submitted query string in Next's serialized routing metadata. Inspection showed request echo, not an operational record. The final test uses real supported department/search filters and populated evidence. The first employee check incorrectly expected HTTP 404; the application intentionally returns HTTP 200 with an explicit assignment-denial view. Final assertions check that denial and absence of operational data. Neither was counted as a confirmed disclosure.

## Confirmed blocker: Coverage Space targeting is lost in RLS

**Identifier:** PF-2D-001. **Severity:** release blocker. **Class:** missing configured operational expectation; no confirmed cross-Department disclosure.

Affected source at the assessed candidate:

- `src/lib/runtime-location-state/prefetch.ts:72` — intermediate item shape lacks `spaceId`.
- `src/lib/runtime-location-state/prefetch.ts:91` — `toCoverageTemplates` maps `unitId` and OT keys but omits `spaceId`.
- `src/lib/runtime-location-state/prefetch.ts:277` — Prisma item select also omits `spaceId`.
- `src/lib/runtime-location-state/compose.ts:444` — canonical expectation matching receives that incomplete item.
- `src/lib/dashboard/cards/present.ts:98` — with no resulting gaps and no other staffing warnings, Coverage returns “Coverage is in place.”

Deterministic reproduction:

1. Publish a Dietary Coverage template item aimed at the shared `UnitSpace.id`, `unitId=null`, empty legacy OT keys, required count **2**.
2. Publish an explicitly targeted Cycle active at noon on the fixture service date. Confirm an Assignment plan with one matching employee assigned to that room.
3. Query the persisted template item: its Space target exists and required count is 2.
4. Call the actual `prefetchRuntimeLocationInputs` with that authorized Department/Space pair. The resulting template item has `spaceId=undefined`.
5. Call the actual `loadRuntimeLocationStates`. The Cycle is ACTIVE and the plan is RUNTIME_VISIBLE, but `coverage.slots=[]` instead of one slot requiring 2 with 1 filled. Dashboard Coverage reports its quiet “Coverage is in place” state.
6. Diagnostic control only: restore the dropped `spaceId` in the **test's in-memory prefetch result** and pass it to the same unmodified canonical composer. It produces one slot, required=2, filled=1, state=AT_RISK. An analogous Unit-target control produces one slot too.

The diagnostic control changes no application file and is not a remediation or a passing candidate. It isolates the fault to the missing prefetch field. Matcher-only hermetics pass because their inputs already contain `spaceId` and therefore do not cover this database adapter.

**Smallest safe remediation scope:** add `spaceId` to the RLS Prisma select, intermediate item type, and `toCoverageTemplates` mapping; add a database-backed regression covering actual prefetch → RLS → Dashboard for explicit Space needs, with Unit targeting and Department isolation as controls. Repeat the affected Coverage/RLS/Dashboard checks and typecheck/build on the resulting new application SHA. Keep historical OT compatibility and offline contracts unchanged. No Dashboard/RLS rewrite or schema change is needed. The remediation was deliberately not implemented in this bounded certification task.

## Final test ledger

| Final suite | Pass | Fail | Skip |
|---|---:|---:|---:|
| Eight-persona browser/HTTP matrix | 8 | 0 | 0 |
| Server integration and targeted diagnostics | 12 | 2 | 0 |
| Focused Coverage Space, RLS and Dashboard fact hermetics | 35 | 0 | 0 |
| Total final test cases | **55** | **2** | **0** |

Totals are suite cases, with intentional overlap of personas between HTTP and server layers; they are not 57 distinct user journeys. Both failures represent PF-2D-001. Harness setup failures and corrected assertions from earlier attempts are excluded from the final ledger, not erased from working logs. The final harness exits nonzero when its assertions fail.

Fresh clean-candidate typecheck passed. The final fixture builder also completed from scratch against another disposable 189-migration database. Prior production build, CDA manifest, core 48/48, offline tablet 18/18 and Chromium 18/18 evidence is retained as historical certification of the identical executable tree; those full suites were not unnecessarily replayed. This new integration failure identifies a gap in that prior evidence.

## Migration and production configuration readiness

Both required migrations exist in the committed candidate at their canonical paths, in the correct order. Their bytes match their introducing commits, the prior application certification tip and both documentation tips:

| Migration | SHA-256 |
|---|---|
| `20261109150000_department_space_responsibility_notes` | `5e8097cc259ba57d0ec9a34e14f022ce58004f4979e6f969108f0c69a6f0c16c` |
| `20261109180000_coverage_template_item_space` | `b6fe0559b8ee0807c9ada8703123a8e68ca247422834ef80118c5e783edd8c5a` |

Notes adds nullable TEXT. Coverage adds nullable TEXT, an index and a foreign key to UnitSpace with ON DELETE SET NULL / ON UPDATE CASCADE. Neither drops or rewrites historical data. Unit-level Coverage, existing responsibility rows and all six Work compatibility tables remain valid. A fresh local `migrate deploy` completes 189 migrations. The earlier 187 → 188 → 189 ordered rehearsal remains valid because the migration bytes are unchanged; it was not repeated against production.

Read-only production checks used the existing configured Neon endpoint, matched to the recorded production host, through its equivalent unpooled hostname. The connection enforces `default_transaction_read_only=on`, and queries execute inside `BEGIN READ ONLY`. Output contains aggregates only:

- 187 finished migrations; both Phase 2D migrations unapplied and both new columns absent.
- `20261106214500_restore_schema_after_premature_retirement` applied; all six expected Work compatibility tables present.
- Three latest published Dietary KEY_TIME entries, all LOCATION grain, each with one group and nine explicit rooms. Zero inspected LOCATION entries lack participating rooms. Their configuration timestamps are unchanged from the earlier published set.
- Public `/login`, `/api/health/live`, `/api/health/ready` return 200; readiness reports auth, database and migrations healthy.

No live Key Time configuration change is required for the inspected set. No Room Type, kitchen/servery or all-rooms fallback is used. Migration readiness is PASS; **application release readiness is blocked separately by PF-2D-001**.

The old Phase 2C application's schema contract remains compatible with these two nullable additive columns. Application rollback requires no database column removal. That conclusion uses the verified SQL and retained earlier rehearsal; a second Phase 2C application server was not relaunched in this pass. The Phase 2D client expects both columns before promotion.

## Production deployment and rollback

| Item | Verified result |
|---|---|
| Vercel project | `ltc-manager`, `prj_O3x1tS8yS1rFQEmd73rofZboIDCK` |
| Team | `team_djeRA5ZpmVTjCf6opbxfj6SS` |
| Protected production/rollback deployment | `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` — READY, reconfirmed |
| Hostname | `ltc-manager-91mwwm29t-adtrauts-projects.vercel.app` |
| Public aliases | `vssyl.com` and `www.vssyl.com` map to that deployment; www redirects 308 to apex |
| Protected Phase 2C SHA | `7973254ee87da2d94291f4282337441944d042fa`, established by preserved deployment report and parked checkout |
| Independent asset evidence | Live `space-offline.js` exactly matches that commit; SHA-256 `c565f577503a0d94b38fd3124408cdc1dd60978641b7579f64cd6a447e6b17c8` |

The Vercel connector returns this CLI deployment's Git metadata as empty; it cannot independently re-attest every deployed source file or the full SHA. The deployment report, parked commit, unchanged public alias identity and matching served asset support the recorded rollback identity. The deployment remains available; no older Phase 2C rollback was substituted and no rollback was executed.

## Prepared release sequence — not executed

1. **Resolve PF-2D-001 first.** Obtain authorization for that bounded application fix, verify it, then identify its new certified SHA. Do not release `e1fc6d2` as-is. Use a clean detached checkout; exclude `.neon`, credentials, R4 untracked work, duplicate migration directories and disposable artifacts.
2. Recheck production migration count/columns, published Key Time room membership, Vercel project/aliases and READY Phase 2C rollback target immediately before the release window. Arrange a protected Neon recovery branch/snapshot at the pre-expansion point, verify restore retention/access and record its identity. Creating that production recovery precaution was not attempted here.
3. Only after separate product-owner deployment authorization, apply the notes migration, verify column/data/app health, then apply Coverage Space, verify its nullable column/index/FK and application health. Confirm Phase 2C still works before continuing. No destructive down migration.
4. Stage the new certified application with production configuration without assigning public aliases. Verify the deployed source identity and smoke login, Department notes, Coverage (including an actual Space staffing shortfall), Dashboard, Records, meal timing and offline compatibility.
5. Promote only the verified deployment to `vssyl.com` / `www.vssyl.com`, then check production health, representative authorized flows and runtime errors.
6. On a material regression, restore the verified Phase 2C application deployment and aliases. Preserve the additive columns and operational records. An application rollback does not reverse database migrations.

## Retained debt and limits

ARR-003, ARR-004 and ARR-008 remain open. Work OT compatibility, historical Coverage OT matching, Audit/Review reconstruction, Facility-type Build overlays, profile/archetype persistence, RLS compatibility sidecars and retired authoring stubs remain intentionally retained. No new generic room profile, automatic Room Type obligation or forward LF/OT replacement was introduced. Existing optional configuration remains optional.

Registry practical examples still contain superseded LF/Work wording; the Constitution's 01A/01B amendments and the actual Phase 2D implementation govern. The handoff's generic document labels “Operational Language”, “Build Architecture”, “Runtime Architecture”, “UX Interface Architecture” and “Platform Technical Architecture” do not exist verbatim in this checkout. The corresponding Language Guide, Build/Run information architecture, Runtime Permission Model, Dashboard architecture, Experience Framework index and current Platform Atlas were used; older Experience/profile ownership language was treated as superseded.

Remaining scope limits: no physical-device tablet test, no full notification recipient/delivery matrix, no production operational writes, and no second full build/offline rerun. Quantitative readiness is unavailable by the current RLS contract. These do not override the confirmed Coverage blocker or turn it into an acceptance-only gap. Raw local fixture state, cookies and environment files are excluded from exported evidence.

**Exact next action:** authorize and complete the narrow RLS `spaceId` propagation fix and its database-backed regression, then recertify the new candidate. Production migration/deployment approval is premature. Stop this preflight here; no deployment or next architecture phase is authorized.
