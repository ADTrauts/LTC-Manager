# Vssyl onboarding — phased implementation plan

Prepared October 17, 2026 from the accepted [onboarding audit](./VSSYL_ONBOARDING_AUDIT_2026-10-17.md).

**Status:** product direction accepted by Andrew; implementation plan prepared; application implementation has not started. Phase identifiers `ONB-00` through `ONB-07` are local to this program. They do not replace existing project wave numbers or imply that other programs are complete.

**Implementation target:** current Vssyl and VSSYL Console in [ADTrauts/LTC-Manager](https://github.com/ADTrauts/LTC-Manager), local checkout `/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager`. The repository named ADTrauts/Vssyl is the mothballed predecessor and is not a source of implementation patterns for this program.

**Baseline:** current checkout remained clean at `c7b5e68b372600b77c69108a8e4a351c6e6753f8` when preparing this plan. The audit's focused test run had 92 passes and four installation-test mock failures out of 96 tests. Recheck the checkout and baseline when implementation begins.

## Intended outcome

A new customer can establish a site with minimal information, choose self-service or paid VSSYL implementation, select departments now or later, import existing lists safely, and prepare one department for use without finishing every other department.

The commercial order remains: select an AVAILABLE Department Product → license → install → configure → publish applicable configuration → Run. A site may enter setup before choosing a department. An import never creates a license, changes Product release status, or publishes operations implicitly.

Self-service and VSSYL staff use the same validation and domain services. Paid implementation adds ownership of intake, mapping, cleanup, configuration, review, training and launch preparation.

## Accepted direction and bounded decisions

The following direction carries forward the user's agreement with the audit:

- Initial site entry requires administrator identity/access, site name, owning Organization and confirmed timezone. Billing email is required when starting checkout; known values are prefilled.
- Extra managers, complete location hierarchy, full roster, assets and additional department configuration are optional during site entry.
- Department selection may be deferred during site setup. Available departments may be purchased together and configured independently.
- One Product instance per facility remains the current rule. Wings and teams do not create duplicate Product installations.
- Admin governs site ownership, access and licensing. Build owns operational configuration. Console staff retain their own identity.
- Configuration preparation is derived from canonical facts and existing validators. Do not add `Department.setupComplete` or a second readiness engine.
- Individual CSVs remain supported. The combined onboarding package is XLSX, using the same domain plans.
- Import → validate → preview → confirm → summary is the common flow. Publication is a separate deliberate action.

Some implementation decisions still require a concrete design, without blocking unrelated work:

1. **Credentials:** preserve the current email-backed identity contract for the initial bulk release. Design PIN enrollment/pending activation before bulk employee creation. Supporting employees without individual email is a separate product decision, not implied permission to create unlinked identities.
2. **Commercial transitions:** explicitly define PAST_DUE grace behavior, cancellation timing, grandfathering and test/pilot exceptions in the existing commercial owner before changing enforcement. A missing Stripe key is not a customer entitlement.
3. **Paid-service orders:** define initial-purchase and existing-subscriber implementation charges, agreed department scope and repeat-charge prevention before offering those purchase paths.
4. **File commit semantics:** specify transaction boundaries and recoverable partial results before advertising workbook-wide rollback.

These decisions are recorded in the phase that owns them. Routine implementation choices do not require reopening the accepted product direction.

## Sequence and release boundaries

`ONB-00 Align → ONB-01 Protect roster data → ONB-02 Correct setup/licensing → ONB-03 Simplify entry → ONB-04 Enable bulk setup → ONB-05 Deliver assisted onboarding → ONB-06 Add XLSX → ONB-07 Certify and pilot`

Each phase ends with evidence and a completion record before dependent work proceeds. The suggested review slices below are planning units, not an instruction to create all pull requests at once.

- **Protection release:** ONB-01 and ONB-02 can deliver fixes before the new experience is finished, after their own gates pass.
- **Self-service CSV pilot candidate:** ONB-03 and ONB-04 provide the simpler journey and safe bulk setup. A bounded pilot still requires the relevant ONB-07 checks.
- **Assisted pilot candidate:** ONB-05 makes service delivery traceable; it can work with CSV and existing source files before XLSX ships.
- **Complete onboarding package:** ONB-06 followed by full ONB-07 certification.

The default execution order is sequential. These release boundaries allow useful smaller releases; they do not waive dependencies or verification.

## ONB-00 — Establish the implementation contract

**Purpose:** make the accepted direction executable against the current product without inheriting obsolete plans or naming ambiguity.

**Work:**

- Revalidate the audit's affected paths and current uncommitted work. Use the current constitution and Department Product contract as authority; the July implementation index is marked historical/superseded.
- Add the program to the active repository's current documentation structure when implementation starts, with links back to the audit. Keep one phase tracker and one decision log; do not create another product constitution.
- Record site-entry versus commercial access versus configuration/publication semantics, including what the existing Facility onboarding timestamp means going forward.
- Resolve the documented Plant release-status conflict among root instructions, registry and Product/commercial documents. Do not change a Product's release status or sellability as a side effect of onboarding work.
- Repair the four identified installation test doubles so they model the current department-operator calls. Require assertions that still prove facility scoping, idempotency and Product restrictions.
- Specify employee update semantics: absent column preserves; explicit changes are previewed; clearing is deliberate and supported only for appropriate fields. Confirm which domain services own workforce, access and employment changes.
- Specify the shared file contract: version, target scope, row provenance, stable references, dependency resolution, actor identity and confirmation/retry semantics.
- Add clear current-versus-legacy identity banners/project labels where supported. Prepare a separate rename checklist for remotes, CI and deployments; repository rename is not a prerequisite for the protection fixes.

**Review slices:** baseline/tests and authority alignment; onboarding/import decision record and phase tracker.

**Exit gate:** current owners and compatibility paths are named; the known focused baseline failures are resolved or replaced by an explicitly scoped blocker with evidence; accepted decisions are recorded; no unresolved release-status ambiguity is silently encoded into new customer behavior.

**Release/data impact:** documentation and test-fixture work. No customer-state migration is justified by this phase alone.

## ONB-01 — Protect employee roster updates

**Purpose:** eliminate the most immediate data risk while employee import remains update-only.

**Primary owners:** [employee parser](<../../src/lib/employee-csv-import.ts>), [import action](<../../src/app/(protected)/employees/csv-import-actions.ts>), [upload form](<../../src/app/(protected)/employees/import/import-csv-form.tsx>) and the existing shared import UI.

**Work:**

- Parse updates as changes to supplied fields instead of complete replacement records. Preserve omitted email, role, employment/status, HR data and workstations.
- Separate parsing/validation and change planning from execution. Preview exact changed/cleared fields, identity matches, conflicts and row errors before confirmation.
- Reject ambiguous matching. Prefer a verified stable employee reference or unique email; do not silently select a same-name person.
- Treat termination, reactivation and authority changes as explicit domain operations with the normal lifecycle/access rules. They must not happen because a missing column defaulted to ACTIVE or STAFF.
- Reauthorize and revalidate against current data at confirmation. Changed target records require renewed review when the planned effect changes materially.
- Remove stale “upsert/new rows” promises while creates remain unavailable. Show accurate committed/failed counts and transaction boundaries.

**Review slices:** preserve-field/matching fixes and meaningful regression tests; preview/diff/confirm integration and corrected copy.

**Required evidence:** names-only update preserves every unprovided field; deliberate clear is distinct from absence; upload/preview writes nothing; invalid/ambiguous rows cannot silently mutate; a stale preview does not overwrite a changed record; wrong-facility and Quick PIN requests fail; session revocation and termination history remain correct for explicit permitted changes.

**Exit gate:** no ordinary update file silently resets unprovided fields, and a customer sees the intended effects before mutation. If execution uses per-row transactions, partial success is visible and retry behavior is explicit; do not claim file-wide atomicity.

**Release/data impact:** existing roster data is preserved; no historical data is rewritten. Use the existing rollout mechanism or a small scoped switch if necessary. The old unsafe update behavior is not a fallback.

## ONB-02 — Make setup and licensing transitions consistent

**Purpose:** stop payment-method, checkout-return and location endpoints from asserting contradictory completion/access states.

**Primary owners:** [onboarding state](<../../src/app/api/onboarding/state/route.ts>), [location finish](<../../src/app/api/onboarding/locations/route.ts>), [Stripe synchronization](<../../src/lib/billing/sync-from-stripe.ts>), [Product eligibility](<../../src/lib/department-products/eligibility.ts>), proxy and Console customer projection.

**Work:**

- Consolidate Facility onboarding transitions into one server owner and route every completion writer through it. Give site registration/setup progression a precise meaning separate from licensed operation.
- A saved card or successfully retrieved checkout session cannot prove licensing or installation. Show payment pending, installation pending, failure and safe retry as distinct actionable outcomes.
- Reconcile subscription application, entitlement status, customer catalog and operation entry for incomplete/canceled/past-due states under the recorded commercial policy.
- Preserve explicit grandfathering and feature-rollout behavior. DEVELOPMENT Products remain excluded. Apply authorization at the mutation/read boundary, not only in navigation.
- Remove or delegate legacy card-setup step writes that contradict the wizard's recognized state.
- Change Console labels so a timestamp alone does not mean “operationally live.” Use precise registration, licensing/install and configuration facts without inventing persisted Department readiness.

**Review slices:** single transition owner plus callers; commercial eligibility/reconciliation; customer/Console status presentation.

**Required evidence:** empty-location finish cannot bypass the defined transition policy; canceled/unpaid checkout does not install or unlock new operation; saved payment method does not license; webhook retry and delayed installation recover without duplicate Departments; return path and manual Console sync agree; revocation, grandfathering and approved grace periods behave consistently across picker, Build and Run.

**Exit gate:** all entry points agree on site setup, commercial access and installation. No completion timestamp independently grants operation. Validate real database transactions and representative Stripe event sequences in a disposable/test environment.

**Release/data impact:** any migration of existing onboarding metadata is forward-only and preserves historical timestamps. Do not backfill readiness from those timestamps or retroactively charge legacy facilities.

## ONB-03 — Deliver minimal site entry and a guided setup workspace

**Purpose:** make the normal experience follow the accepted architecture with less repeated input.

**Primary owners:** [setup wizard](<../../src/components/setup-wizard.tsx>), setup page, proxy, Facility Builder, Department Builder/overview, account invitations and existing telemetry.

**Work:**

- Prefill known administrator/site/Organization facts and confirm timezone. Avoid a full HR form during site entry.
- Let the administrator enter setup without selecting a department. Offer product selection and licensing when they are ready to prepare a department; preserve license-before-install.
- Introduce a setup workspace that links to canonical Build tools and shows derived next steps. Replace the blanket incomplete-FA redirect with explicit authorized setup access; unlicensed department operation remains unavailable.
- Support selecting one or several available products and preparing each independently. Display only relevant product/context options.
- Delegate manual initial-location creation to canonical Facility Builder owners and surface the existing facility/asset CSV tools from setup. Preserve or explicitly retire the old location endpoint after callers are migrated.
- Replace manager-email notices with the existing real invitation/access-acceptance path, showing delivery/acceptance/failure and retry. Do not grant authority just because an email was entered.
- Add back/resume/error recovery and isolate any saved draft selection by facility/flow. Use the current classification/vocabulary model and Product-specific examples.
- Start recording setup steps, abandonment and time to first useful configuration using existing telemetry.

**Review slices:** minimum-entry/routing; setup workspace and builder links; invitations and resume/recovery.

**Required evidence:** a provisioned FA enters setup with zero departments; no duplicate site/Organization is created from prefilled values; existing customers retain legitimate access; two departments can be selected and resumed; selecting another facility does not inherit the first site's choices; a manager invitation yields a real accepted grant or a visible pending/failure state; tablet/desktop and role/context checks pass.

**Exit gate:** a customer can enter site setup, choose a licensed department later, use existing builders, and understand what to do next without a false “all ready” message. Product configuration is still published only through its owning services.

**Release/data impact:** changes to navigation and guidance can be introduced to selected pilot sites first. Existing successful onboarding records and operational history remain valid.

## ONB-04 — Enable canonical bulk workforce and relationship setup

**Purpose:** make large-roster onboarding and shared multi-department structure practical before adding a workbook wrapper.

**Primary owners:** [employee identity onboarding](<../../src/lib/employee-identity/onboard.ts>), employee organization/membership sync, bulk-import planners/executors, facility responsibilities, assets and audit/storage owners.

**Work:**

- Build on ONB-01's preview/confirm behavior and ONB-00's file contract. Introduce a bounded import batch/receipt only where existing storage/audit records cannot support confirmation, provenance and retry.
- Record target facility, actor kind/identity, template version, file hash, reviewed plan and per-phase results. Console staff IDs must not be written into User-only foreign keys.
- Extend canonical workforce onboarding for bulk create/reuse, account-match confirmation, effective access and department/team/Job Role membership. Preserve one User and one Employee per facility under the existing identity contract.
- Resolve the credential design before create is exposed: email-backed identity for the first release; explicit pending account/PIN enrollment where appropriate; authentication still obeys normal credential policy. No fake emails, plaintext workbook credentials or unlinked PIN-only employees.
- Add department-location and employee-department relationship planners with one relationship per row. A Department reference resolves an entitled installation; it is not free-form Product creation.
- Validate asset responsibility/defaults during preview rather than discovering missing dependencies only during execution.
- Define stable external references and exact lookup behavior. Reuse current canonical codes/identities where suitable; add schema fields only for a demonstrated missing reference need.
- Use phase/domain receipts so retries reuse completed work and show actual partial results. Keep CSV supported for each implemented dataset.

**Review slices:** shared plan/receipt and confirmation semantics; workforce identity/enrollment create; membership/responsibility imports and asset dependency validation.

**Required evidence:** new employee create, existing account reuse, ambiguous match, same person across facilities, multi-department membership, rehire/lifecycle controls, duplicate replay, expired/stale confirmation, cross-facility references and mixed Console/customer actors. Inject failure between phases and verify retry produces no duplicate identity, access grant, physical place or asset.

**Exit gate:** a realistic facility can bulk-create linked employees and memberships using CSV, share locations across two available departments, import assets and recover from partial execution. All advertised dataset planners are implemented and covered by database-backed tests.

**Release/data impact:** potential additive receipt/reference/enrollment migrations, finalized after owner discovery. Never edit applied migrations, reset a customer database or infer existing identity matches through a destructive backfill.

## ONB-05 — Make paid VSSYL implementation a complete service flow

**Purpose:** connect the service choice and fee to real, traceable delivery.

**Primary owners:** Console customers/support/work sessions, billing quote/checkout and the shared import plans from ONB-04.

**Work:**

- Expose self-service and VSSYL implementation clearly before purchase. Avoid advertising an undefined third paid tier; ordinary import help can remain support unless a separate offer is deliberately defined.
- Record an engagement tied to the site and agreed departments, with responsible staff, deliverables, source-file revisions and customer decisions. Reuse support conversations/attachments and domain audit instead of creating another messaging system.
- Track delivery stages such as scope agreed, data received, mapping/validation, customer review, configuration, launch review and accepted. Service status never grants entitlement or operational access.
- Accept existing source files as well as the standard CSVs; VSSYL staff own mapping/cleanup and unresolved questions. Both paths produce the same reviewed import plans.
- Use explicit staff work identity and existing allowlists. Preserve the customer's authority over licensing and publication; any assisted publication must use an explicitly authorized domain action with attribution.
- Implement the approved initial and existing-subscriber service-order flow. Make charges one-time, tied to scope and replay-safe. A persistent `ASSISTED` label must not silently rebill later work or additional department purchases.
- Provide review/signoff and training/handoff records; explain exactly which department/workflow is prepared and what remains deferred.

**Review slices:** engagement/intake and work-session integration; assistance quote/order; customer review/handoff.

**Required evidence:** self-service pays no implementation fee; agreed assisted scope maps to the correct one-time charge; order/webhook retries do not charge twice; a later engagement/additional department follows the recorded policy; uploaded support files alone cause no mutation; staff identity, customer approval and imported results remain attributable.

**Exit gate:** VSSYL can deliver a scoped onboarding service using CSV/existing files with visible owner, review, results and handoff. A checkout flag by itself is not considered completion.

**Release/data impact:** additive service-delivery metadata as needed; any new billing behavior follows an explicit update to the existing commercial policy. XLSX is not a prerequisite for this service pilot.

## ONB-06 — Add the combined XLSX onboarding workbook

**Purpose:** provide one convenient human-facing package over the proven domain import contracts.

**Primary owners:** the existing ExcelJS dependency, versioned template definitions and ONB-04's planners/receipts. Audit/Reports workbook rendering is a generation precedent, not the onboarding importer.

**Work:**

- Generate a site/Product-specific workbook: Start Here/Site, Departments, Locations, Department Locations, People, Department Memberships, Assets and Reference Values where supported. Omit irrelevant sheets; label optional sections.
- Keep Product selection/licensing outside file execution. A Departments sheet describes installed/requested local configuration and priority, not a license grant.
- Use stable text references for people/places/assets, preserving leading zeros. Separate example rows from real import data.
- Parse workbook sheets into the same typed plans used by CSV, with sheet/row/column errors and cross-sheet dependency validation. Do not create a second executor.
- Validate target scope and supported schema version; define required/missing/extra sheet behavior. Bound file size, row count and expanded workbook resource use. Define formula-cell handling explicitly and avoid executing imported formulas or macros.
- Show the complete dependency plan and transaction/phase boundaries before confirmation. Resume using receipts; do not promise workbook-wide rollback across independent domain transactions.
- Keep “Import one list instead” available with individual CSV templates generated from the same definitions.

**Review slices:** generated workbook/schema; reader and cross-sheet preview; confirmation/resume and UI integration.

**Required evidence:** equivalent CSV and XLSX inputs produce equivalent domain plans; a wrong-site/unsupported-version workbook fails clearly; missing cross-sheet references block affected execution; shared locations are not duplicated; identifiers survive round-trip; template examples are not imported; repeat/partial retry is safe; invalid workbook content cannot exhaust the supported processing limits.

**Exit gate:** a real onboarding package can be downloaded, completed, validated, reviewed, confirmed and resumed across the supported datasets. No aspirational sheet is presented as an implemented import.

**Release/data impact:** reuse existing receipt/domain persistence. Workbook source storage and retention use approved existing attachment/file policies, with no reliance on a single server's local filesystem.

## ONB-07 — Verify the whole journey and run a controlled pilot

**Purpose:** prove that the delivered flow reduces customer effort and produces usable, correctly scoped operation.

**Work:**

- Test operator-provisioned and enabled public-signup paths independently. Keep public signup's launch configuration separate from this program's UI work; verify mail/verification behavior before enabling it in production.
- Certify self-service CSV, self-service XLSX and paid assisted journeys. Include one-department and two-available-department scenarios without inventing a release for EVS.
- Verify the transition from site setup through confirmed installation and domain publication to actual Run behavior. Preparing department A must not require department B to be complete.
- Exercise invited managers, existing global accounts, shared-tablet/PIN enrollment, partner and Organization-only users, Console staff, access revocation and facility switching.
- Test delayed billing webhooks, canceled payment, install retry, stale preview, interrupted upload/commit, wrong-site references and import replay. Preserve historical operational records and current published configuration.
- Inspect desktop and tablet usability, missing-configuration/error states and support handoff. Run the repository's required static/build checks plus relevant hermetic, database and browser suites.
- Conduct a controlled real-site pilot with a named customer-side owner and VSSYL delivery/support owner. Record training, fallback, unresolved findings and actual effort.
- Collect time to site entry, first useful configuration, first published/used workflow, import corrections/retries, abandonment, customer time and VSSYL staff time. Set targets from measured baseline/pilot evidence rather than claiming an unmeasured “five-minute onboarding.”

**Exit gate:** no unresolved data-integrity, authority, payment/licensing, duplicate/retry or publication-history blocker; a customer demonstrates the chosen real workflow; pilot ownership/fallback is documented; the complete feature's release decision is recorded with evidence and remaining limitations.

**Release/data impact:** rollout to selected pilot sites first, then expand after the gate. Feature rollback may disable new intake/UI, but must not erase imported identities, relationships, paid orders or history. Recovery uses forward fixes and attributable domain correction.

## Cross-phase completion record

For each phase, record:

- Scope and actual changed owners/files, implementation commit/PR and schema effects.
- Accepted decisions and intentional compatibility behavior.
- Tests actually run, results, browser evidence where applicable and unresolved findings.
- Authorization/facility/department effects and representative denied paths.
- Migration, rollout and recovery procedures proportionate to the change.
- Customer-visible behavior demonstrated and the next eligible phase.

Mark a phase complete only when its exit gate has evidence. “Implemented” does not mean pilot-ready, and “pilot-ready” does not mean broadly production-ready.

## Scope held outside this program

New Department Product development/release, multiple instances of one Product at a facility, organization-wide invoicing, arbitrary Organization ownership reassignment, generalized ETL, a replacement readiness/Record model, and no-email global identity redesign require separate justified decisions. Repository rename can be coordinated as a small operational change; it should not delay the data-protection fixes.

## Recommended first execution scope

Begin with **ONB-00**, then **ONB-01**. The first concrete implementation outcome is a reliable current baseline and employee updates that preserve unprovided fields and require review before changing the roster. Do not begin with workbook formatting or a cosmetic wizard rewrite.

This document is the planning deliverable. No application implementation, repository rename, migration, live account action, payment or deployment occurred while preparing it.
