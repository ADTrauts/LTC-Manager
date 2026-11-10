# Product Constitution Amendment — Pre-launch canonical consolidation

**Status:** Accepted product-owner direction, November 10, 2026. Applies to all Codex development and release work.

Vssyl is pre-launch. There is one actual user, the product owner, no paid subscribers, and no external customer facilities relying on the current deployment. Canonical architectural correctness takes precedence over historical development compatibility. This amendment supersedes older instructions to retain retired functionality, readers, tables, or operational test data merely to support previous application versions.

## Preserve the product, retire the experiments

Preserve useful current features, authentication, tenant and Department authorization, database integrity, canonical ownership, relevant decisions, and test evidence. Reuse the existing Facility tree, Records, Operating Rhythm, Menus, Workforce/Assignment, Coverage, Teams, Assets, Work Orders, PM, Operational Time, and Notifications. RLS and Dashboard compose those owners and store no competing operational truth.

Remove Location Functions/Operational Types, profiles/archetypes/bindings, Facility-type Log overlays, generic Work Plans/presets, obsolete applicability, Department Job Role/capability duplication, and their readers/writers/UI/API/schema/tests after rehoming legitimate current behavior. A current ONE_OFF or offline command must retain its supported lifecycle under an appropriate existing owner before its shared retired infrastructure is removed. Do not invent a generic Task/Activity/Duty replacement engine.

`UnitSpace.id` is Space identity. FacilityRoomType is physical classification and a selection aid. Department responsibility and descriptive notes create no Records, Coverage, milestones, permissions, or Team membership. Domain targeting stores explicit canonical IDs.

Teams retain explicit normal room membership where the current workflow needs it, using canonical Space IDs. A Team's room set is a view/configuration fact, not an authorization grant, Coverage requirement, or daily Assignment. This direction supersedes older wording that forbids all Team room membership. Employee identity, Department membership, eligibility, and daily placement retain their distinct canonical owners.

## Infrastructure and source

- Retain Neon organization `org-hidden-leaf-35421142`, project `damp-hill-35484256` (`ltc-manager-db`). Necessary nonproduction environments belong to that organization or disposable local PostgreSQL.
- Retire certification project `delicate-unit-53515438` (`vssyl-cert`) and its dedicated organization `org-quiet-cake-64686025` only after verifying that active dependencies and unrelated resources are absent. Do not delete a shared identity, the retained organization, or unrelated infrastructure.
- Active source is `ADTrauts/LTC-Manager`. Reconcile remote and local work without losing useful changes or accidentally triggering deployment. Preserve uncertain work in a temporary archive, then remove it from the active architecture.
- Development proceeds through Codex on the documented canonical consolidation branch. Historical release candidates are evidence, not parallel active product authorities.

## Database baseline and cutover

The owner authorizes removal of obsolete pre-launch persistence and a fresh baseline. Disposable verification databases may be created/reset within explicitly identified local/test targets. Production already has 189 completed migrations, including the two Phase 2D additions; do not reapply them.

After ownership and retirement are settled, create and verify the final schema from an empty database. Archive the old migration chain in Git/history outside the active installation path. Do not edit historical receipts or use `migrate resolve` to disguise an existing-schema mismatch. Prefer a fresh database/branch in the retained project.

Provide a small reproducible canonical seed: product-owner login, Facility, relevant Departments, minimal physical hierarchy, required catalogs and permissions. Retain useful physical configuration only as an explicit small seed/export. Discard obsolete test/operational history rather than building a compatibility migration framework.

**One coordinated cutover checkpoint** must identify the old and new databases, data discarded/recreated, active connection changes, source SHA, deployment, maintenance window, and verified owner access before replacing the active production connection or destructively resetting that database. Routine implementation and removal of individual retired components do not need separate product decisions. A historical application need not remain schema-compatible after that coordinated cutover.

## Verification and governance

Verify populated vertical UI workflows through persistence/reload, server responses, runtime/Dashboard composition, and unauthorized access. Include configured/unconfigured states, Unit and Space Coverage, Team room membership, Records evidence/Review, Rhythm/Key Points, Menus/service locations, Asset/WO/PM, employee/offline receipt idempotency, and Department/cross-facility isolation. Use existing test infrastructure; retain permanent regressions for PF-2D-001/PF-2D-002. Retire tests that enforce intentionally removed behavior.

Update the Architecture Reconciliation Register from actual implementation and verification. Close a finding when its dependency has been removed and verified; do not keep it open solely because an older application once used that structure. Preserve historical reports as dated evidence with this amendment's precedence clear. Do not activate unrelated features or change product packaging during consolidation.

## ONE_OFF decision — accepted November 10, 2026

The product owner selected explicit employee/operational-role/location Assignments under the existing Workforce owner. Preserve useful instructions, completion/reopen history and supported offline receipt/idempotency behavior there. Free-form unassigned, role-less or place-less Work is not the canonical contract. Complete and verify that rehome before removing the shared generic Work implementation. This acceptance does not imply the rehome is already implemented.
