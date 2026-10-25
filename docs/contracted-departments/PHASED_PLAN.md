# Contracted Department Authority — phased plan

Phases `CDA-00` through `CDA-09`. Each phase needs explicit authorization in the [phase tracker](./PHASE_TRACKER.md) before it starts. Stop at every phase boundary.

Guardrails for every phase:
- Schema changes only where a phase says so: new forward-only migrations, each approved explicitly. Applied migrations are never edited. No `prisma migrate reset`.
- No change to release status, sellability, entitlements or billing.
- No new Plant features. No parallel Records model.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing code.
- Preserve unrelated uncommitted work.

## Order with the Dashboard program

| This program | Dashboard | Why |
|---|---|---|
| CDA-01 Foundation | with or before DSH-01 | The Dashboard's access per Department comes from `resolveDepartmentAccessMap` |
| CDA-03 view for the Facility Administrator | before DSH-02 | Facility Administrator drill-downs into self-operated Departments need `VIEW` |
| CDA-Q07 summary list (answered) | before DSH-02 | Defines the high-level cards for vendor-run Departments |
| CDA-04 Department-only visibility | answers DSH-Q03 app-wide | Pages stop showing other Departments' data |
| CDA-05 vendor operation | brings partner-Dashboard convergence (DSH-05) forward | Vendor heads sign in with vendor accounts |
| CDA-07 enable | before DSH-02 production | The Dashboard and every page must agree |

## Order with Legacy Retirement

| This program | Legacy Retirement | Why |
|---|---|---|
| CDA-08 Partner GM build | after LEG-04 | The GM's people, schedule, and call-offs use the forward coverage path. |
| CDA-09 Console company setup | during or after LEG-04 | Creating the company does not depend on call-offs. |
| CDA-09, then CDA-08 | before a vendor-run first customer, and before production CDA-07 | The company exists before its GM sets a Department up. A facility that runs its own Departments can wait. Terrace View cannot. LEG-07 is accepted. Production enablement still waits on these two phases. |

---

## CDA-00 — Decision record (docs only)

**Deliverables.** This record, plus pointers in `AGENTS.md`, the root `README.md`, `docs/product/README.md` and `memory-bank/README.md`, and the Dashboard cross-links.

**Exit gate.**
- The product owner accepts the record.
- CDA-Q01 to Q09 are answered.
- CDA-01 authorized.

---

## CDA-01 — Foundation (no visible change)

**Deliverables.**
1. `src/lib/department-authority/`: the decision function, resolver, batched map, `requireDepartmentManage` and the shared reason text.
2. The shared head predicate, `resolveLedDepartmentIds`, shared with DSH-01.
3. Owner resolvers.
4. Flag `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED`, default `false`.
5. Write manifest in report mode.

**Tests.** Hermetic matrix, owner resolvers, operator-date database tests, manifest report.

**Exit gate.** No visible change. The full suite passes unchanged.

**Schema.** None.

---

## CDA-02 — One Facility Administrator

**Deliverables.**
1. Single active Facility Administrator per facility, enforced in the service.
2. Transfer by invitation and acceptance.
3. Parent-organization recovery.
4. Rollout report of facilities with several Facility Administrators. Each is resolved before enforcement. Today they are test facilities only (CDA-D17).
5. Admin UI for transfer, and for recovery by the organization admin.

**Schema.** One forward-only migration: the transfer invitation, and a constraint for one active Facility Administrator. It ships only after the rollout report is clean.

**Exit gate.**
- Transfer and recovery proven in database and browser tests.
- No facility has more than one Facility Administrator.

---

## CDA-03 — View everywhere, heads in place

**Deliverables.**
1. **Facility Administrator view fix (not flagged).** The six modules that deny or limit viewing ([audit §3](./CURRENT_STATE_AUDIT_2026-10-20.md#3-facility-administrator-posture-by-module)) give the Facility Administrator `VIEW` in every self-operated Department. Read-only, no new writes.
2. **Head required on add (CDA-D05).** Adding a self-operated Department requires a head.
3. **Missing-head to-do list** for existing Departments.
4. **Head-allowed managers.** The head marks which managers may add staff and set roles.

**Schema.** Possibly one forward-only migration, for the head-allowed permission on Department membership.

**Exit gate.**
- The Facility Administrator can open Work, Log Book, preventive maintenance and Plant request pages in every self-operated Department.
- New Departments cannot be added without a head.

---

## CDA-04 — Head-run enforcement: changes and visibility (internal accounts)

The largest phase. It may be split into a changes part and a visibility part when it is authorized.

**Deliverables (flagged).**
1. **Changes.**
   - The resolver in every domain authority module and every role-only action.
   - The Facility Administrator is `VIEW` unless they are the head.
   - People outside a Department cannot change it.
2. **Visibility (CDA-D16).**
   - People outside a Department see nothing of it.
   - Lists and pages filter to the person's Departments: employees, rooms and locations by responsibility, schedules, Work, Records and setup.
   - Assets: the using Department, Plant and the Facility Administrator see each asset; no one else does (CDA-D18).
   - Requests to Plant: anyone may pick any place in the building, and picking it reveals nothing else about it (CDA-Q08).
3. Read-only rendering for `VIEW`: one shared notice ("You can view this Department. Changes are made by its head and team."), with forms hidden.
4. Two workforce records for a person in both a vendor-run and a facility Department (CDA-Q05).
5. Legacy writes classed Legacy in the manifest (CDA-D17).
6. The manifest test switches to failing mode.

**Tests.**
- An action test for every Department manifest row.
- Two-Department read-scoping tests for every list and page.
- The browser tests for self-operated EVS and Plant.

**Exit gate.**
- With the flag on, the only people who can change a Department are its head and members within role.
- With the flag on, people see only their own Departments, plus shared functions and cross-Department work.
- With the flag off, nothing changes.

**Schema.** None.

---

## CDA-05 — Vendor operation

**Deliverables.**
1. Vendor accounts with Department authority for vendor-run Departments.
2. The vendor's company admin assigns the head; acceptance is recorded.
3. The Facility Administrator keeps `MANAGE` until acceptance, then drops to `SUMMARY`. Department pages refuse `SUMMARY`, except compliance Records read-only (CDA-Q01).
4. Vendor heads get the Department-leader Dashboard (partner convergence).
5. Internal accounts of vendor staff move to vendor accounts (CDA-Q03). Test accounts only today.
6. Hourly vendor staff use PIN workforce records created by the head or allowed managers (CDA-Q02).
7. **Vendor-maintained assets** ([Architecture §7.1](./ARCHITECTURE.md#71-assets-cda-d18)). This needs explicit Plant scope approval.
   - Maintainers linked to Organizations.
   - The maintainer's team runs and pays for its work orders.
   - Each maintainer keeps its own repair companies.
   - Vendor costs are private to the vendor.
   - Maintainer changes need the other party's acceptance (CDA-Q09).
8. **Vendor-owned forms** ([LEG-D19](../legacy-retirement/DECISIONS.md#leg-d19--departments-and-vendors-can-make-their-own-forms--accepted-user-october-20-2026)).
   - Forms built in a vendor-run Department belong to the vendor and work at every facility it runs.
   - They leave with the vendor at contract end.
   - Facility-owned forms ship earlier, in LEG-02.

**Schema.** Forward-only migrations for:
- head assignment and acceptance
- vendor-account Department authority
- the maintainer link, the payer on each work order, and repair-company ownership
- organization ownership of Catalog forms, if LEG-02 did not already add it

**Exit gate.**
- In the Terrace View fixture the full vendor-run flow passes: assign the head, accept, Facility Administrator summary, vendor management.
- A Metz-maintained dish machine breaks. Metz runs and pays for the work order with its own repair company. Plant sees it without the cost.

---

## CDA-06 — Operator-period data

**Starts with its own design record**, approved before any code. It covers:
- the models that carry the period stamp
- backfill
- read scoping
- the archive
- the facility's compliance Records access
- retention
- performance

**Deliverables.**
1. Period stamp on Department records and configuration, with backfill. Test data only today (CDA-D17).
2. Read scoping by period.
3. Contract-end handling:
   - retire and hide configuration; the next operator starts from starters
   - facility-titled assets and work-order history stay with the facility; partner-titled assets leave, and the facility keeps a closed note (CDA-D22); the vendor's costs and repair companies go with the vendor (CDA-D18)
4. Vendor archive, opened by the vendor's company admin only.
5. Facility compliance Records, read-only, for the current vendor period and ended ones (CDA-Q01).

**Schema.** Forward-only migrations named in the design record.

**Exit gate.**
- A vendor-to-vendor and a vendor-to-facility handover pass in the fixture.
- No operator sees another operator's period.
- The facility opens compliance Records during and after a contract.

---

## CDA-07 — Enable

**Deliverables.**
1. Staging enablement and product-owner acceptance with the Terrace View pattern.
2. Production enablement with approval. It requires the legacy retirement ([LEG-07](../legacy-retirement/PHASED_PLAN.md#leg-07--first-customer-gate), CDA-D17), unless the product owner makes an explicit exception.
3. Amend the docs in [CDA-D15](./DECISIONS.md#cda-d15--superseded-statements-and-amendment-schedule--accepted-october-20-2026).
4. Add the write manifest to the [doc 13](../product/13_DEPARTMENT_PRODUCT.md) release gate.

Staging enablement is accepted. LEG-07, CDA-08, and CDA-09 are accepted. Production enablement is still off.

---

## CDA-09 — Partner company setup in Vssyl Console

Written October 25, 2026, from [CDA-D21](./DECISIONS.md#cda-d21--vssyl-console-creates-the-partner-company--accepted-user-october-24-2026). Accepted by the product owner October 25, 2026.

A company such as Metz exists once. Console is where that company is born. A facility later attaches the company that already exists. Saving a partnership stops being how a company is born.

### What exists today

- Console **New customer** (`/console/customers/new`) creates a facility, its parent company, and the Facility Administrator. It does not create a company administrator or members. A Harbor owner is required.
- Console **Organization Claims** (`/console/organization-claims`) lets Harbor staff approve the first Organization Administrator after someone requests it. Approval does not grant facility access.
- The Facility Administrator can type a company name under Partners (`createOrganizationAndPartnerAction`) or while assigning a Department operator (`createOrganizationAndAssignOperatorAction`). A matching name reuses the company. A new name creates the company and the partnership or operator row. Neither path creates an administrator, a member, or a login.

### Deliverables

1. **Create the company in Console.** A Harbor owner opens a new Console page and creates a partner company. The company does not have to own a facility. The action creates the organization only. It does not create a facility, a Facility Administrator, a partnership, a Department operator, or a login. Organization type stays `MANAGEMENT_COMPANY`. A normalized-name match is refused, and the page shows the existing company.
2. **Invite the first people.** From that company, the Harbor owner invites the first Organization Administrator and the first members. Accepting an invitation creates the organization account and membership. It does not create a facility user, a partner facility session, a Department membership, or a Department head.
3. **Keep the claim queue.** Organization Claims stays for a company that already exists and has no administrator. Creating a company with its first invitation is the path for a new company. The queue is not removed and is not how a new company is born.
4. **The facility attaches a company that already exists.** The Facility Administrator selects an existing company and saves the partnership. The same selection records that company as a Department's operator. Both screens search. They do not offer a name that creates a company.
5. **Stop birth-by-partnership.** `createOrganizationAndPartnerAction` and `createOrganizationAndAssignOperatorAction` no longer call `createOrganizationForDepartmentOperator`. A name with no match tells the Facility Administrator that Console must create the company first.

### Who does what after that

The company administrator invites later members and names the Department head, as in CDA-D06. The head accepts. That acceptance is what lets the head open the facility Department. CDA-08 is the setup the head does after acceptance.

### Access rules

- Harbor owner only, the same gate as Provision Facility (`requireHarborOwner`).
- An invitation email is the existing organization invitation. It opens the organization workspace only.
- Attaching a company does not make that company's people facility users.
- Naming the Department head stays with the company administrator. Console does not name the head.

### Schema

None. Organization, membership, and invitation records already exist.

### Tests

- Console create refuses a duplicate normalized name and creates no facility.
- The first invitation acceptance yields an Organization Administrator with no facility session and no Department head row.
- A second invitation yields a member who is not an administrator.
- Partnership save and operator assignment attach an existing company and create no organization.
- An unknown name returns the Console message and writes nothing.
- Organization Claims still approves a first administrator for a company that has none, and that approval still grants no facility access.

### Exit gate

- Console creates Metz Culinary, invites its first administrator, and invites a member.
- Those people can open the Metz workspace and cannot open Terrace View until the facility attaches Metz and the head accepts.
- Terrace View attaches the existing Metz company to Food & Nutrition. It does not create a second Metz.

### Out of scope

- The Partner GM's Department setup. That is CDA-08.
- Production enforcement. The code default stays off. The production project stays unset.
- Constitution and language-guide amendments. Those wait until production enforcement is on (CDA-D15).
- Billing, sellability, release status, and EVS.

---

## CDA-08 — Partner GM build

Written October 25, 2026, from [CDA-D20](./DECISIONS.md#cda-d20--a-partner-gm-sets-up-their-department-inside-the-facility--accepted-user-october-24-2026) and [CDA-D22](./DECISIONS.md#cda-d22--an-operating-partner-can-add-assets-and-set-title--accepted-user-october-25-2026). Accepted by the product owner October 25, 2026.

CDA-05 left the accepted head with a PIN staff record, a Department page, and a one-field organization form. A self-operated manager still uses the Department's setup screens inside the facility app. This phase gives the accepted head that same Department setup on the partner workspace, limited to the Departments their company operates.

The partner workspace today is `/partner`: Dashboard, Logs, Audit / Reports, Locations, and Assets. People and the one-field form are linked from the Department page for the accepted head. Partner capabilities are `logs.read`, `logs.submit`, `logs.correct`, `review.read`, `locations.read`, and `assets.read`. There is no schedule, operating rhythm, work plan, menu, or maintainer setup.

### The facility keeps

- Floors, rooms, and which Department is responsible for a room.
- Which company operates the Department.
- The rooms the equipment sits in. The partner adds assets there and does not add rooms. Plant and the Facility Administrator see every asset while it is on site (CDA-D18, CDA-D22).

### The Partner GM decides

- Their people, teams, and schedule. Hourly staff stay on a PIN. Leaders stay on vendor accounts. The company administrator creates those accounts. The head does not.
- Operating rhythm, work plans, and menus for their Department, using the facility's rooms.
- Forms the company owns, through the same Catalog, usable at every facility that company runs (LEG-D19).
- The assets their Department uses. They add an asset and set its title, its responsible maintainer, and its repair vendor (CDA-D22). Title is the facility or their own company. Naming another organization as maintainer still needs that party's acceptance (CDA-Q09). Until acceptance, the current maintainer stays. They keep their own repair companies.

### Who may do this

Setup requires the authority flag, Department access `MANAGE`, and one of these:

- The accepted head.
- Another Partner Manager on that same Department. The accepted head is who allows that manager. Partner Operator and Partner Viewer do not gain setup. Their Log, review, location, and asset access stays as it is.

"Managers they allow" is the existing Partner Manager role on that Department. It is not a new permission table.

### Where it lives

New setup screens are partner routes under `/partner`. They call the same Department services the facility already uses for schedule, cycles, work plans, menus, Catalog forms, and maintainer choice. They do not mount the facility shell, Facility Builder, or Administration.

Locations stay a read-only view of the facility's rooms and responsibilities. The head cannot add a room or move a room to another Department.

When the authority flag is off, these routes redirect to `/partner`.

### Deliverables, in order

1. **People, teams, and schedule.** The head adds and edits PIN staff for their Department, arranges teams, and sets the schedule, including a call-off and a move for that Department's day. The schedule uses the forward coverage path from LEG-04.
2. **Operating rhythm.** The head drafts and publishes Cycles, Phases, and Key Points for their Department. A Cycle binds to the whole Department, an explicit facility location, or a Location Function. It does not invent rooms.
3. **Work plans.** The head writes the Department's work plans. A step may link a Catalog Record.
4. **Menus.** Where the Department product has menus, the head writes menus for their Department against the facility's locations and the published Cycle.
5. **Catalog forms.** Replace the one-field draft with the Catalog builder the facility head already uses. A form saved here has `ownerKind: ORGANIZATION` and that partner organization. Publishing installs it for the Departments that organization operates. It does not become a facility-owned form.
6. **Assets.** The head adds an asset for their Department in a facility room. On that asset they set title, responsible maintainer, and repair vendor. Title is the facility or their own company. Equipment they buy and bring in can be titled to the facility. Proprietary equipment is titled to the partner. A change of maintainer to another organization waits for that organization's acceptance. The head keeps the repair companies their organization uses. The repair vendor comes from that maintainer's list. They do not add rooms, and they do not title another company's equipment to themselves.
7. **When the contract ends.** Facility-titled equipment stays, with its repair history. The vendor's private costs leave with the vendor. Partner-titled equipment leaves the active registry with the partner. The facility keeps a closed note of the name, the Department, and when it was on site. That note is not an asset Plant can assign work to.
8. **Navigation.** The accepted head, and a Partner Manager on that Department, see the setup sections, including adding an asset. Partner Operator and Partner Viewer do not. The shell does not link to Facility Builder, Administration, or another Department.

### Access rules that do not change

- The Facility Administrator still sees the vendor Department as a summary, plus compliance Records read-only.
- Plant does not see the vendor Department's people, schedule, rhythm, work plans, menus, or forms.
- The vendor Department does not see Plant's pages or another Department's pages.
- Anyone may still pick any place in the building when reporting a problem to Plant, and picking it shows nothing else about that place (CDA-Q08).
- New writes are classified in the write manifest. A Department write does not check only a role.

### Schema

One new forward-only migration. Existing assets default to facility title.

- Title on `Asset`: facility, or the operating partner's organization.
- A facility-kept closed note written when a partner-titled asset leaves. It records the name, the Department, and the dates it was on site. It is not an active asset.

Applied migrations are not edited. No other schema is expected. A further missing field is a separate migration, approved inside this phase before it is written.

### Tests

- A Partner Operator and a Partner Viewer cannot open or post the setup actions.
- A Partner Manager who is not on that Department cannot post them.
- The accepted head can. A Partner Manager on that Department can.
- Published setup is visible to that Department and absent from Plant and from the Facility Administrator's Department pages.
- The Facility Administrator still opens the summary and a compliance Record.
- A maintainer change to Plant stays pending until the Plant head accepts.
- The accepted head adds one facility-titled asset and one partner-titled asset in a Terrace View room. Plant and the Facility Administrator see both, including title. Environmental Services does not.
- Ending the Metz contract leaves the facility-titled asset in the registry and removes the partner-titled asset. The facility still has the closed note, with the dates it was on site. The note cannot take a work order.
- Direct visits to Facility Builder, Administration, and Plant routes do not render for the partner session.
- The authority flag off redirects the new routes to `/partner`.

### Exit gate

- The Metz GM sets up Food & Nutrition inside Terrace View's rooms: people, a schedule, an operating rhythm, a work plan, a menu, a Metz-owned form, and both a facility-titled asset and a Metz-titled asset.
- That setup is invisible to Plant and to the Facility Administrator's Department pages. The administrator still sees the summary and compliance Records.
- The Metz GM cannot open Facility Builder, Administration, or Plant.

### Out of scope

- Creating the company, its administrator, or its first members. That is CDA-09.
- Production enforcement, the Dashboard production flag, and the CDA-D15 document amendments.
- Billing, sellability, release status, and EVS.
- A second Catalog, or a new Records model.

---

## Risks

| Risk | Mitigation |
|---|---|
| A write path is missed | The manifest test fails on any unclassified or unguarded Department export |
| Plant can no longer handle a vendor Department's requests | Ownership follows the responsible Department; browser test |
| A facility is left without a Facility Administrator | Parent-organization recovery (CDA-02) |
| A Department is left without a head | Head required on add; missing-head to-do list; for vendor-run, the Facility Administrator keeps control until acceptance |
| The facility cannot show Records to a surveyor | Facility compliance Records, read-only, during and after a contract (CDA-D10, CDA-Q01) |
| Department-only visibility hides something a person needs | Asset sharing with Plant (CDA-D18); shared functions list (CDA-Q08); cross-Department work rule (CDA-D09); browser tests per Department |
| A vendor head moves a repair bill to the facility | Maintainer changes need the other party's acceptance (CDA-Q09) |
| Period scoping leaks data between operators | Shared scoping helper; per-model tests; the CDA-06 design record |
| Vendor accounts gain more than their Department | Resolver rule R8; partner-scope tests |
| A Partner GM changes the building or another Department | CDA-08 keeps rooms, Facility Builder, and Administration with the facility. The partner adds assets only for their Department. |
| Partner-titled equipment is treated as the facility's after the contract | CDA-D22 removes it from the active registry and leaves a closed note |
| A company is created once per facility and never gets an administrator | CDA-09 creates the company in Console, with its first administrator and members |
| Scale of change | Separate phases and switches; each production step approved |
