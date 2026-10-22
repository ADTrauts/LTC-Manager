# Contracted Department Authority — decisions

Decision log for the [Contracted Department Authority program](./README.md). "Accepted (user)" means the product owner decided it, through the if/then rounds on October 20, 2026. "Accepted (program default)" means it follows from user decisions or existing architecture and stands unless the product owner changes it. Confirmation items (`CDA-Q`) are at the end.

Evidence is in the [current-state audit](./CURRENT_STATE_AUDIT_2026-10-20.md). The [revision history](#revision-history) lists what earlier versions of this log said that no longer holds.

## The model in one page

| Who | Self-operated Department (e.g. EVS, Plant at Terrace View) | Vendor-run Department (e.g. Food & Nutrition, run by Metz Culinary) |
|---|---|---|
| **Facility Administrator** (one per facility) | Governance. Views everything. Changes Department rules only if they name themselves head. | Governance. Sees high-level work on the Dashboard, and can open compliance Records read-only. Cannot be head. Keeps control only until the vendor's head accepts. |
| **Who names the head** | The Facility Administrator, when the Department is added | The vendor's company admin, from their vendor account |
| **Head (title: Department head or GM)** | Runs the Department: rules, functionality, people | Runs the Department: rules, functionality, people |
| **Staff and roles** | Added and set by the head and managers the head allows | Added and set by the head and managers the head allows |
| **People in other Departments** | See nothing of it, except cross-Department work. Only Plant shares its assets. | Same |
| **Assets it uses** | Facility property. Seen by this Department, Plant and the Facility Administrator. Its head picks the maintainer: Plant or the vendor. | Same. If the vendor maintains an asset, the vendor's team runs and pays for its repairs, with its own repair companies. |
| **Data** | Belongs to the facility | Belongs to the vendor. On contract end it is archived with the vendor. The facility can read compliance Records during and after the contract. Assets and their repair history stay with the facility. |

---

## CDA-D01 — Run this as its own program — accepted (user) October 20, 2026

This program decides who controls each Department, who sees it, how a vendor operates one, and who owns the data. It touches every page that reads or changes Department data, plus accounts and data retention.
- It uses `CDA-` identifiers.
- It does not renumber the [Dashboard program](../dashboard/README.md) (`DSH-`) or the [onboarding program](../onboarding/README.md) (`ONB-`).
- The Dashboard depends on it ([DSH-D18](../dashboard/DECISIONS.md#dsh-d18--how-the-dashboard-shows-each-department-to-the-facility-administrator--accepted-user-october-20-2026)).

## CDA-D02 — One Facility Administrator per facility, with ownership transfer — accepted (user) October 20, 2026

**The Facility Administrator owns the facility account.** Usually this is the person who created it. They:
- set up billing and license Departments
- add Departments
- choose each Department's operator: self-operated, or run by a named vendor
- name the head of each self-operated Department
- set up vendor relationships and their facility-level access
- manage the facility's shared structure: buildings, rooms, and which rooms each Department serves
- handle account security: revoke sessions, end a person's access to the facility

**Exactly one at a time.** The app allows any number today ([audit](./CURRENT_STATE_AUDIT_2026-10-20.md#7-facility-administrator-role-today)).

**Transfer.** The Facility Administrator invites the successor. When the successor accepts:
- the role moves at that moment
- the previous Facility Administrator loses it, but keeps any Department head role they hold

**Recovery.** If the Facility Administrator leaves without transferring, the parent organization's admin (ECMC for Terrace View) appoints the new one.

How transfer and recovery work in detail: [CDA-D19](#cda-d19--how-transfer-and-recovery-work--accepted-user-october-21-2026).

**Rollout.**
- There are no customer facilities yet (CDA-D17).
- Test facilities with several Facility Administrators are cleaned up before the one-administrator rule starts.
- Vssyl support resolves any that exist at that time.

## CDA-D03 — Every Department is run by its head — accepted (user) October 20, 2026

- The head controls the Department's rules and functionality: Build, Operating Rhythm, Location Functions, Work Plans, Menus, Records configuration, schedules, assignments and coverage.
- "Department head" and "GM" are the same position under either title.
- **The head and the managers the head allows** add staff and set their roles in the Department.
- Everyone acts within their role. A Supervisor edits schedules only if their role allows it in that Department.
- This applies to self-operated and vendor-run Departments alike.
- People outside a Department cannot change it, whatever their role. That includes the Facility Administrator, unless they are the head.

## CDA-D04 — The Facility Administrator's access to Departments — accepted (user) October 20, 2026

| Situation | Facility Administrator |
|---|---|
| Self-operated, not the head | Views everything, changes nothing in the Department |
| Self-operated, named themselves head | Runs it like any head |
| Vendor-run, before the vendor's head accepts | Keeps control, for example to finish setup |
| Vendor-run, after the vendor's head accepts | Sees high-level work on the Dashboard (CDA-D08). Can open the Department's compliance Records read-only (CDA-Q01). Cannot open its other pages. Cannot name themselves head. |

Governance actions (CDA-D02) are available in every situation.

## CDA-D05 — Self-operated Departments — accepted (user) October 20, 2026; head rule refined (user) October 21, 2026

- **A head is required when the Department is added.** The Facility Administrator may name themselves.
  - How it works (user, October 21, 2026): Departments are installed as today, through Marketplace checkout. A new Department with no head shows on the needs-a-head list right away. Checkout, billing and the schema don't change. "New Departments cannot be added without a head" means "a new Department without a head always shows on the to-do list."
- Control and data stay with the facility.
- If the head leaves, the Facility Administrator names a successor, who may be themselves.

## CDA-D06 — Vendor-run Departments — accepted (user) October 20, 2026

1. The Facility Administrator records the vendor as the Department's operator, with a start date (`DepartmentOperatorRelationship`, as today).
2. **The vendor's company admin assigns the head.** That is an organization admin of the vendor, such as Metz corporate, acting from their own vendor account.
3. **Until the head accepts**, the Facility Administrator keeps control of the Department.
4. **When the head accepts**, control moves to the vendor:
   - the head and the managers the head allows run it
   - the Facility Administrator drops to Dashboard summaries and read-only compliance Records
5. The vendor's company admin can replace the head at any time.

## CDA-D07 — Vendor people sign in with vendor accounts — accepted (user) October 20, 2026

- The vendor's head and leaders use their own vendor account: one login across every facility the vendor serves.
- Each account has access only to the Departments it works in.
- This builds on partner access (Path B, `PartnerUserFacilityAccess`). Today that allows only reading, submitting and correcting Records. For vendor-run Departments it grows to full Department authority within each person's role.
- Hourly vendor staff sign in with a PIN at the facility (CDA-Q02). Existing internal accounts of vendor staff move to vendor accounts (CDA-Q03).

## CDA-D08 — What the Facility Administrator sees of a vendor-run Department — accepted (user) October 20, 2026

**User wording:** "their dashboard should see some high level work for each department within the facility."

**Recorded as:**
- The Facility Administrator's Dashboard shows high-level work for every Department.
- For a vendor-run Department it stops at that level:
  - status and counts only (list confirmed in CDA-Q07)
  - no names
  - no links into the vendor's pages
  - no setup details
- Separately, the Facility Administrator can open compliance Records read-only from Records, not from the Dashboard (CDA-Q01).

## CDA-D09 — Cross-Department work stays with the receiving Department — accepted (user) October 20, 2026

When the vendor's team asks Plant for a repair, the request and work order are Plant's records. They stay with the facility, and the Facility Administrator and Plant manage them as today. The vendor's team still sees the status of what it reported.

## CDA-D10 — Data belongs to the operator who produced it — accepted (user) October 20, 2026

**The user's reason.** A vendor's data is proprietary. The next operator should not see it.

| Data from a vendor's period | On contract end |
|---|---|
| Records (temperature logs, sanitation checks, meal-service times) | Archived with the vendor. **The facility keeps read-only access** it can show a surveyor. |
| Setup: menus, recipes, Work Plans, Operating Rhythm, job roles, staffing templates | Archived with the vendor. The next operator starts from Vssyl's standard starters. |
| Vendor employee records: profiles, schedules, discipline | Go with the vendor entirely |
| Plant requests and work orders | Stay with the facility (CDA-D09) |
| Assets, including the ones the vendor maintained, and their repair history | Stay with the facility (CDA-D18) |
| Repair costs the vendor paid, and the vendor's own repair companies | Go with the vendor (CDA-D18) |
| Who can open the archive | The vendor's company admin only |

**Program defaults that follow:**
- **Each operator period is its own data space.** An incoming operator never sees the previous operator's data. That applies whether the previous operator was the facility or another vendor.
- **The facility's own periods stay with the facility.** If Terrace View once ran Food & Nutrition itself, that data stays with ECMC and Metz never sees it.
- **The facility can always read compliance Records.**
  - It applies during the contract and after it ends (CDA-Q01).
  - It covers Records only: not setup, not people.

**Why compliance Records matter.**
- Under [42 CFR 483.70(f)](https://www.law.cornell.edu/cfr/text/42/483.70) (F840), the facility stays responsible for services it contracts out.
- Food-safety surveys (F812) review temperature and sanitizer logs.

## CDA-D11 — One resolver decides access everywhere — accepted (program default) October 20, 2026

- A single platform module decides a person's access to a Department on a service date: **Manage**, **View**, **Summary** or **None**. See [Architecture](./ARCHITECTURE.md).
- Every read and write path consults it, and so do the Dashboard (DSH-01) and every Department page.
- Route authorization does not change.
- Governance actions never consult it.

## CDA-D12 — Behind a flag, with a write manifest — accepted (program default) October 20, 2026

**Flag.** `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED`, default `false`. Deployment-wide. With the flag off, behavior is exactly as today.

**Separate switches.** Each later phase may add its own switch, and each needs its own production approval:
- one-administrator enforcement
- vendor accounts
- data archiving

**Write manifest.**
- Every exported server action and write API route is listed with its class:
  - Department (with its owner resolver)
  - Governance
  - Shared facility
  - Personal
  - Auth/system
  - Legacy (CDA-D17)
- A hermetic test fails when a write is unlisted or a Department write skips the resolver.
- This becomes a platform building rule in the [doc 13](../product/13_DEPARTMENT_PRODUCT.md) release gate and Dashboard contract rule R10.

## CDA-D13 — Schema changes are expected, forward-only — accepted (program default) October 20, 2026

The model needs new persisted facts:
- the single Facility Administrator and pending transfers
- vendor head assignment and acceptance
- which operator period each Department record belongs to
- archives
- for assets (CDA-D18): the maintainer linked to the vendor Organization, who pays on each work order, and which maintainer owns each repair company

Rules for those changes:
- Each is a new forward-only migration in the phase that needs it, approved explicitly.
- Applied migrations are never edited. No `prisma migrate reset`.
- No change to release status, sellability, entitlements or billing. The Facility Administrator still pays for every Department. EVS stays DEVELOPMENT.
- No new Plant features.
- No parallel Records, requirement or evidence model. Records gain an operator-period stamp; they are not duplicated.

## CDA-D14 — Out of scope — accepted (program default) October 20, 2026

- **Harbor support sessions.** They follow the audited support mode.
- **Billing and licensing changes.**
- **Resident data.** The app stores no resident or diet-order records today. If that changes, data leaving with a vendor needs a privacy review first.
- **Retiring legacy surfaces.** A separate decision record: the [Legacy Retirement program](../legacy-retirement/README.md) (CDA-D17).

## CDA-D15 — Superseded statements and amendment schedule — accepted October 20, 2026

Amended at the final phase (CDA-07), when enforcement is enabled. Until then, current behavior stands.

| Document | Statement | Amendment |
|---|---|---|
| [Domain model](../product/03_PRODUCT_DOMAIN_MODEL.md) | "`DepartmentOperatorRelationship` is governance metadata only. It does not move work, logs, teams, employees, assets, schedules, or other operational records to the operating Organization." | **Reversed.** The operator controls a vendor-run Department and owns its period's data (CDA-D06, CDA-D10). |
| Domain model | "Operating a Department does not grant users from that Organization access to the Facility." | Vendor accounts get access to the Departments they run (CDA-D07) |
| [Constitution](../product/01_PRODUCT_CONSTITUTION.md) | "Department operating Organization as date-effective governance metadata (does not grant Facility access)" | Department operator decides control and data ownership |
| [Doc 13](../product/13_DEPARTMENT_PRODUCT.md) | Ownership row: "Does not grant Facility access." | Add the control model, Department-only visibility and write manifest |
| Partner access ([domain model](../product/03_PRODUCT_DOMAIN_MODEL.md), [Language Guide](../product/08_PRODUCT_LANGUAGE_GUIDE.md)) | Partners read, submit and correct Records only; cannot build or configure | Vendor accounts run vendor-run Departments |
| [Language Guide](../product/08_PRODUCT_LANGUAGE_GUIDE.md) | "Facility operated / Contracted" as the derived operating model; no terms for the rest of the model | Rename to **Self-operated / Vendor-run**, still derived and never persisted. Add **Facility Administrator** (one per facility), **Department head / GM** and **Operator period**. |
| [Persona Model](../product/04_PERSONA_MODEL.md) | Facility Administrator as an operator of every Department | Governance and visibility |
| Domain model, [Plant reconciliation](../plant/FACILITY_PLANT_OPERATIONS_RECONCILIATION_2026-10-05.md) | `FacilityOrganization` is asset maintenance responsibility, separate from the operating Organization; one facility vendor list | A vendor maintainer links to the vendor's Organization; each maintainer owns its repair companies; work orders record who pays (CDA-D18) |
| UI copy on the operator page and the governance section | "It does not grant facility access." | Explains vendor control |

## CDA-D16 — Each Department sees only its own — accepted (user) October 20, 2026

**User wording:** "the EVS should only see things relating to evs department. there are some platform functions that both EVS and Plant operate (assets) but otherwise each department should see their own employees, the rooms and locations assigned to that department, their own schedules, etc."

**Recorded as:**
- People in a Department see only that Department:
  - its employees
  - the rooms and locations assigned to it (room-to-Department responsibility, set by the Facility Administrator)
  - its schedules, Operating Rhythm, Work, Records and setup
- **Shared platform functions stay shared, only where the user named them.** Assets are shared between the Department that uses them and Plant, not with every Department (CDA-D18). The only other shared function is reporting to Plant: anyone may pick any place in the building (CDA-Q08).
- Cross-Department work stays visible to both sides (CDA-D09).
- It applies to every role, including GMs and Managers, in self-operated and vendor-run Departments alike.
- It is enforced on every page, not only the Dashboard. That answers [DSH-Q03](../dashboard/DECISIONS.md#dsh-q03--is-gm-sees-only-their-own-department-dashboard-only-or-app-wide--answered-user-october-20-2026).
- The Facility Administrator's access is CDA-D04, unchanged.

## CDA-D17 — Nothing legacy at the first real customer — accepted (user) October 20, 2026

**User wording:** "no one should be on legacy logs. Currently we have no real customers using vssyl. any account is just a test account by me. When we are ready to actually take a real customer, no one should be using anything legacy."

**Recorded as:**
- There are no customer facilities today. Every account is a test account.
- Before the first real customer, every legacy surface is retired:
  - legacy `/logs` Records and the `OperationalTemplate` compatibility engine
  - Today's Work and Business Workspace, already scheduled by the Dashboard program
  - every other surface the [Legacy Surface Register](../product/LEGACY_SURFACE_REGISTER.md) classes as legacy, compatibility or deprecated
- Retiring them is its own decision record, not part of this program: the [Legacy Retirement program](../legacy-retirement/README.md) (`LEG-`). Its first-customer gate is LEG-07.

**What it means here:**
- CDA builds no ownership rules for legacy-only data. The write manifest marks legacy writes as class Legacy.
- The Records engine switch is not a Department rule (CDA-Q06). It goes away with legacy Records.
- Rollout steps for existing data apply to test data only: several Facility Administrators, internal vendor accounts, period backfill.
- CDA-07 production enablement requires the legacy retirement (LEG-07), unless the product owner makes an explicit exception.

## CDA-D18 — Assets are facility property, shared with Plant — accepted (user) October 20, 2026

**User wording:** "Assets are shared with plant opps not with every department. Dietary and plant opps share. evs and plant opps share. Dietary and EVS do not share assets. The facility as a whole has all the assets. Additionally assets can assign who maintains it. It might be metz, it might be terrace view plant ops. additionally both might work with a 3rd party for repairs. the first part is mostly to assign who is responsible, and paying the repair bill."

**Who sees which assets.**
- The facility owns every asset.
- The Facility Administrator and Plant see every asset.
- Every other Department sees only the assets it uses. Food & Nutrition and EVS never see each other's.

**Three parties on every asset.** All three fields exist today ([audit §10](./CURRENT_STATE_AUDIT_2026-10-20.md#10-assets-today)):

| Party | Meaning | Field today |
|---|---|---|
| User | The Department that uses the asset day to day | `Asset.departmentId` |
| Maintainer | Responsible for upkeep and **pays the repair bill**: the facility (Terrace View Plant Ops) or the vendor (Metz) | `Asset.responsibleOrganizationId` → `FacilityOrganization` |
| Repair company | Third party the maintainer calls for repairs | `Asset.vendorId` → `Vendor` |

**Decisions in the asset round:**
- **The using Department's head sets the maintainer.** At Terrace View, the Metz GM sets it for Food & Nutrition's assets and the EVS head for EVS's. Guard: CDA-Q09.
- **When a vendor-maintained asset breaks**, the vendor's team runs the work order and pays. Plant can see it.
- **When a facility-maintained asset breaks**, Plant runs the work order and the facility pays, as today.
- **Each maintainer keeps its own list of repair companies.** Metz's list is private to Metz. Plant's list is the facility's.
- **When a vendor's contract ends:**
  - the asset record and its repair history stay with the facility
  - the repair costs the vendor paid go with the vendor

**Program defaults that follow:**
- On vendor-run work orders, costs and the repair company's name are visible only to the vendor's team. The facility keeps what was done and when.
- The Facility Administrator and Plant see the asset and its work-order history, without the vendor's costs.
- Who edits an asset's identity (name, model, serial, location) is unchanged: the using Department's managers, within role.

**What changes from today.**
- `FacilityOrganization` is a free-text facility list. It is not linked to the Organization that runs the Department, so "Metz" as maintainer is not tied to Metz Culinary as operator. It gains that link.
- `Vendor` is one facility-wide list. Each repair company gains an owning maintainer.
- `Repair` records an outside cost (`externalCost`) but not who pays. Each work order records its payer: the asset's maintainer when the work order is created.
- Work orders for vendor-maintained assets are run by the vendor-run Department instead of Plant.

These are Plant changes. They need explicit scope in the phase that carries them (AGENTS.md), plus forward-only migrations (CDA-D13).

## CDA-D19 — How transfer and recovery work — accepted (user) October 21, 2026

Answered before the CDA-02 build. This refines CDA-D02.

**The product owner's answers:**

| Question | Answer |
|---|---|
| Who can receive the role? | Someone who already has an active account at this facility. New people are added in People first. |
| What role does the outgoing Facility Administrator keep? | They choose when they send the invitation: General Manager, Manager (default) or Supervisor. They keep any Department head role. |
| When can the parent organization step in? | Only when the role is empty, or its holder's account, facility access or employment has ended. Otherwise the holder transfers it, or Vssyl support helps. |
| How does a recovery appointment take effect? | Through the same invitation: the appointee must accept. |
| May the rollout report read the local database? | Yes, read-only. |

**Rules that follow (program default):**
- An invitation lasts 7 days. Each facility has at most one open invitation.
- When the organization appoints someone, any open transfer from the departed holder is cancelled.
- The organization admin appoints by email, not by picking from a list. They have no facility access, so they don't see the facility's people. They do see the current holder's name and email.
- Accepting a recovery ends the departed holder's role and signs out their sessions.
- People never assigns the Facility Administrator role. The New Employee and Employee Profile forms don't offer it, and onboarding, imports, account links and rehire refuse it. The holder's profile shows the role as locked, with a link to the transfer page.
- If a person's Employee record still says Facility Administrator but they no longer hold the role, People lets a manager pick their new role.

---

## Confirmation items

### CDA-Q01 — A survey during a vendor contract — answered (user) October 20, 2026

**Situation.** A surveyor asks the ECMC administrator for this month's kitchen temperature logs while Metz runs Food & Nutrition.

**Answer.** The Facility Administrator can open the vendor-run Department's current compliance Records read-only: temperature logs, sanitation checks, meal-service times. Not setup, not people. It is the same scope as the access kept after a contract ends (CDA-D10).

### CDA-Q02 — How hourly vendor staff sign in — answered (user) October 20, 2026

**Answer.** As today: PIN workforce records at the facility, created by the vendor's head or the managers the head allows. They belong to the vendor's operator period, so they go with the vendor (CDA-D10). Vendor accounts are for the head and other leaders.

### CDA-Q03 — Existing internal accounts of vendor staff — answered (user) October 20, 2026

**Answer.** They move to vendor accounts. Data since the current operator relationship started is stamped to the vendor's period. Only test accounts exist today (CDA-D17), so no customer migration is needed.

### CDA-Q04 — Can people from other Departments view a self-operated Department? — answered (user) October 20, 2026

**Answer.** No. Each Department sees only its own, except shared functions such as Assets (CDA-D16).

### CDA-Q05 — A person in both a vendor-run and a facility Department — answered (user) October 20, 2026

**Answer.** Two separate workforce records, one with the vendor and one with the facility, because the data has different owners.

### CDA-Q06 — Records engine switch — answered (user) October 20, 2026

**Answer.** Moot. No Department will run on legacy Records when the first real customer starts (CDA-D17). Until legacy is retired, `scheduleRecordEngineAction` stays as it is today (Facility Administrator only).

### CDA-Q07 — Exact high-level view of a vendor-run Department — answered (user) October 20, 2026

**Answer.** For each area the Department has:
- Records on time or overdue
- coverage gaps
- open requests to Plant
- Operating Rhythm on track or late
- Department setup complete or not

Counts and status only. No names, no links.

### CDA-Q08 — Which functions are shared across Departments? — answered (user) October 20, 2026

**Answer (Assets).** Shared between the using Department and Plant only. The Facility Administrator sees all of them (CDA-D18).

**Answer (requests to Plant).**
- Anyone may pick any place in the building when reporting a problem to Plant. Example: a Metz dietary aide reports a broken light in a hallway or an EVS closet.
- Picking a place shows them nothing else about it.
- Everything else is Department-only.

### CDA-Q09 — A head names someone else as an asset's maintainer — answered (user) October 20, 2026

**Situation.** The Metz GM sets Terrace View Plant Ops as the dish machine's maintainer. That moves the repair bill to ECMC.

**Answer.** The product owner agreed with the default:
- Naming a maintainer other than your own organization needs that party to accept. For the facility, the Plant head accepts. For a vendor, its head accepts.
- Until they accept, the current maintainer stays.
- The Facility Administrator sees every maintainer change.

---

## Revision history

**October 20, morning.** The first version modeled only contracted Departments. Replaced the same day by the product owner's access model:

| Morning version | Afternoon version |
|---|---|
| The Facility Administrator assigns the head of a contracted Department | The vendor's company admin assigns it (CDA-D06) |
| The Facility Administrator sees all data of a contracted Department, read-only | High-level Dashboard summaries (CDA-D08), plus compliance Records read-only (CDA-Q01) |
| The Facility Administrator does daily work in facility-operated Departments | Views only, unless they are the head (CDA-D04) |
| Guard stopping the Facility Administrator naming themselves head of a contracted Department | Self-operated: allowed. Vendor-run: not allowed. |
| Partner sessions out of scope | Vendor accounts run vendor-run Departments (CDA-D07) |
| No schema change | Schema changes expected, forward-only (CDA-D13) |
| Data stays with the facility | Data belongs to the operator who produced it (CDA-D10) |
| Any number of Facility Administrators | Exactly one, with transfer (CDA-D02) |

**October 20, last round.** The confirmation items were answered:

| Earlier default | Answer |
|---|---|
| People from other Departments can view a self-operated Department | Each Department sees only its own (CDA-D16) |
| During a contract the Facility Administrator sees summaries only | They can also open compliance Records read-only (CDA-Q01) |
| The Records engine switch moves to the head | Moot: nothing legacy at the first real customer (CDA-D17) |
| Support migrates existing customer facilities | No customers yet; test data only (CDA-D17) |

**October 20, asset round.**

| Earlier default | Answer |
|---|---|
| Assets visible to the owning Department and Plant | The Facility Administrator and Plant see every asset. Each other Department sees only its own. (CDA-D18) |
| Asset maintainer not covered | Set by the using Department's head. The maintainer runs and pays for repairs and keeps its own repair companies. (CDA-D18) |
| Vendor data leaves on contract end | Except assets and their repair history, which stay with the facility; the vendor's costs leave (CDA-D18) |

**October 20, later.** The last two defaults were answered:
- CDA-Q09: naming another party as an asset's maintainer needs that party's acceptance.
- CDA-Q08: anyone may pick any place in the building when reporting to Plant, and seeing it gives them nothing else.

**October 21, CDA-02 round.** Five questions were answered before the build (CDA-D19):
- successors must already have an account at the facility
- the outgoing Facility Administrator picks the role they keep
- the organization steps in only when the role is empty or its holder has left
- recovery uses the same invitation and acceptance
- the rollout report may read the local database

**October 21, CDA-03 exit gate.** CDA-D05's "head required when the Department is added" now means the needs-a-head list. It does not mean asking for a head at checkout.

Still true from the morning version:
- Only a Department's members change it, within their role.
- Cross-Department work belongs to the receiving Department.
- The facility keeps governance and account security.
- "Contracted" or "vendor-run" is derived from the operator relationship on the facility service date.
- One resolver, behind a flag, with a write manifest.
