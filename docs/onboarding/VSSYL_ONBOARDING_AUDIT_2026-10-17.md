# Vssyl onboarding and setup audit

Audit date: October 17, 2026. Scope: the current Vssyl application, VSSYL Console, the uploaded LTC Manager architecture, and the identity of the mothballed predecessor.

## Decision brief

Keep initial onboarding small: establish the site, its owner and administrator, confirm timezone, then let the administrator choose how to proceed. Department selection can be deferred while entering the setup workspace. An operational department must still follow the existing commercial order: select an available Department Product, license it, install it, configure it, and deliberately publish the configuration required for the intended workflow.

Allow one or several Department Products in the same purchase. Configure them independently against one shared physical site model. Do not force the customer to finish every department before using the first one.

Offer one multi-sheet **XLSX onboarding workbook** for coordinated setup, plus separate CSV templates for individual imports. CSV does not support worksheet tabs. Self-service and paid implementation should use the same import contracts and domain services. Paid VSSYL onboarding should add data preparation, configuration, review, training, and launch ownership—not merely someone uploading the same file.

The largest current gaps are:

1. Employee CSV cannot create employees. New hires must be added individually, despite the large-roster onboarding principle.
2. Employee CSV applies defaults/nulls to omitted columns and updates existing rows immediately, without a preview. A minimal file can reset existing workforce data.
3. Setup completion is written through inconsistent paths and is treated as “live” in Console, although it does not establish operational readiness.
4. The wizard always chooses `SELF_SERVE`. Paid implementation pricing exists elsewhere, but there is no dedicated implementation engagement, data handoff, customer signoff, or launch workflow.
5. The wizard has its own older location-creation path instead of using the richer Facility Builder/import path. Administrators are redirected away from those Build tools until the wizard is complete.

These findings come from source inspection and focused existing tests. They do not establish the configuration or behavior of a deployed production instance.

## 1. Repository identity and audit boundary

The user confirmed that **LTC Manager is the current Vssyl**, and the repository named Vssyl is the mothballed predecessor.

- **Current product:** [ADTrauts/LTC-Manager](https://github.com/ADTrauts/LTC-Manager), local checkout `/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager`.
- **Current VSSYL Console:** the same repository, under `src/app/console` with `src/lib/harbor-console`. “Harbor” is an internal Console name. It is not a second discovered repository.
- **Predecessor:** [ADTrauts/Vssyl](https://github.com/ADTrauts/Vssyl), local checkout `/Users/andrewtrautman/Desktop/Vssyl`. Its business/module/HR onboarding is not current Vssyl facility onboarding.

Current-product local HEAD and GitHub main both resolved to `c7b5e68b372600b77c69108a8e4a351c6e6753f8`, committed October 16, 2026. The checkout was clean before and after the audit. Predecessor HEAD and GitHub main both resolved to `6fc93501c680a58dcfab339d66451d09ac18356d`; that checkout has unrelated existing changes. Neither repository was edited.

The current repository's [constitution][C01] explicitly says the product now presented as Vssyl evolved under the LTC Manager name. Its [Department Product contract][C02] is particularly important: a Product, an installed Department, a commercial entitlement, local configuration, and readiness are different concepts.

**Recommended separation:** rename the old GitHub repository to `vssyl-legacy-platform`; rename the active repository to `vssyl-operations` or, after freeing the name, `Vssyl`. Label saved desktop projects **Vssyl — Current Operations** and **Vssyl — Legacy Platform**. The saved project currently labeled Vssyl points at the old checkout, so sidebar naming is part of the problem. Give both repositories a short identity banner in README/AGENTS with the canonical remote and the predecessor/successor relationship. Keep Console in the current monolith unless deployment or ownership needs justify extraction. Update remotes, CI references, deployment integrations, and documentation together if repository names change. No rename or archival was performed in this audit.

## 2. Current customer and administrator flows

### 2.1 Customer/site creation

There are two real entry paths sharing `bootstrapFacilityCustomer`:

**Public signup, if enabled:** `/signup` → `POST /api/auth/signup` → shared bootstrap → verification email when email is configured → enter the explicitly created facility context → `/setup`. Signup requires site name, administrator name/email, and a password of at least ten characters; management-company name is optional. [Signup implementation][C03]

`PUBLIC_SIGNUP_ENABLED` defaults to **off in production**, on outside production; the environment can override it. This audit did not read deployed environment values. When mail is not configured, signup marks the email verified and can establish a session immediately. That makes mail configuration a launch prerequisite to verify, rather than assuming verification always happens. [Signup policy][C04]

**Console provisioning:** Console OWNER → Customers → New customer → preview/confirm administrator and owning Organization → transaction calling `provisionFacilityForHarbor`/bootstrap → customer detail. A new administrator receives an existing account-invite flow; an existing User is reused and granted facility administrator access. A failed invite after commit does not roll back the facility. MEMBER staff cannot provision. [Provision action][C05], [provision domain service][C06]

Bootstrap creates:

- A new or existing parent Organization.
- The Facility, billing email, timezone, and onboarding step `facility`.
- A new or reused global User.
- Explicit `UserFacilityAccess` with an effective facility-administrator role period.
- A facility Employee linked to that User, classified as an active full-time facility administrator.

It does **not** create a Stripe subscription, `FacilityBilling`, Department Products, entitlements, all three historical departments, or Organization membership. Facility administrator and Organization administrator remain distinct. New Organizations may remain unclaimed. Exact replay with the same existing User, Organization, site name, incomplete setup and current FA grant can reuse the existing site; same-name sibling creation requires explicit confirmation. Ownership reassignment is not currently supported by this flow. [Bootstrap][C07], [Console provisioning specification][C08]

This is also the practical multi-site creation path: another site can be provisioned under an existing Organization. The Organization facilities screen administers access and setup visibility; it is not evidence of an equivalent self-service site-creation wizard. Current billing remains facility-based; organization-level invoicing is documented as future scope. [Commercial policy][C09]

### 2.2 Guided setup wizard

The server lists `facility → managers → departments → billing → locations → complete`. The UI exposes five steps. It resumes from one Facility string field. [Step definition][C10], [wizard][C11]

**Facility:** repeats site name and billing email already captured or provisioned. It does not confirm timezone, vocabulary, site type, or ownership. Public bootstrap defaults timezone to `America/New_York`; Console provisioning explicitly asks for it. Confirm timezone early because service dates and publication depend on it. [Timezone defaults][C12]

**Additional managers:** optional, up to twenty emails. The endpoint records unique `OnboardingManagerInvite` rows and emails a `/login` link. It does not create a User, Employee, account invitation token, or facility access grant. The only current production references found to this model were the state GET and manager endpoint. This is notification collection, not completed manager provisioning. The client also does not check the POST status before advancing and ignores the returned sent/skipped/failed counts. [Manager endpoint][C13], [email helper][C14], [wizard lines 164–180][C15]

**Departments:** multiple checkboxes from the available catalog. At least one selection is required by the UI when Stripe is configured. Selection is kept in browser session storage under one unscoped key, not persisted as an installed Department. The key is not facility-specific. Ephemeral pre-payment selection is permitted by the product contract; cross-device resumption and cross-facility isolation are nevertheless weak. [Wizard selection][C16], [Department Product contract][C02]

**Billing:** checkout uses all selected keys, monthly or annual interval, and a hidden `setupPath=SELF_SERVE`. With Stripe absent, the UI allows continuation without licensing and explicitly says departments will not install. The state API tests only the secret and publishable keys for “ready”; actual checkout also needs the applicable Stripe prices. Thus a keys-present/prices-missing environment can enter a checkout dead end. [Wizard checkout][C17], [billing action][C18]

**Initial locations:** optional, maximum twenty. The UI accepts name, raw `UnitType`, and an optional parent from the unsaved list. It does not offer Facility Structure CSV, XLSX, a floor/neighborhood/room hierarchy preview, or the canonical builder's batch tools. It creates `Unit` rows directly, then backfills responsibility for already-installed legacy-key departments. It does not create missing departments. [Location endpoint][C19]

The location endpoint sets onboarding complete, even with an empty array. The UI then follows `/dashboard?onboarding=complete`; the legacy dashboard correctly redirects to the role's current home and preserves the checklist parameter. The resulting launch checklist is static and includes more setup tasks, rather than verifying that the operation can run. [Dashboard handoff][C20], [launch checklist][C21]

The wizard has no visible backward navigation. Location drafts live only in React state. The initial state fetch has no useful recovery for a failed/nonconforming response. These increase recovery burden after refresh, interruption, or a failed request. [Wizard][C11]

### 2.3 Department creation, purchase and multiple departments

The normal customer path is **Admin → Departments → Marketplace** → license → install. Department Builder configures a selected installed department; it is not the purchasing home. The route may still contain `/admin/departments/...` internally, but product mode and ownership—not URL spelling—determine Build versus Admin. [Admin entry][C22], [Build entry][C23]

The registry currently exposes:

- Healthcare Food & Nutrition: AVAILABLE, canonical key `HEALTHCARE_FOOD_NUTRITION`, persisted installation key `DIETARY`.
- Facility Plant Operations: AVAILABLE, key `PLANT`, version 1.0, released October 7, 2026.
- Environmental Services: DEVELOPMENT, excluded from customer selection and purchase.

Both available products are described for Hospital and Long-Term Care. Grouping products by industry is already supported, but this does not mean general hospitality/education Department Products are shipped. [Registry][C24]

**Two different departments:** supported by arrays in selection, checkout metadata, entitlement reconciliation and installation. There is no reason to force separate facility registration for each. **Two instances of the same Product at one facility:** intentionally not supported. Install reuses the existing product lineage and does not create `DIETARY_2`; the schema has a unique facility/key pair. Use locations, teams and coverage within one product instance unless there is a separately approved need to change that model. [Install service][C25], [Department schema][C26]

`createFacilityDepartment` and an old `createDepartmentAction`/form also remain. The current Marketplace does not use them. The service is explicitly described as an internal/open-admission primitive; it must not become the CSV shortcut for creating arbitrary customer departments or bypassing licensing. [Internal create primitive][C27]

Installation initializes the local Department and its initial operating Organization. It does not fill operating times, workforce, Work, Records or locations, and it does not publish starter configuration. Product-owned starters are available for explicit review. Dietary's operating-rhythm starter creates editable Breakfast/Lunch/Dinner drafts; Plant has its own Work starters rather than requiring a Dietary meal rhythm. [Reconciliation][C28], [cycle starter][C29]

**Documentation conflict:** root AGENTS still describes Plant as DEVELOPMENT, while registry and current Product contract say AVAILABLE. Commercial policy also says Plant is AVAILABLE but has no dedicated SKU. Checkout nevertheless accepts AVAILABLE products through generic department-count prices. Resolve the release/package wording before changing catalog behavior; the audit did not alter Plant status or pricing. [Current contract][C02], [commercial policy][C09], [repository instructions][C30]

## 3. Import and download implementation map

### 3.1 Facility structure: the third setup CSV

The “other” setup CSV is **Facility Structure / locations**. It is available inside Facility Builder at `/admin/facility/builder`, not the initial wizard.

Template columns are `building, floor, neighborhood, locationName, locationType, roomNumber, code, description, department, customTypeLabel`. Building is optional. Floor is required; a leaf location needs neighborhood and location type. Floor-only and neighborhood-only intentions are supported. Human labels and legacy aliases are parsed; internal UUID entry is unnecessary. The example file is LTC-flavored, including resident rooms, a servery and Dietary. [Template/parser][C31]

The flow is already close to the guidebook: download → choose file → parse/validate → hierarchy/row preview and issues → explicit confirm → summary. Upload/preview does not mutate configuration. Confirmation reparses and reloads current facility data on the server; it does not trust a client plan. Execution uses one transaction, parent-before-child creation, and live reuse checks. It is create/reuse oriented, not a general replace/delete mechanism. [Shared import wizard][C32], [confirm action][C33], [executor][C34]

Optional `department` resolves **one existing active department per location row** and creates a responsibility for a newly created location. It does not create departments or represent a full many-to-many department-location configuration. Repeating a physical location row for another department is not a reliable replacement for an explicit responsibility import. [Department resolution][C35]

Limits: 2,000 rows, 2,000,000 bytes; confirmation requires MANAGER or above and rejects Quick PIN. Bulk room entry/range expansion also exists in Facility Builder, up to 100 rooms per batch. These are useful existing setup accelerators. [Limits][C36], [authority][C37], [batch helpers][C38]

### 3.2 Assets

Asset Builder `/assets/builder` contains the other shared bulk-import panel. Columns are `name, equipmentType, floor, neighborhood, space, assetCode, manufacturer, model, serialNumber, facilityAssetNumber, status, department, criticality, notes, description`. Asset terminology still uses `space`, while Facility Structure now exports `locationName`; that difference should be normalized in the recommended workbook. [Asset template/parser][C39]

Locations must already resolve in the facility hierarchy. Department can be supplied or defaulted from responsibility at execution. If no default exists, execution throws—even when preview allowed confirmation. Move that dependency check into preview. Duplicate handling considers asset code, facility asset number and serial number; create-only behavior skips existing/duplicate assets rather than overwriting or retiring them. [Asset confirmation][C40], [executor][C41]

Confirmation requires SUPERVISOR or above, rejects Quick PIN, and executes inside one transaction. When the current asset-operations feature is enabled, the executor calls canonical `createAsset`; otherwise a compatibility branch writes the Asset directly. Preserve this distinction in migration work rather than calling all imports fully consolidated. Limits are the same 2 MB/2,000 rows as facility structure. [Executor][C41], [authority][C37]

### 3.3 Employees

`/employees/import` offers a downloadable 23-column CSV with `firstName,lastName,email,phone,roleType,employmentType,status,unionMember,onLeave,hireDate,jobClassification,chrcStatus,chrcClearedAt,chrcNotes,birthMonth,birthDay,shirtSize,hrNotes,workStations,primaryUnit,terminationDate,chrcOffboardingCompletedAt,chrcOffboardingNotes`.

The page correctly says existing-employee updates only, but the inner upload form still says “Upsert,” mentions new rows, and displays a Created count. The server's `created` variable remains zero: unmatched rows are explicitly rejected with “CSV cannot create new employees.” [Page][C42], [form][C43], [action][C44], [template/parser][C45]

Current behavior:

- MANAGER or above; Quick PIN rejected.
- Maximum 500 rows, approximately 2 MB by text length.
- Match by email when provided, otherwise/fallback by first and last name; ambiguous matches error.
- Resolve `primaryUnit` against active unit names.
- Parse each row, immediately update in a per-employee transaction, continue past row errors, then show results.
- No validate-only preview, separate confirmation, or batch-level rollback.
- No department, additional department membership, department Job Role, or team-membership columns.
- No account/PIN provisioning through the file.

**Material update risk:** absent email/phone become null, absent role/employment/status default to STAFF/FULL_TIME/ACTIVE, booleans become false, and absent HR fields become null. Most are unconditionally written. Workstation membership is replaced, including with an empty array. `primaryUnit` is one of the exceptions that checks whether its column exists. A file containing only names can therefore reset existing profile fields and workforce classification. A read-only parser probe confirmed these defaults. This is a source-level risk; no customer roster was changed. [Parser defaults][C46], [update assignment][C47]

Do not simply re-enable CSV creates by inserting Employee rows. The current individual create flow requires a primary department and calls `onboardFacilityEmployee`, which creates/reuses the global User, links the facility Employee, creates the access grant and effective role, checks existing-account confirmation, and requires a PIN digest for PIN-eligible roles. It then applies department/team/job-role memberships through existing organization sync. The CSV limitation deliberately prevents unlinked PIN-only employees. [Single-employee create][C48], [identity service][C49]

A proper bulk onboarding flow must preserve that identity contract and account for email, existing-account confirmation, role authority and PIN enrollment. This is a product/domain change as well as an import UI change.

### 3.4 CSV/XLSX scope

Current setup imports are CSV-only. The shared file picker accepts `.csv`; parsers consume text. There is no current Department setup CSV, combined onboarding workbook reader, cross-sheet validator, or workbook-to-setup coordinator in the inspected production paths.

`exceljs` is already a dependency, and Audit / Reports exports a multi-worksheet XLSX through `render-compliance-workbook.ts`. That proves workbook generation exists; it does not prove onboarding XLSX import exists. [Package][C50], [report workbook][C51]

CSV is one flat table. Excel saves the active worksheet to CSV, so “one CSV with tabs” is not an available format. A multi-tab package should be `.xlsx`; individual CSVs remain valid for focused imports. [Microsoft file-format guidance](https://support.microsoft.com/en-us/excel/excel-formatting-and-features-that-are-not-transferred-to-other-file-formats)

## 4. Console, paid onboarding and admin-assisted setup

There are three different meanings that the interface should name clearly:

1. **Operator-provisioned access:** Console OWNER creates the shell and initial administrator. This is the documented production entry path and does not itself mean the customer purchased implementation.
2. **Paid assisted implementation:** billing supports `ASSISTED`, one-time setup line items and a stored setup-path label.
3. **Console work session:** an authenticated platform staff member opens a particular customer facility and uses allowed Build tools while retaining platform staff identity.

Working code prices are $299/month for the first department, $149/month additional, $999/month ceiling, with 10% annual discount. Optional assisted setup is $1,500 first department plus $500 additional. These are repository working figures, not verified live Stripe prices or a pricing recommendation. [Billing catalog][C52], [commercial policy][C09]

The billing-plan form offers assisted implementation, but initial setup posts `SELF_SERVE` unconditionally. Incomplete FA setup redirects ordinary navigation to `/setup`, so the separate Admin billing choice is not a coherent initial assisted-purchase route. Adding departments to an existing subscription also quotes the additional purchase as self-service; later assisted service orders need explicit handling. [Wizard checkout][C17], [billing plan form][C53], [add-departments service][C54]

Console work sessions retain `uid=PlatformStaff`, `authKind=harbor_staff`, facility scope and an FA-shaped application role; they do not turn staff into the customer's User. Work-session start/end are audited. They permit Facility Builder, Departments, Department Builder, Employees, Assets and Logs builder paths. They explicitly deny `/setup`, `/api/onboarding`, billing, device binding, facility switching and account paths. This is useful infrastructure for assisted Build work; it is not a complete implementation service workflow. [Session composition][C55], [path allowlist][C56], [start audit][C57]

Support tickets and inbound attachments exist and may help collect a customer's existing files. They do not provide an onboarding workbook schema, import preview/confirmation, or customer approval. Attachments remain support artifacts, not authority to mutate configuration. [Support attachments][C58]

No dedicated production path was found that automatically sends onboarding CSVs/XLSX, receives completed onboarding files, assigns an implementation owner, records agreed departments/service scope, tracks data-mapping revisions, or obtains go-live signoff. The presence of a billing `setupPath` and a support ticket should not be presented as those capabilities already existing.

## 5. Setup state, activation and authorization gates

### 5.1 What is enforced now

- **Identity and workspace entry:** signup/invite completion enters the exact created/accepted context through `enterGrantedContext`/`enterContext`. Organization membership alone is not facility access. [Context entry][C59]
- **Route authority:** a server route registry plus page/action guards controls Facility, Organization, partner and Console access. `/setup` and onboarding APIs are FA-level routes. Department selection is a context lens, not an authorization grant. [Route registry][C60]
- **Wizard gate:** `src/proxy.ts` redirects incomplete facility administrators to `/setup`, except setup/onboarding/billing API paths; Harbor work is exempt. It is not a universal “all users cannot run until ready” gate. Non-FA access still depends on its normal route/domain authority. [Proxy][C61]
- **Completion flag:** `Facility.onboardingCompletedAt`; step string and started timestamp are separate. Console marks `isLive` from this timestamp and “stuck setup” from its absence. [Schema][C62], [Console query][C63]
- **Commercial/product access:** catalog eligibility combines released Product, entitlement, installation and `Department.isActive`. DEVELOPMENT stays hidden. Enforcement defaults off; grandfathering applies to installed available/retired products, not automatic creation of missing products. [Eligibility][C64], [feature flag][C65]
- **Operational configuration:** existing Location Function publication, cycle validation/publication, Work/Records applicability and runtime consumers determine actual configuration. Department overview already derives location/rhythm/people/work/Records guidance. There is no single wizard completion check covering these facts. [Derived guidance][C66], [cycle publish validation][C67]

### 5.2 Gaps in completion and activation

**Completion endpoints disagree.** State PATCH checks billing only when Stripe keys are configured, and accepts ACTIVE/PAST_DUE billing **or merely a stored default payment method**. It does not establish that a selected department was entitled and installed. By contrast, locations POST marks complete for `locations: []` without that billing check. An authorized FA can therefore mark wizard completion through that path without the stronger PATCH condition. This was established by source inspection, not a live request. [State endpoint][C68], [locations endpoint][C19]

**Checkout return advances too loosely.** `applyCheckoutSessionId` checks facility identity, invokes synchronization and returns true, even if the session is not paid/complete; `applyCompletedCheckoutSession` then mirrors INCOMPLETE. `/setup` advances to `locations` based on the boolean. The location endpoint can subsequently mark complete. Server-side progression should use confirmed entitlement/install outcomes rather than successful retrieval alone. [Stripe sync][C69], [setup return][C70]

**Legacy card setup writes a misleading step.** `setup_intent.succeeded` changes step to `complete` but does not set completion time. The UI's `toStep` only recognizes its five visible steps and falls back to facility for `complete`. This can produce a contradictory resumption state. Saving a payment method must not imply department licensing or launch. [Webhook handler][C71], [wizard][C11]

**“Live” does not mean usable.** No locations, roster, published cycles, Work or Records are required to set the completion timestamp. Conversely, the blanket FA redirect prevents a customer using the mature Facility Builder import tools during initial wizard setup. [Proxy][C61], [Console live label][C63]

**Billing status consistency needs correction.** `resolveCommercialEntitlement` accepts an ACTIVE entitlement before considering billing status and does not otherwise use its `billingStatus` input. Subscription application upserts selected entitlements ACTIVE even when passed INCOMPLETE/CANCELED. A separate `isDepartmentLicensed` helper rejects those statuses, but no production caller was found for that helper. Reconciliation passes subscription status plus metadata keys into the former path. This is a concrete static inconsistency in activation enforcement; verify cancellation/incomplete transitions end to end before claiming paid access is enforced. [Eligibility][C64], [subscription application][C72], [reconciliation][C73], [unused legacy helper][C74]

**Import confirmation is not publication.** Facility structure imports immediately create active hierarchy objects; they do not implement the whole guidebook's draft/publication-set lifecycle. Preview-before-confirm is present, but future configuration activation must continue through the owning domain's publication rules. Do not represent an imported asset/room as automatically activating published department operations. [Structure executor][C34]

## 6. Comparison with uploaded architecture

The eight chapter PDFs and compiled guidebook are reference requirements, not proof of implementation. The two compiled-edition filenames contain identical extracted text and were treated as one reference, not independent evidence.

**Build/Admin boundaries:** Chapter 4 says Admin governs the organization/site/access and Build configures the physical and departmental operating model. Current Console provisioning and purchase-versus-configuration separation broadly align. The wizard mixes site governance, purchase, manager notification and physical creation, bypassing the mature builder experience. Recommendation: retain a small site-entry journey, then guide users to the canonical Build homes. Internal legacy route prefixes do not justify moving domain ownership.

**Bulk onboarding:** Chapter 4 explicitly names employees, facility structure and assets and requires template → upload → validate → preview → confirm → summary. Structure and assets mostly comply. Employee CSV is a significant exception: update-only, immediate per-row mutation, no preview and no department-membership import.

**Multi-department support:** Chapters 1, 3, 4 and 6 call for one product with shared places and distinct department operations, and a department selector only when multiple contexts exist. The installed-Product model, shared hierarchy and employee multi-membership schema support this direction. The wizard and billing already accept multiple products. The import contracts do not yet express all relationships cleanly.

**Drafts and prospective activation:** Chapter 4 says starters/configuration should be reviewed and deliberately published, with future activation and history. Current Product contract explicitly says nothing is auto-published; cycle/location-function publishers should remain canonical. Wizard completion and `isActive` cannot substitute for those publishers.

**Server authority:** Chapter 7 requires server authority over scope, validation and state changes. Current facility scoping, password-only import authority, owner-only shell provisioning and explicit Harbor identity are foundations worth preserving. Completion duplication and billing-eligibility inconsistencies weaken the aggregate launch story.

**Setup burden:** Chapters 2 and 8 call for progressive complexity, defaults/presets, hierarchy validation, preview, and tracking burden as a product metric. Requiring every HR field, a complete facility hierarchy or all department configurations before entering the product would conflict with that principle. Current file examples, raw unit enums, repeated form entry and individual employee creation still impose avoidable LTC-specific burden.

**Evolution of the reference architecture:** the uploaded Chapter 7 describes facility tenancy with future organization growth. Current code already has Organization ownership, explicit multi-facility access, partner relationships and workspace entry. Preserve those implemented boundaries; do not redesign back to an earlier snapshot or import the mothballed platform's Business schema. Current canonical Record flow is also later than some guidebook template language: `CatalogLogDefinition → FacilityCatalogInstall → LogAttachment → requirement → OperationalEvidenceRecord` when canonical Logs are on. New onboarding must consume that flow, not introduce another OperationalTemplate system. [Current constitution][C01]

Source PDFs and exact chapter/page locators are listed at the end of this report.

## 7. Recommended seamless onboarding architecture

Everything below is a recommendation, not a shipped capability.

### 7.1 Separate site entry, commercial access, configuration and launch

Use the existing Facility onboarding fields for journey/progress metadata, with one server transition owner. Do not add persistent `Department.setupComplete`/`CONFIGURED` flags: the current Product contract explicitly prohibits them. Derive setup guidance from canonical facts and existing validators. A separate implementation-service engagement may have its own delivery status; that status must not authorize Run.

Suggested journey:

1. **Establish your site:** administrator identity, site name, owning Organization/reuse, timezone confirmation. Carry forward values already captured. Ask industry/site vocabulary only to choose labels and recommendations from current classification, not to invent new sellable Products.
2. **Choose how to set up:** “I'll set it up,” “Help me import my existing lists,” or “VSSYL implementation.” Explain service scope and price before purchase. This is assistance preference, separate from department readiness.
3. **Choose Department Products now or later:** show only available products. Multi-select supported. Defer if the customer only wants to enter site setup. Selection alone creates no operational Department.
4. **License and install selected products:** keep existing Stripe → entitlement → idempotent install. Resume safely after delayed webhooks or installation failure, with actionable status and retry.
5. **Setup workspace:** choose a department to prepare first; use one shared site hierarchy, contextual import/workbook options and existing starters. Other selected departments can stay partially configured.
6. **Review launch scope:** show exactly which department, locations and workflows are prepared, missing or intentionally deferred. Publish through canonical owners at the chosen effective time. Enter the role's real Run home with contextual next steps.

The setup workspace can be a guided composition of existing Build destinations. It does not need a new engine or replacement set of builders.

### 7.2 Minimum required versus optional

**Required to establish and enter a site:** an authenticated/appropriately verified administrator with a real facility access grant; site name and owning Organization; confirmed timezone. Require billing email when beginning checkout. Console can prefill these. An administrator need not fill a complete employee roster or department structure simply to enter setup.

**Required to activate the first operational department:** available Product; commercial authorization or explicit supported grandfathering/pilot policy; successful installation; active Department; the minimum published configuration for the workflows being launched. A location-based workflow needs its applicable location; assignment requires the relevant employee access/membership; a scheduled Record needs its actual placement and schedule. Show the dependencies in context.

**Optional during site entry:** extra managers, employee import, assets, complete hierarchy, complete roster, additional departments, HR background fields, Work plans or Records irrelevant to the selected initial use case. Configure these progressively.

**Department selection answer:** optional to establish the site and begin setup; required before that department's commercial installation and operational use. This changes the current wizard's normal Stripe-configured UI policy, so document it explicitly rather than treating the existing completion bypass as the feature.

**Two-department answer:** allow both in one purchase; prepare A and B independently; use one locations/people source of truth with explicit department relationship rows; start A without demanding B's configuration. Do not install duplicate Product instances to represent wings or teams.

### 7.3 One import system, several file adapters

Extend the existing parse/plan/execute approach. Keep two layers distinct:

- **File adapters:** CSV for a single dataset; XLSX for several related datasets. Parse cells into typed rows with workbook/sheet/row/column provenance.
- **Domain planners/executors:** facility structure, department relationships, workforce identity/membership, assets, plus existing configuration starters and publication services. Both adapters call the same owners.

For bounded V1 files, synchronous planning and transaction execution can remain appropriate. Persist an import batch/receipt, source hash, version, scope, actor and confirmation details to support handoff/retry; do not build a generalized ETL platform. Revalidate permissions and current dependencies at confirmation. If the plan materially changed since preview, require a renewed review.

Default to create/reuse for new onboarding. Provide a separately labeled **Update existing records** mode with a true diff and explicit field semantics: absent column preserves data; blank cell behavior is documented; clear is deliberate. Never silently reactivate/terminate employees or change privileges from parser defaults. Identity, access and employment lifecycle changes must use their canonical services.

Keep validation pure. Confirm within the appropriate transaction boundary. For a multi-sheet package, show that boundaries may be per domain/phase; do not promise all-or-nothing workbook execution when current executors own separate transactions. Store exact phase results and stable keys so retries do not duplicate earlier successful phases. Do not auto-publish operations from a file upload.

### 7.4 Recommended workbook and dependency order

Default download: **Vssyl Onboarding.xlsx**, tailored to the selected Products and chosen scope, with unnecessary sheets omitted or clearly optional.

- **Start Here:** schema version, target site, instructions, required columns, examples, allowed values and supported limits. Example rows must be clearly excluded from real import or separated into examples; do not accidentally create Jane Doe or sample rooms.
- **Site:** prefilled display values and timezone confirmation. Owning Organization is not casually changed by a spreadsheet. The upload target comes from authenticated context, not an editable cell.
- **Departments:** selected Product key, local department name and intended setup priority. This expresses requested configuration, not a license purchase or free-form product creation. Existing entitled installations resolve here.
- **Locations:** shared building/floor/neighborhood/location hierarchy, location type and stable source key/code. Codes and room identifiers remain text to preserve leading zeros.
- **Department Locations:** one explicit relationship per row: department key, location reference, responsibility/function where supported. Supports shared places across departments without duplicating the physical place.
- **People:** minimal new-person/employee facts with stable row reference, name and email under current identity policy. Do not lead with CHRC, shirt size or offboarding fields.
- **Department Memberships:** employee reference, primary/additional department, local Job Role/team when supported. One global person and one employee per site, with multiple department memberships.
- **Assets:** asset identity/type/location reference, optional metadata and explicit responsible department.
- **Reference Values:** read-only human labels, product identities, location types and valid values generated from canonical registries.

Within a minimal release, support Locations, People and Assets first, then add the relationship sheets once their planners exist. Do not ship blank aspirational sheets pretending those imports already work.

Dependency sequence: validate Product selection/licensing separately → shared location hierarchy → department-location relationships → linked workforce identities and memberships → assets → review starters/Work/Records configuration → explicit publication. Validate the entire file before the first domain commit where possible. Existing-source files that do not match the workbook can be mapped in paid implementation; retain their source-to-target mapping as reviewable evidence.

Offer **“Import one list instead”** to download/upload the individual CSV. A ZIP of CSVs may be a later integration option, but it is less useful than XLSX for the default human setup experience. Workbook and individual templates should be generated from the same versioned definitions.

### 7.5 Workforce identity and PIN enrollment

Reuse `onboardFacilityEmployee` and existing membership sync instead of recreating identity logic. Preview all existing-account matches and obtain explicit confirmation before linking them to the site. Keep application role, employment classification, local Job Role and department head assignments distinct.

The current service requires email for new accounts and a PIN digest for PIN-eligible roles. A recommendation to omit these from a roster file therefore needs a deliberate domain extension: stage invitation/enrollment separately or require a supported credential setup step before activating those employees. Do not put plaintext shared PINs/passwords into the workbook. Do not create fake emails or silently restore the old unlinked PIN-only employee path.

Whether employees without individual email must be supported is a product decision still needed. It is especially relevant for shared-tablet adoption, but cannot be solved by dropping identity checks from CSV. The import should clearly distinguish imported, account pending, PIN enrollment pending and operationally assignable using canonical facts.

### 7.6 Self-service versus paid VSSYL implementation

**Self-service:** customer uses templates, upload/validation/preview, fixes issues, confirms domain writes, applies starters and publishes. Contextual help and ordinary support remain available. No implementation fee by default.

**Paid implementation:** record an engagement tied to the site and explicitly scoped departments. VSSYL owns intake, mapping/cleanup of existing rosters and asset/location lists, exception resolution, assisted Build configuration, review sessions, training and launch preparation. The customer supplies their existing source lists or completes the same workbook when helpful; they should not have to re-enter information VSSYL already received.

Recommended delivery stages: requested → scope agreed → data received → mapping/validation → customer review → implementation in progress → launch review → accepted. These are service milestones, not Department readiness or entitlement states. Include assigned staff, agreed deliverables, data revisions and customer approval records. Reuse support tickets/attachments where suitable rather than building another messaging system.

A normal shared file contract makes both paths consistent. The paid difference is ownership and work performed. Sending a CSV and asking the customer to return it is only intake; it does not itself justify a distinct implementation product. No automatic template-send/return pipeline currently exists to claim otherwise.

Continue using explicit Console work identity and allowlists. Customer licensing/payment remains customer-controlled or separately governed; work sessions should not silently impersonate customers to pay, bind devices or bypass publication. Show the customer the staged changes and obtain an explicit publication/launch decision.

## 8. Implementation sequence and acceptance criteria

### Priority 0: fix trust in onboarding outcomes

1. Correct employee CSV update semantics and introduce validate/preview/confirm before mutation. Acceptance: a names-only update preserves every unprovided field; a clear/change diff is visible; row failure never hides earlier commits; no default silently changes role, status or workstation membership.
2. Consolidate onboarding transitions/completion into one server owner used by state PATCH, location finish, checkout return and legacy card hooks. Acceptance: incomplete/unpaid checkout or a saved card cannot assert a licensed/installed department; empty locations cannot bypass a stronger policy; retry is idempotent.
3. Reconcile commercial eligibility with cancellation/incomplete states and explicit grandfathering. Acceptance: webhook, return sync, Console sync, customer picker, Build and Run agree for ACTIVE, PAST_DUE, INCOMPLETE, CANCELED, missing/revoked entitlement and DEVELOPMENT Products.
4. Separate “site registered/setup entered” from derived operational preparation. Replace Console's timestamp-only “live” interpretation and broad launch claims with precise states. Unlock authorized setup/Build destinations without requiring a fake wizard finish.

### Priority 1: make high-volume and assisted setup real

5. Add workforce bulk creation through current identity/access/membership owners, with explicit existing-account review and an approved credential-enrollment design. Acceptance: replay does not duplicate Users/Employees/grants; multiple departments share one person; no unlinked employee or unintended role escalation is created.
6. Reuse the shared import experience from the setup workspace; retire/delegate the twenty-location direct-write path. Acceptance: manual and bulk physical setup create the same canonical hierarchy and responsibility relationships.
7. Expose assistance choice coherently before checkout; add implementation engagement/intake/review. Acceptance: service charge, agreed departments, staff assignment, file revisions and customer decisions can be traced; paid and self-service imports have identical validation.
8. Add XLSX adapter and generated workbook only after planners cover advertised sheets. Acceptance: workbook/CSV produce equivalent typed plans; missing/invalid cross-sheet references block confirmation with sheet/cell errors; relationships do not duplicate physical locations; resume/retry behavior is explicit.

### Priority 2: reduce remaining friction and confusion

9. Replace the manager-email notice step with the canonical account/facility invitation flow; surface failures, acceptance and retry.
10. Confirm timezone; prefill known site data; add back/resume/recovery; isolate any stored selection by facility/flow.
11. Use site vocabulary and Product-specific examples/presets. Keep raw enum names and unnecessary HR metadata out of the first-run experience. Keep DEVELOPMENT options hidden.
12. Complete repository/project naming separation and reconcile Plant release/commercial documentation.
13. Measure setup burden: time from site entry to first useful configuration, time to first published/used workflow, rows rejected/reworked, time in each setup step, abandonment, assisted staff time and customer effort. Use existing telemetry first; define these as metrics to collect, not measurements already available.

A representative acceptance scenario should provision one site, select two AVAILABLE products, complete licensing/install retries, import shared locations, onboard employees with multiple memberships, import assets referencing those locations, publish the first department prospectively, leave the second unfinished, and verify only intended Run behavior. Test password administrator, manager, Quick PIN, Organization-only, partner and Console identities; include wrong-site files, duplicate retries, existing-account matches and cancellation.

## 9. Verification performed and limits

Executed ten existing focused hermetic test files covering facility structure/assets, facility bootstrap/authority, Product eligibility/installation, onboarding context entry, Console work paths, employee identity and billing quotes. Result: **96 tests, 92 passed, four failed, zero skipped**. All four failures were in `department-products.hermetic.test.ts`: test doubles lack `db.department.findFirst`, now called by `ensureInitialDepartmentOperator`. This limits the existing installation test evidence; it does not by itself prove production installation fails. The other selected tests passed. [Saved verification log](/Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/output/onboarding-audit/verification.log)

Also executed a read-only parser probe using a names-only employee CSV; it returned null email/phone, STAFF role, FULL_TIME employment, ACTIVE status, false union membership and no workstations. No database mutation was performed.

No new product code, migrations, tests, seed scripts, account creation, live emails, checkout sessions, production data changes, repository rename, deployment or full browser certification was performed. DB-backed and browser suites exist but were not executed. Findings labeled static should be verified in a disposable environment before implementation is declared ready. Existing feature flag defaults and code behavior were inspected; deployed settings, live Stripe prices, actual paid service delivery outside the software, and customer usage were not established.

## Source register

Code references below point to the inspected clean current-product checkout and verified one-based line locations. Current GitHub baseline: [c7b5e68](https://github.com/ADTrauts/LTC-Manager/commit/c7b5e68b372600b77c69108a8e4a351c6e6753f8).

- [Product constitution][C01]; [Department Product contract][C02]; [commercial policy][C09].
- [Wizard][C11]; [state endpoint][C68]; [locations endpoint][C19]; [managers endpoint][C13]; [proxy gate][C61].
- [Bootstrap][C07]; [Console provisioning][C05]; [Console work paths][C56]; [Console customer projection][C63].
- [Facility structure][C31]; [asset import][C39]; [employee updates][C44]; [identity onboarding][C49].

Uploaded references:

- [Compiled guidebook](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/LTC_Manager_Certified_Guidebook_Compiled_Edition(1).pdf>): Build pp. 8–9; UX pp. 14–16; Platform pp. 17–18; setup burden pp. 19–20.
- [Chapter 1 — Vision](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/01_Vision(1).pdf>): pp. 1–2, proving ground and multi-industry direction.
- [Chapter 2 — Design Philosophy](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/02_Design_Philosophy(1).pdf>): p. 2, defaults, presets and progressive complexity.
- [Chapter 3 — Operational Language](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/03_Operational_Language(1).pdf>): pp. 1–2, site/department/location distinctions and user-facing language.
- [Chapter 4 — Build Architecture](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/04_Build_Architecture(1).pdf>): pp. 1–3, Admin/Build boundaries, bulk setup, draft/publication.
- [Chapter 5 — Runtime Architecture](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/05_Runtime_Architecture(1).pdf>): pp. 1–2, published baseline, assignments and actual operations.
- [Chapter 6 — UX and Interface Architecture](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/06_UX_Interface_Architecture(1).pdf>): pp. 1–3, role/context, department selector, intentional missing-configuration states.
- [Chapter 7 — Platform and Technical Architecture](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/07_Platform_Technical_Architecture(1).pdf>): pp. 1–2, server authority, facility tenancy, connectivity and audit.
- [Chapter 8 — Product Scope, Delivery and Governance](</Users/andrewtrautman/.codex/.chatgpt-projects/g-p-69c2a95d68d4819199c37a0c907c14ab/sources/08_Product_Scope_Delivery_Governance(1).pdf>): p. 2, measured setup burden and staged readiness.

Predecessor-only evidence: [business creation](/Users/andrewtrautman/Desktop/Vssyl/web/src/app/business/create/page.tsx:1), [business setup projection](/Users/andrewtrautman/Desktop/Vssyl/server/src/services/business/businessProfileService.ts:136), [HR CSV controller](/Users/andrewtrautman/Desktop/Vssyl/server/src/controllers/hrController.ts:1993), [HR import service](/Users/andrewtrautman/Desktop/Vssyl/server/src/services/employeeManagementService.ts:966). These use Business membership, org tiers/positions and generic HR journeys. That import can create departments/positions from roster values and uses naive line/comma splitting; none of that should be attributed to the current application or copied into its commercial Department Product model.

[C01]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/docs/product/01_PRODUCT_CONSTITUTION.md#L1>
[C02]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/docs/product/13_DEPARTMENT_PRODUCT.md#L1>
[C03]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/api/auth/signup/route.ts#L35>
[C04]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/signup-policy.ts#L10>
[C05]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/console/%28staff%29/customers/provision-actions.ts#L58>
[C06]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/facility-provisioning/harbor.ts#L60>
[C07]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/facility-provisioning/bootstrap.ts#L51>
[C08]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/docs/console/ASSISTED_FACILITY_PROVISIONING_2026-10-11.md#L1>
[C09]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/docs/product/11_COMMERCIAL_MODEL.md#L1>
[C10]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/onboarding.ts#L3>
[C11]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/components/setup-wizard.tsx#L88>
[C12]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/facility-provisioning/timezones.ts#L1>
[C13]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/api/onboarding/managers/route.ts#L14>
[C14]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/email/manager-invite.ts#L18>
[C15]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/components/setup-wizard.tsx#L164>
[C16]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/components/setup-wizard.tsx#L188>
[C17]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/components/setup-wizard.tsx#L429>
[C18]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/admin/billing/actions.ts#L39>
[C19]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/api/onboarding/locations/route.ts#L34>
[C20]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/dashboard/page.tsx#L29>
[C21]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/workspace/page.tsx#L54>
[C22]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/admin/departments/page.tsx#L35>
[C23]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/build/departments/page.tsx#L1>
[C24]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/department-products/registry.ts#L145>
[C25]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/department-products/install.ts#L126>
[C26]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/prisma/schema.prisma#L270>
[C27]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/departments/create-department.ts#L1>
[C28]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/department-products/reconcile.ts#L26>
[C29]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/department-products/cycle-starter.ts#L32>
[C30]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/AGENTS.md#L13>
[C31]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/bulk-import/facility-structure.ts#L36>
[C32]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/components/build/bulk-import-wizard.tsx#L61>
[C33]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/admin/facility/builder/import-actions.ts#L189>
[C34]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/bulk-import/facility-structure-execute.ts#L98>
[C35]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/bulk-import/facility-structure.ts#L444>
[C36]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/bulk-import/types.ts#L53>
[C37]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/bulk-import/authority.ts#L8>
[C38]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/facility-builder/builder-setup.ts#L12>
[C39]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/bulk-import/asset-import.ts#L24>
[C40]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/assets/import-actions.ts#L138>
[C41]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/bulk-import/asset-import-execute.ts#L160>
[C42]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/employees/import/page.tsx#L8>
[C43]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/employees/import/import-csv-form.tsx#L31>
[C44]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/employees/csv-import-actions.ts#L100>
[C45]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/employee-csv-import.ts#L12>
[C46]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/employee-csv-import.ts#L163>
[C47]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/employees/csv-import-actions.ts#L193>
[C48]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/employees/actions.ts#L338>
[C49]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/employee-identity/onboard.ts#L77>
[C50]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/package.json#L63>
[C51]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/compliance-report/render-compliance-workbook.ts#L1>
[C52]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/billing/catalog.ts#L1>
[C53]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/%28protected%29/admin/billing/billing-plan-form.tsx#L334>
[C54]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/billing/add-departments.ts#L96>
[C55]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/harbor-console/work-payload.ts#L5>
[C56]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/harbor-console/work-paths.ts#L1>
[C57]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/api/console/work-session/route.ts#L23>
[C58]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/support/attachments.ts#L1>
[C59]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/post-auth-routing/enter-granted.ts#L45>
[C60]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/route-registry/platform-routes.ts#L508>
[C61]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/proxy.ts#L216>
[C62]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/prisma/schema.prisma#L169>
[C63]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/harbor-console/queries.ts#L247>
[C64]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/department-products/eligibility.ts#L50>
[C65]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/feature-flags.ts#L218>
[C66]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/department-administration/overview-guidance.ts#L216>
[C67]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/operational-cycles/review-publish-validation.ts#L304>
[C68]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/api/onboarding/state/route.ts#L68>
[C69]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/billing/sync-from-stripe.ts#L17>
[C70]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/app/setup/page.tsx#L19>
[C71]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/billing/webhook-handlers.ts#L36>
[C72]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/billing/apply-stripe-event.ts#L12>
[C73]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/billing/reconcile-from-stripe.ts#L148>
[C74]: <https://github.com/ADTrauts/LTC-Manager/blob/c7b5e68b372600b77c69108a8e4a351c6e6753f8/src/lib/billing/entitlement.ts#L12>
