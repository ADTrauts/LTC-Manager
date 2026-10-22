# Contracted Department Authority — phased plan

Phases `CDA-00` through `CDA-07`. Each phase needs explicit authorization in the [phase tracker](./PHASE_TRACKER.md) before it starts. Stop at every phase boundary.

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
   - assets and work-order history stay with the facility; the vendor's costs and repair companies go with the vendor (CDA-D18)
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
| Scale of change | Separate phases and switches; each production step approved |
