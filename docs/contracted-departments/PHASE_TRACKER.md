# Contracted Department Authority — phase tracker

Updated October 25, 2026 (CDA-08 accepted). This is the single status and authorization record for the [Contracted Department Authority program](./README.md). Scope is in the [phased plan](./PHASED_PLAN.md). Decisions are in [DECISIONS.md](./DECISIONS.md).

| Phase | Status | Gate / dependency |
|---|---|---|
| CDA-00 — Decision record | **Accepted (user) October 20, 2026, evening** | Docs only. |
| CDA-01 — Foundation (no visible change) | **Accepted (user) October 20, 2026, night** | No schema. With or before DSH-01. [Record below](#cda-01-record--october-20-2026). |
| CDA-02 — One Facility Administrator | **Accepted (user) October 21, 2026** | Requires CDA-01 exit. One forward-only migration. [Record below](#cda-02-record--october-21-2026). |
| CDA-03 — View everywhere, heads in place | **Accepted (user) October 21, 2026.** A head is required on add in the sense of the needs-a-head list ([CDA-D05](./DECISIONS.md#cda-d05--self-operated-departments--accepted-user-october-20-2026-head-rule-refined-user-october-21-2026)). | Requires CDA-01 exit. Before DSH-02. One forward-only migration. [Record below](#cda-03-record--october-21-2026). |
| CDA-04 — Head-run enforcement: changes and visibility (internal) | **Accepted (user) October 22, 2026.** | Requires CDA-03 exit. CDA-Q08 answered. The enforcement flag stays off. Known limits remain in the records below. [Changes](#cda-04-changes-record--october-21-2026). [Visibility](#cda-04-visibility-record--october-21-2026). [View-only screens](#cda-04-view-only-screens-record--october-21-2026). [Workforce, Legacy, and the manifest](#cda-04-workforce-legacy-and-manifest-record--october-21-2026). |
| CDA-05 — Vendor operation | **Accepted (user) October 22, 2026.** | Requires CDA-04 exit. CDA-Q09 answered. The enforcement flag stays off. [Vendor operation](#cda-05-vendor-head-record--october-21-2026). |
| CDA-06 — Operator-period data | **Accepted (user) October 22, 2026.** | [Design](./CDA-06_DESIGN.md). Flag stays off. [Record](#cda-06-record--october-22-2026). |
| CDA-07 — Enable | **Accepted (user) October 22, 2026.** Staging. Production flag set October 25, 2026. | `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED=true` on production project `ltc-manager`, production target only. The code default stays off. The running deployment picks it up on the next deploy. [Record](#cda-07-record--october-22-2026). |
| CDA-08 — Partner GM build | **Accepted (user) October 25, 2026.** | Partner setup on the partner workspace, including asset title ([CDA-D22](./DECISIONS.md#cda-d22--an-operating-partner-can-add-assets-and-set-title--accepted-user-october-25-2026)). [Record](#cda-08-record--october-25-2026). |
| CDA-09 — Partner company setup in Vssyl Console | **Accepted (user) October 25, 2026.** | [CDA-D21](./DECISIONS.md#cda-d21--vssyl-console-creates-the-partner-company--accepted-user-october-24-2026). [Record](#cda-09-record--october-25-2026). |

## CDA-09 record — October 25, 2026

Authorized when the product owner said to proceed with the first step. That step is company creation. Invitations, the claim queue, and facility attachment are not started.

- [x] A Harbor owner creates a partner company from `/console/partners`. The company type is `MANAGEMENT_COMPANY`. A normalized-name match is refused and the existing company is shown. The action creates no facility, administrator, member, partnership, or Department operator.
- [x] Console invites the first Organization Administrator with the existing claim email, and the first members with the existing member email. Accepting either invitation does not grant facility access. Migration `20261025120000_cda09_harbor_member_invite` records a Console staff inviter.
- [x] The claim queue stays for a company that already exists and has no administrator. Organization Claims is unchanged.
- [x] The Facility Administrator attaches an existing company from search on External Partners and on the Department operator screen.
- [x] Saving a partnership or an operator no longer creates the company. An unknown name says Vssyl Console must create it first.

Accepted by the product owner October 25, 2026.

## CDA-08 record — October 25, 2026

Authorized when the product owner accepted CDA-09 and said to proceed. This step is People & Coverage. Operating rhythm, work plans, menus, forms, and assets are not started.

- [x] The accepted head, and a Partner Manager on that Department, can add a shift, mark a call-off, move the day's assignment to a room the Department is responsible for, and add a team. The page is `/partner/coverage`. With the authority flag off, it redirects home.
- [x] Operating rhythm is `/partner/rhythm`. A cycle covers the whole Department. A phase sits inside a draft cycle. A key point sits on the cycle. Publishing uses the existing cycle service.
- [x] Work plans are `/partner/work`. A draft has one step. The step can link a published Catalog Record owned by the partner organization. Publishing uses the existing work-plan service.
- [x] Menus are `/partner/menus` when the Department product offers menus. Creating a menu uses the menu tables. Attaching it uses the existing applicability rules: one Department location and one published root cycle.
- [x] Catalog forms stay the same name-and-field builder the facility uses. The head and a Partner Manager can save one. It stays organization-owned. Publishing installs it at every facility that organization currently runs.
- [x] The head and a Partner Manager can add an asset in a room this Department already has, and set title, maintainer, and repair vendor. Existing assets stay facility-titled. When that operator period ends, partner-titled equipment is retired and the facility keeps an AssetPresenceNote. Migration `20261025160000_cda08_asset_title`.
- [x] The product owner signs this gate.

Accepted by the product owner October 25, 2026.

## CDA-07 record — October 22, 2026

Authorized when the product owner said to start CDA-07. CDA-06 is accepted. This phase starts at staging. The code default stays `false`. Production stays off until LEG-07 or an explicit exception. Doc amendments in [CDA-D15](./DECISIONS.md#cda-d15--superseded-statements-and-amendment-schedule--accepted-october-20-2026) wait until enforcement is on.

### Staging

The staging project is `ltc-manager-staging`. On October 22, 2026, `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED=true` was set there for production, preview, and development. The production project `ltc-manager` was left unset. The staging database received the same pending migrations, through the operator-period stamp. The first preview (`f685155`) failed because client screens imported server auth. That import is fixed in `3abe885`. The preview is ready: `ltc-manager-staging-be5pcnkza-adtrauts-projects.vercel.app`. The older staging production alias was not replaced. `9334b76` classifies the Dashboard settle log. Verify passed on that commit, and the product owner accepted it October 22, 2026. The Dashboard pilot flag was turned on later the same day for staging preview and development.

A Terrace View facility was added on the staging database, beside the existing synthetic facility. The page walk passed against that data: one Facility Administrator; Food & Nutrition is vendor-run by Metz after the head accepted, and the administrator opens both the ended Sodexo record and the current Metz record; Plant stays self-operated and the administrator only views it; Environmental Services is not installed there; the Metz GM sees the current person and not the ended period; the Sodexo company admin sees the ended period as counts.

Acceptance uses the Terrace View pattern:

- One Facility Administrator.
- Food & Nutrition is vendor-run by Metz. After the Metz head accepts, the Facility Administrator sees a summary and can open compliance Records, including ended periods.
- Plant Operations is self-operated. The Facility Administrator views it until they are its head.
- Environmental Services stays in development and off customer Dashboards.
- A handover to the next operator hides the previous period. The company admin sees ended periods as counts.

### Production — October 25, 2026

The product owner started production enablement after accepting CDA-08. `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED=true` is set on the production project `ltc-manager` for the production target. The code default stays `false`. Preview and development on that project stay unset. The running production deployment picks this up on its next deploy. Constitution, language guide, persona model, domain model, and doc 13 now describe vendor control. The doc 13 release gate includes the write manifest. The Dashboard flag was already removed, so there was no Dashboard production switch to set.

### Not in the October 22 acceptance

- Production enablement. Recorded above on October 25, 2026.
- A real customer. This enablement does not onboard one.

### Accepted

Accepted by the product owner October 22, 2026, for staging, including the Terrace View walk above. Production still needs legacy retirement (LEG-07) or an explicit exception.

## CDA-06 record — October 22, 2026

Built to the [design](./CDA-06_DESIGN.md), approved the same day, including no row deletion and no survey expiry.

### Delivered

- [x] Period stamp `operatorPeriodId` on Menus, Work Plans, Operating Rhythm, People, Schedule, Records, and vendor catalog forms. Migration `20261022120000_cda06_operator_period_stamp`. Assets, repairs, and Plant requests are not stamped.
- [x] Creates stamp the vendor period in force while enforcement is on. Updates do not move a row. Flag off leaves new stamps null.
- [x] Operating lists follow the period in force. A current vendor period hides every other period. The facility People directory keeps null stamps and facility-organization periods.
- [x] Closing a vendor period retires that period's Menus, Work Plans, and Operating Rhythm when the replacement date is today or earlier. People and Records stay.
- [x] Company-admin archive at `/organization/[organizationId]/archive`: ended periods and counts only.
- [x] The Facility Administrator's Log Book includes every period, including ended ones.
- [x] Handover fixture: Metz to Sodexo, then Sodexo back to the facility. The next operator does not see the previous period. The Facility Administrator still opens the Records.

### Limits that stay

- A handover saved for a future date keeps the current operator's setup until that start date. The status change runs when the assignment is saved on or after that date. Operating lists still follow whichever period is in force.
- The archive is counts, not a row-by-row browser.
- Nothing is deleted and nothing expires.
- `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED` stays off.

### Accepted

Accepted by the product owner October 22, 2026, as built, including the limits above. CDA-07 was authorized later the same day, starting at staging. Production still needs legacy retirement (LEG-07) or an explicit exception.

## CDA-03 record — October 21, 2026

Built to the [phased plan](./PHASED_PLAN.md#cda-03--view-everywhere-heads-in-place), [CDA-D03](./DECISIONS.md) and [CDA-D05](./DECISIONS.md#cda-d05--self-operated-departments--accepted-user-october-20-2026). Design as built: [architecture §5](./ARCHITECTURE.md#5-enforcement-points).

### Delivered

- [x] **Facility Administrator view fix (not flagged).**
  - The six modules that denied the Facility Administrator now give view fields only in every self-operated Department, with the shared reason "You can view this Department. Changes are made by its head and team." The six are Work, Records (Log Book), preventive maintenance, Plant requests, Job Flow and Assets.
  - One helper decides it, `resolveFacilityAdministratorView` in `src/lib/department-authority/resolve.ts`. It says yes only for the facility's own Facility Administrator, in a Department of that facility with no vendor operator. It says no for Harbor and partner sessions.
  - No write field changes, so no new writes. Writes still fail with the view reason.
  - The Plant triage panel and the supervisor Work actions on the Operations Board now hide their controls when the person can't use them. The triage panel shows the view reason instead.
- [x] **Head required on add (CDA-D05), as the needs-a-head list.**
  - The product owner decided this at the exit gate on October 21. Departments install as today through Marketplace checkout, and a new Department with no head shows on the needs-a-head list right away. Checkout, billing and the schema don't change.
  - The exit-gate line "New Departments cannot be added without a head" means "a new Department without a head always shows on the to-do list". The list below already does this, so no code changed.
- [x] **Missing-head to-do list.** The Departments page (`/admin/departments`) lists every active self-operated Department that has no head, or whose head has left, with a "Name a head" link to its settings page. It says the Facility Administrator may name themselves.
  - Naming a head who isn't a member now adds them to the Department in the same step. Before, it was refused. This is what lets the Facility Administrator name themselves.
  - Vendor-run Departments are left off the list. Their head comes from the vendor (CDA-05).
- [x] **Head-allowed managers.**
  - The Department's settings page has a new section, "Managers who add staff". The head allows or removes each Manager in the Department; everyone else sees the list read-only.
  - New table `DepartmentStaffManager` (migration `20261021150000_cda03_department_staff_managers`, additive). A mark counts only while the person is an active Manager member of the Department.
  - The action is classified in the write manifest as a Department write. It checks entitlement, Department access and that the person is the head.
  - Nothing enforces the marks yet. That is CDA-04.
- [x] **Tests.**
  - Hermetic (`cda03.hermetic.test.ts`, 21 tests):
    - each of the six modules gives exactly its view fields with the view;
    - without the view, today's denial holds;
    - primary members and other roles are unchanged;
    - head status and manager eligibility.
  - Database (`cda03.db.test.ts`, registered as SQL-backed):
    - the view helper: self-operated Departments yes; vendor-run, another facility, a Manager, another facility's session and Harbor no;
    - the to-do list, including "the head has left";
    - the staff-manager marks and their refusals.
  - Browser, two new tests in the Facility Administrator suite (`department-view.spec.ts`), on a facility where the Administrator belongs to no Department:
    - **View.** Work and Log Book open in Food & Nutrition and in Plant. The preventive maintenance board shows the published plan. On the Operations Board, a Plant request opens read-only, with no accept or decline.
    - **Heads.** Both Departments are on the to-do list. The Administrator names themselves head of Plant, allows the Plant manager, and Plant leaves the list.
  - Updated: `plant-release.test.ts`. A Facility Administrator's triage is still refused; the test now also accepts the view reason as the message.

### Verification (October 21, 2026)

- Typecheck, discovery sentinel (463 files, 61 SQL-backed), repository hygiene: pass.
- Lint: no errors. The 7 warnings in touched folders are all in files this phase didn't change.
- Migration integrity: pass, 152 migrations. As in CDA-02, it ran against a temporary copy of the git index that includes the two uncommitted migrations.
- Hermetic suite: 3,846 tests, 0 failures.
- `verify:db` (managed disposable database `ltc_verify_cda03_db`, created and dropped by the script): 3,853 tests, 0 failures, 7 skipped, on the second run.
  - The first run had two failures. One was the `plant-release.test.ts` message pattern, fixed as above. The other was a Postgres deadlock in the support-ticket test cleanup, which has nothing to do with CDA-03 and didn't recur.
  - The first run left its database behind (known gap); the second run recreated it and dropped it.
- Browser, Facility Administrator suite (`POSTMARK_SERVER_TOKEN` blank; database `ltc_verify_cda03_browser`, created and dropped by the runner): 4 of 4 pass, the two CDA-02 tests and the two above.
  - The first run stopped in the fixtures. Linking the Administrator's roster record through an invitation is refused, because People cannot assign the role. The fixture now creates the record already linked, as facility setup does.
  - That stop exits before the runner's cleanup, so the database stayed behind until the next managed run recreated and dropped it. This is the same gap as `verify-db.mjs`.
  - The runner now also sets the Department engine flags the Plant runner uses.

### For review

- **Self-operated only.** Vendor-run Departments still deny the Facility Administrator. Under R4 the Administrator keeps control until the vendor's head accepts, but that arrives with CDA-05.
- **The head still gets `VIEW` only** when the head isn't the Department's primary member. `MANAGE` for the head comes with CDA-04.
- **Forms still show in view mode.** The Work Plan builder shows its full authoring form to the Facility Administrator, and saving fails with the view reason. Other pages may do the same. CDA-04 owns hiding forms and the shared notice. Only the Plant triage controls and the supervisor Work actions were hidden here.
- **Not opened:**
  - Plant request reporting stays closed to the Facility Administrator, so no write was added.
  - The Asset issue detail page keeps its gate, because it carries an evidence-link form with no check of its own.
- **The migration** was taken as approved under the plan's "possibly one forward-only migration". It is a separate table because the primary Department is a field on the employee, not a membership row.
- **Allowed managers must hold the Manager role.** Supervisors and the head are not offered.
- **Clearing a head** is still allowed. The Department then appears on the to-do list.
- **A Facility Administrator with no roster record** can't name themselves. Facility setup creates one.
- **Preventive maintenance and Assets** take the primary Department from the sign-in session, not the live record, as before.
- **The unused `createDepartmentAction`** (not on any page) is unchanged.
- **Local database.** `ltc_manager` doesn't have the CDA-02 or CDA-03 migrations. Run `prisma migrate deploy` (after the CDA-02 report) and restart the dev server before using these screens locally.

### Waiting on the product owner

Nothing for CDA-03. Done October 21: the product owner chose the needs-a-head list as the head rule over asking for a head at checkout, and accepted CDA-03. The rule is recorded in [CDA-D05](./DECISIONS.md#cda-d05--self-operated-departments--accepted-user-october-20-2026-head-rule-refined-user-october-21-2026). No disposable database from this phase remains. CDA-04 changes were authorized the same day. DSH-02 is not authorized.

## CDA-04 changes record — October 21, 2026

Authorized as the changes part only. Visibility (lists, pages, assets, and Plant place-picking) is not authorized and was not built. No schema change.

### Delivered

- [x] **Write ceiling, behind `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED`.** `applyDepartmentChangeCeiling` runs after the domain authority decisions for Operating Rhythm, Teams, Coverage, Job Roles, Work, Records, preventive maintenance, Job Flow, Assets, Plant requests, and Assignments. Menus and Location Function profile writes use the same gate. With the flag off, the previous decision is returned unchanged.
- [x] **Facility Administrator.** Below head, write fields are cleared and view fields stay. A Facility Administrator who is the head skips the old "status alone" denial and keeps the role decision, so they can change that Department.
- [x] **People outside a Department.** `SUMMARY` and `NONE` clear view and write fields on those decisions, so they cannot change the Department through those modules.
- [x] **Head-allowed managers.** Creating a person, editing a profile, and changing status call `assertCanChangeDepartmentPeople`. With the flag on, only the head, or a manager the head has marked, can do that. With the flag off, the existing Manager check stands.

### Not in this authorization

- Visibility was a later step the same day. See the [visibility record](#cda-04-visibility-record--october-21-2026).
- Hiding forms on view-only screens, and the shared notice on those screens.
- Two workforce records for a person in both a vendor-run and a facility Department.
- Switching the write-manifest test from report mode to failing mode.
- Schedule, repairs, issues, separations, and PIN changes still use their previous role checks. They are not on the ceiling yet.

### Verification

- Typecheck passes.
- Hermetic suite: 3,850 tests, 0 failures. The flag defaults off, so this run still exercises the previous decisions, plus the new ceiling tests.
- `verify:db` was not re-run for this slice.

### Waiting on the product owner

The changes slice is in place. Visibility was started from "Start the next step" on October 21. DSH-02 is not authorized.

## CDA-04 visibility record — October 21, 2026

Authorized when the product owner said to start the next step. This is the read-scoping part of CDA-04 (CDA-D16). The flag is still `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED`, default off. Flag off leaves every list as it was. No schema change.

### Delivered

- [x] **Who can see a Department.** `loadDepartmentVisibility` keeps Departments whose mode is not `NONE`. The Facility Administrator and Harbor cover every Department, so their facility-wide lists stay. Anyone else is limited to the Departments they belong to or lead.
- [x] **People.** The People directory, HR audit, points, separations, the credential report, and bulk-setup references only include people in those Departments. A `dept` link to another Department is dropped.
- [x] **Rooms and locations.** Facility Builder, the Locations list, and the People neighborhood list keep a room or neighborhood when one of its Department responsibilities is visible. Another Department's responsibility on a shared place is left off the row.
- [x] **Menus, Logs, and Assets.** A Department id in the address that this person cannot see returns not found. Menu and Log lists follow the same set. Assets follow CDA-D18: the using Department sees its own; Plant, the Facility Administrator, and Harbor see every asset.
- [x] **Direct Department pages.** Department Builder, Department settings, preventive maintenance, and a Department's Logs return not found when the mode would be `NONE`.
- [x] **Choosing a Department.** The department switcher refuses a Department whose mode is `NONE`. Facility-wide schedules still open only from the all-Departments view, which is the administrator's.
- [x] **Plant place-picking (CDA-Q08).** Left as it is: anyone reporting to Plant can pick any place in the building. That pick does not open the place's Department.

### Not in this step

- Hiding forms was the next step the same day. See the [view-only screens record](#cda-04-view-only-screens-record--october-21-2026).
- Two workforce records for one person.
- Switching the write-manifest test from report mode to failing mode.
- Schedule, repairs, issues, separations, and PIN writes. They still use their previous role checks. Separations here are the list of people, not the write.
- DSH-02.

### For review

- With the flag on, a Department member no longer sees assets that have no using Department. Plant and the Facility Administrator still do.
- With the flag on, Plant sees every asset, including those another Department uses, even when Plant is the selected Department.
- A room with no Department responsibility is hidden from Department members. The Facility Administrator still sees it in Facility Builder.
- Logs that follow the shell Department were already limited to the selected Department. The new check stops that selection, and the empty-log hint no longer names a Department the person cannot see.

### Verification

- Typecheck passes.
- Hermetic suite: 3,854 tests, 0 failures. The four new visibility tests are in that run. The flag defaults off, so the rest of the suite still sees the previous lists.
- `verify:db` was not re-run. The new database assertions sit in the existing department-authority database test and run with that suite.

### Waiting on the product owner

Review visibility before the rest of CDA-04. DSH-02 is not authorized. View-only screens were started the same day.

## CDA-04 view-only screens record — October 21, 2026

Authorized when the product owner said to start the next round. This is plan item 3: read-only rendering for `VIEW`. The flag is still `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED`, default off. With the flag off the screens stay as they are. No schema change.

The notice is the existing sentence: "You can view this Department. Changes are made by its head and team."

### Delivered

- [x] **Shared notice.** `departmentViewOnlyNotice` returns that sentence only while the flag is on and the decision reason is the view reason.
- [x] **Forms hidden on the screens a view-only person reaches.**
  - Work Plans: the plan list stays, and the editor is a reading of the selected plan.
  - Department Builder: the notice sits above the tabs. The Record engine form and the Plant starter install stay off.
  - Schedule and the Daily Assignment Board: edit actions stay off.
  - People: new person, import, bulk setup, and profile edits stay off when this person cannot change the Department.
  - Menus: Create menu stays off when none of the listed Departments can be changed.
  - Assets: the condition form stays off unless this person can change that asset's Department. One notice on the Assets tab.
  - Preventive maintenance: the plan editor and the new-plan page show the notice instead of the draft form. The list already hid Create.

Panels that already hide their controls when `canManage` is false (Operating Rhythm, Teams, Coverage, Locations) keep doing that. The Department Builder notice covers those tabs.

### Not in this round

- Two workforce records for one person (plan item 4).
- Legacy writes classed Legacy (plan item 5).
- The manifest test in failing mode (plan item 6).
- Repair, issue, and PIN forms. Those writes are still on their previous role checks.
- DSH-02.

### For review

- Schedule and assignment edits are hidden, and the actions behind them are still the previous role checks. A crafted request can still change a schedule.
- The vendor form on Maintenance stays available. It is a facility vendor list, not a Department form.
- Naming a head stays available. That is the Facility Administrator's governance action.
- With the flag on, Plant can see another Department's assets and cannot change their condition from this screen.

### Verification

- Typecheck passes.
- Hermetic suite: 3,855 tests, 0 failures. The new notice test is in that run. The flag defaults off, so the other screens stay on their previous paths.
- `verify:db` was not re-run.

### Waiting on the product owner

Review the view-only screens. Plan items 4, 5, and 6 were started the same day. DSH-02 is not authorized.

## CDA-04 workforce, Legacy, and manifest record — October 21, 2026

Authorized when the product owner said to keep going with the next steps. This is plan items 4, 5, and 6. No schema change. The flag is still `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED`, default off, for the workforce rule. The manifest check does not depend on the flag.

### Delivered

- [x] **Two workforce records (CDA-Q05).** `assertOneOperatorWorkforce` runs when membership is saved. With the flag on, one Employee cannot belong to a vendor-run Department and a facility Department at the same time. The second record is a separate Employee. With the flag off, one person can still belong to both.
- [x] **Legacy class (CDA-D17, LEG-D12).** The old profile and Experience editor actions are class Legacy: baseline drafts, certify, activate, retire, Experience areas, archetypes, and room exceptions. Location Function binding and publishing stay Department. `/logs`, inspections, issues, and the other surfaces already classed Legacy stay Legacy.
- [x] **Manifest failing mode.** `WRITE_MANIFEST_MODE` is `enforce`. An unlisted write fails the hermetic test. The Facility Administrator appoint, transfer, recovery, accept, and decline actions are class Governance.

### Not in this step

- A second Employee linked to the same user account. The Employee table still allows one linked account per facility. The separate record is unlinked until a later schema change.
- Vendor accounts and operator-period stamps. Those are CDA-05 and CDA-06.
- Schedule, repair, issue, separation, and PIN writes. The screens hide some of them. The actions still use their previous role checks.
- DSH-02 and CDA-05.

### For review

- Saving a person who already belongs to both kinds of Department is refused while the flag is on. Their existing rows stay until someone edits them, and that edit has to leave one operator.
- A linked account cannot be attached to the second record. Creating that second record without the account is how the two records exist today.

### Verification

- Typecheck passes.
- Hermetic suite: 3,857 tests, 0 failures. The two workforce-record tests are in that run, and the write manifest now fails on an unlisted write. The flag defaults off, so membership saves stay on the previous path.
- `verify:db` was not re-run. The new database assertion sits in the existing department-authority database test.

### Accepted

Accepted by the product owner October 22, 2026, together with the changes, visibility, and view-only records above. The limits in those records stay. Schedule, repair, issue, separation, and PIN writes still use their previous role checks. A second workforce record cannot share a login. `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED` stays off.

## CDA-05 vendor head record — October 21, 2026

Authorized when the product owner said to start CDA-05. This is [CDA-D06](./DECISIONS.md#cda-d06--vendor-run-departments--accepted-user-october-20-2026) and the asset and form slices that followed. Forward-only migrations. The same enforcement flag, default off.

### Delivered

- [x] **The vendor's company admin names the head.** Organization → Departments lists the Departments that organization runs. An organization administrator chooses a current member. Naming someone else replaces the open assignment.
- [x] **Acceptance is recorded.** The named person accepts or declines on that page. `vendorHeadAccepted` is true only for an accepted assignment on the operator period in force.
- [x] **The Facility Administrator drops to SUMMARY after acceptance.** Before acceptance they keep `MANAGE`. After it, Department pages do not open, and people, menus, and setup lists leave that Department out. The Departments list offers compliance Records instead of Manage, and the Log Book opens read-only for that Department.
- [x] **The accepted vendor account is the head.** A vendor session for that user is `MANAGE` on the Department their organization runs.
- [x] **The head can open the Department.** Accepting opens partner access when the facility has an administrator and the Department is operable. The partner shell then shows People and Department. People adds a PIN-only workforce record.
- [x] **Internal vendor staff move to vendor accounts.** The organization administrator moves accounts that belong only to that vendor Department. The workforce record stays. The facility role ends. The Facility Administrator is left in place.
- [x] **The vendor head's Department leader Dashboard.** While enforcement is on, an accepted head is a Department leader for the Departments they run. The partner Dashboard lists those cards above the existing review, Logs, and assets. This does not start the new Dashboard page.
- [x] **Who maintains an asset, and who pays.** A head can name their own organization immediately. Naming the other party waits for that party's head to accept, and the current maintainer stays. A work order on a maintained asset is run by that maintainer's Department, and the payer is copied onto the work order. A vendor-paid cost and the repair company stay hidden from everyone except that vendor's team.
- [x] **Each maintainer's repair companies.** While enforcement is on, a vendor team sees and adds only its companies. Plant and the Facility Administrator see the facility's companies. A preferred repair company has to belong to the asset's maintainer.
- [x] **Vendor-owned forms.** A form the vendor head adds belongs to that organization. Published catalog lists at a facility include it only for people who run a Department that organization operates. Vssyl's forms stay available. Facility-made forms stay for LEG-02.

### Not in this slice

- Facility-made forms (LEG-02). The owner column can record them. The authoring screen is not built.
- Operator-period archive. That is CDA-06, and it needs its own design record.

### For review

- A second record still cannot share a login. This slice does not change that.
- The Departments link appears only while the flag is on. A direct visit while the flag is off shows that assignment is not in effect.
- Replacing an accepted head returns control to the Facility Administrator until the next person accepts.
- Partner access opens on acceptance only when the facility has an administrator and the Department is already operable. Otherwise the head is recorded and access can be opened later.
- People and Department appear in the vendor shell only for the accepted head. Other vendor sessions stay on the existing partner pages.
- Moving accounts skips anyone who also belongs to a facility Department, and skips the Facility Administrator.

### Verification

- Typecheck passes.
- Hermetic suite: 3,868 tests, 0 failures. The flag defaults off.
- Database test on disposable `ltc_verify_cda05`: assign, accept, Facility Administrator summary, the vendor account as head, that head as a Department leader, a PIN workforce record, a non-head refused, replace, decline, and the flag-off refusal. One pass. `verify:db` was not re-run.

### Accepted

Accepted by the product owner October 22, 2026, including vendor head assignment, partner entry, PIN workforce records, maintainer acceptance, repair-company privacy, and vendor-owned forms. The limits above stay. `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED` stays off. CDA-06's design record was authorized the same day.

## CDA-02 record — October 21, 2026

Built to the product owner's answers in [CDA-D19](./DECISIONS.md#cda-d19--how-transfer-and-recovery-work--accepted-user-october-21-2026). Design as built: [architecture §6](./ARCHITECTURE.md#6-one-facility-administrator-cda-02).

### Delivered

- [x] **One Facility Administrator per facility, enforced twice.**
  - Service: every path that opens a Facility role period locks the facility and checks the seat (`src/lib/facility-access/administrator-seat.ts`).
  - Database: migration `20261021090000_cda02_one_facility_administrator` adds a trigger that refuses a second open Facility Administrator period. The migration refuses to apply while any facility already has two.
- [x] **Transfer.** The holder picks a successor who already has an active account at the facility, and the role they keep (Manager by default). Nothing changes until the successor accepts. Acceptance moves the role in one transaction and updates both people's Employee records with an HR audit row.
- [x] **Recovery.** The parent organization's admin appoints by email, only when the role is empty or its holder's account, facility access or employment has ended. The appointee accepts through the same invitation. Acceptance ends the departed holder's role and signs out their sessions.
- [x] **Invitations.** New table `FacilityAdministratorInvitation`. One open invitation per facility; each lasts 7 days and can be cancelled or declined.
- [x] **Screens.**
  - Holder: Organization Settings → Facility Administrator (`/admin/organization/facility-administrator`).
  - Invitee: My Account shows a notice; answers are at `/account/facility-administrator`.
  - Organization admin: a new Facilities page in the organization workspace (`/organization/[organizationId]/facilities`).
- [x] **People.** New Employee, the Employee Profile, onboarding, imports, account links and rehire no longer assign the role. The holder's profile shows it locked, with a link to transfer.
- [x] **Rollout report.** `npx tsx scripts/facility-administrator-report.ts`, read-only. Run twice on the local `ltc_manager` database (approved): clean both times.
- [x] **Tests.**
  - Hermetic: the module's rules, the People refusal table, report grouping and email escaping.
  - Database (`facility-administrator.db.test.ts`, registered as SQL-backed): the trigger; the service guard on every opening path; three simultaneous promotions leave one holder; transfer and recovery with all their refusals; the report.
  - Browser: new suite `npm run test:facility-administrator-browser`. Transfer: the holder sends, the successor accepts, and both live sessions change role. Recovery: the organization page refuses a held role and an unknown email, appoints the departed holder's successor, and the appointee accepts.
- [x] **Fixtures and tests updated** for one administrator per facility:
  - product shell: the workspace-selector account is now General Manager at Terrace View, which already has `shell.fa`
  - offline: removed an unused second administrator account
  - `implementation.db.test.ts`: the reviewer test moves the role to the reviewer before they upload, since uploads need the live Facility Administrator
  - two hermetic fakes gained the seat query

### Verification (October 21, 2026)

- Typecheck, discovery sentinel (461 files, 60 SQL-backed), repository hygiene: pass.
- Lint: no errors. Five warnings in touched files predate CDA-02.
- Migration integrity: pass, 151 migrations. Because the new migration isn't committed yet, this was run against a temporary copy of the git index that includes it; the real index was not touched. Once committed, the normal run covers it.
- Hermetic suite: 3,824 tests, 0 failures.
- `verify:db` (managed disposable database `ltc_verify_cda02_db`, created and dropped by the script): 3,831 tests, 0 failures, 7 skipped. The first run had one failure: `implementation.db.test.ts` created a second Facility Administrator, and the trigger refused it. The test was rewritten as above, and the second run passed. The first run left its database behind (known `verify-db.mjs` cleanup gap, see CDA-01); the second run dropped it.
- Browser:
  - Facility Administrator suite: 2 of 2 pass (database created and dropped by the runner).
  - Product shell: 26 pass, 2 fail, 3 skipped. The workspace-selector scenarios edited here pass. The failures are scenario 16 (the locations rail is missing on `/units`) and scenario 19 (the Build header colour check). Both use the Manager account and touch nothing changed here. The spec was last updated October 13, before the shell and Units changes of October 15 and 20, so they look like earlier drift. Not proven by running the old code.
  - Offline: 44 pass, 28 fail. All 28 (14 scenarios on two devices) wait for `data-testid="unit-workspace"`, which no longer exists anywhere in the app: `/unit/[id]` now renders Location Runtime. Earlier drift; the spec was last updated October 2. The administrator signs in correctly.
  - The other browser suites weren't run. EVS, Plant, Operational Evidence, Operational Cycles, Job Flow, Bulk Import and EVS Assignment create accounts with no facility access and no verified email, so their sign-ins were already stale before CDA-02. CDA-02 doesn't change them, because they open no role periods.

### For review

- **Production rollout order.** Run the report first, then the migration. If the migration refuses, resolve the duplicates, run `prisma migrate resolve --rolled-back 20261021090000_cda02_one_facility_administrator`, and deploy again.
- **Sister-facility grants.** Granting a facility to someone whose home role is Facility Administrator is now refused when that facility already has one. A role choice on grant may be needed later.
- **The organization admin sees the holder's name and email** on the Facilities page. They see no other facility people.
- **The departed holder's home role stays Facility Administrator** after a recovery. This fails closed: role repair can't open a second administrator. The report ignores home-role claims from people whose account, access or employment has ended.
- **Implementation engagements.** `addParticipant` still requires a participant whose home role is Facility Administrator at the facility. With one administrator, the only live participant is the holder. The onboarding program should decide what a second participant means now. Not changed here.
- **Invitation email** uses inline text, not a Postmark template. The browser runner blanks `POSTMARK_SERVER_TOKEN`, because `.env.production.local` would otherwise send real email to the synthetic addresses. No other browser runner does this. They inherit the same risk whenever their flows send email.
- **Fixed during the build:**
  - Forms that refresh their own page lost their result message: the send result for a transfer or appointment, and the invitee's confirmation. They now keep it.
  - The report called home-role claims "next sign-in", but sign-in never repairs a role. It now calls them home-role claims.
- **Local database.** `ltc_manager` does not have the CDA-02 migration. Before using the new screens locally, run `prisma migrate deploy` (after the report) and restart the dev server.

### Waiting on the product owner

Nothing for CDA-02. Done October 21: CDA-02 was accepted at its exit gate, and CDA-03 was authorized. With the user's go-ahead, the development database `ltc_verify_cda02_dev` was dropped; no disposable database from CDA-02 remains. DSH-02 is not authorized.

## CDA-01 record — October 20, 2026

### Delivered

- [x] `src/lib/department-authority/`, as [architecture §3](./ARCHITECTURE.md#3-the-resolver-srclibdepartment-authority) now records:
  - `access.ts`: the four modes, `decideDepartmentAccess` (R1–R9), the compliance-Records rule, the shared reason text, `requireDepartmentManage` and `DepartmentAccessError`
  - `resolve.ts`: `resolveDepartmentAccess` and the batched `resolveDepartmentAccessMap`. The session's workforce facts are memoized per request.
  - `led-departments.ts`: the shared head predicate `resolveLedDepartmentIds`, for DSH-01
  - `owners.ts`: 37 owner resolvers covering the [§4 table](./ARCHITECTURE.md#4-owning-department-for-each-write)
  - `write-manifest.ts`: all 426 server actions and write routes classified (216 Department, 90 Governance, 77 Auth/system, 31 Legacy, 7 Personal, 5 Shared facility). Report mode.
- [x] Flag `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED` in `src/lib/feature-flags.ts` and `.env.example`, default `false`.
- [x] Tests:
  - hermetic decision matrix over all 384 combinations, plus the Terrace View scenarios
  - resolver behavior with the flag on and off
  - owner resolvers: each one is scoped to the facility, plus every fallback
  - manifest report: stale rows or unknown owners fail; unlisted writes are reported
  - database: operator start and end on the facility service date across the New York midnight boundary, head, GM, member, flag off, other facility (`department-authority.db.test.ts`, registered as SQL-backed)
- [x] No schema change. Nothing in the app calls the module yet, so behavior is unchanged with the flag on or off.

### Stand-ins until later phases

| Input | Until | Value in CDA-01 |
|---|---|---|
| Facility Administrator | CDA-02 | The session's Facility role |
| Vendor head accepted | CDA-05 | Always `false`, so the Facility Administrator manages vendor-run Departments |
| Vendor account membership | CDA-05 | Departments in the partner's authorized scope; no vendor heads |
| Work order owner | CDA-05 (CDA-D18) | The work order's responsible Department |

### Verification (October 20, 2026)

- Typecheck, lint, discovery sentinel (451 files), migration integrity (150), repository hygiene: pass.
- Hermetic suite: 3,752 tests, 0 failures.
- Production build: pass.
- `verify:db` on a disposable database (`ltc_verify_cda01_20261020`, created and dropped by the script): 3,752 tests, 0 failures on the second run.
  - The first run had one failure, in `src/lib/offline/space/space.db.test.ts` ("short lease expires…"). It passed alone and on the second full run. It is timing-sensitive under load and unrelated to CDA.
  - That failed run left its database behind. `scripts/verify/verify-db.mjs` exits the process inside `run()` on failure, which skips the cleanup that drops the managed database. The second run dropped it. Not fixed here.

### Notes for CDA-04 (not decided here)

- A workforce record belongs to each of its Departments, so its owner resolver returns all of them. CDA-04 decides which Department a person-level change needs.
- Department manifest rows were classified by action name and inputs. CDA-04's action test for each row confirms the owner kind.
- Legacy rows cover the legacy surfaces named in `AGENTS.md`. CDA-04 completes the Legacy class, for example the old profile and Experience editor actions (LEG-D12), which are still Department rows.
- Offline sync and conflict resolution are Auth/system, because they replay commands through the domain modules. CDA-04 checks that each replayed command is covered.
- Knowledge articles are not in the §4 table. Their owner is the article's Department, or shared facility when it has none, the same as inspection definitions.
- `canManageDepartmentHeadSettings` kept its own copy of the head rule. DSH-01 (accepted October 21) moved it onto `resolveLedDepartmentIds`, with tests proving identical answers.

### Waiting on the product owner

- Authorize CDA-02 and CDA-03, each separately. Both require CDA-01's exit, which is now met.

Done October 20, night: CDA-01 was accepted at its exit gate, and DSH-01 was authorized as the next phase ([Dashboard tracker](../dashboard/PHASE_TRACKER.md)). CDA-02 and CDA-03 were not authorized.

Done October 21, morning: DSH-01 was accepted, and CDA-02 was authorized. CDA-03 is not authorized.

## CDA-00 record — October 20, 2026

### Delivered

- [x] Program record: [README](./README.md), [audit](./CURRENT_STATE_AUDIT_2026-10-20.md), [decisions](./DECISIONS.md), [architecture](./ARCHITECTURE.md), [phased plan](./PHASED_PLAN.md), this tracker.
- [x] Morning version: contracted Departments only.
- [x] Afternoon revision from two if/then rounds with the product owner (21 answers):
  - one Facility Administrator with transfer and parent-organization recovery (CDA-D02)
  - every Department run by its head and head-allowed managers (CDA-D03)
  - the Facility Administrator views self-operated Departments and sees summaries of vendor-run ones (CDA-D04, CDA-D08)
  - a head is required when a self-operated Department is added (CDA-D05)
  - the vendor's company admin assigns vendor heads; the Facility Administrator keeps control until acceptance (CDA-D06)
  - vendor accounts (CDA-D07)
  - Plant's records stay with the facility (CDA-D09)
  - data belongs to the operator who produced it (CDA-D10)
- [x] Last round (7 answers):
  - CDA-Q01 to Q07 answered
  - each Department sees only its own (CDA-D16)
  - nothing legacy at the first real customer (CDA-D17)
- [x] Asset round (5 answers): assets are facility property shared with Plant; the using head picks the maintainer, which runs and pays for repairs with its own repair companies (CDA-D18).
- [x] Revision history kept in [DECISIONS](./DECISIONS.md#revision-history).
- [x] Dashboard program updated to match.

### Waiting on the product owner

Nothing for CDA-00. The record was accepted and CDA-01 authorized on October 20, evening. CDA-01 was delivered that night ([record above](#cda-01-record--october-20-2026)).

Answered (user) October 20 afternoon:
- CDA-Q08: anyone may pick any place in the building when reporting to Plant.
- CDA-Q09: changing an asset's maintainer to another party needs that party's acceptance.

Every CDA confirmation item is now answered.
