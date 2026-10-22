# Contracted Department Authority — architecture

How the [decisions](./DECISIONS.md) are enforced. Evidence is in the [current-state audit](./CURRENT_STATE_AUDIT_2026-10-20.md). Before writing code in any phase, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md rule).

## 1. Shape

```text
person (internal session or vendor account) + Department + service date
   │
   ▼
resolveDepartmentAccess ──► { mode: MANAGE | VIEW | SUMMARY | NONE, canReadComplianceRecords, operator, period, isMember, isHead, reason }
   │
   ├─► domain authority modules: writes only in MANAGE
   ├─► role-only actions: owning Department first, then requireDepartmentManage
   ├─► Department pages: VIEW renders read-only; SUMMARY opens compliance Records read-only only; NONE does not open
   ├─► lists (employees, rooms, schedules, …): only Departments at VIEW or above (CDA-D16)
   ├─► Dashboard (DSH-01): MANAGE / VIEW cards; SUMMARY = high-level only
   └─► data queries: scoped to the operator period the person may see (CDA-06)
```

Governance actions (CDA-D02) never call the resolver. They check "is the facility's Facility Administrator".

## 2. Access modes

| Mode | Meaning | Who gets it |
|---|---|---|
| `MANAGE` | May change the Department, within role | The head, and members acting within their role. The Facility Administrator when they are the head of a self-operated Department, or before a vendor's head accepts. |
| `VIEW` | Sees everything the role would show, changes nothing | The Facility Administrator on a self-operated Department they do not head |
| `SUMMARY` | High-level Dashboard status and counts, plus compliance Records read-only. No other Department page opens. | The Facility Administrator on a vendor-run Department after the vendor's head accepts |
| `NONE` | Nothing, except shared functions and cross-Department work the person is part of | Everyone outside the Department other than the Facility Administrator, in self-operated and vendor-run Departments alike (CDA-D16) |

## 3. The resolver (`src/lib/department-authority/`)

As built in CDA-01. The operating model reuses the existing `DepartmentOperatingModel` names: `FACILITY_OPERATED` is self-operated and `CONTRACTED` is vendor-run.

```ts
type DepartmentAccessMode = "MANAGE" | "VIEW" | "SUMMARY" | "NONE";

type DepartmentAccess = {
  departmentId: string;
  mode: DepartmentAccessMode;
  canReadComplianceRecords: boolean;    // MANAGE, VIEW, and the Facility Administrator in SUMMARY (CDA-Q01)
  operatingModel: "FACILITY_OPERATED" | "CONTRACTED";
  operatorName: string | null;          // "Metz Culinary" when vendor-run
  operatorPeriodId: string | null;      // the DepartmentOperatorRelationship in force; null when none (self-operated)
  vendorHeadAccepted: boolean;          // vendor-run only
  isMember: boolean;
  isHead: boolean;                      // head link, or GM role + primary Department
  reason: string | null;                // why the mode is below MANAGE
};

function decideDepartmentAccess(input: {
  enforcementEnabled: boolean;
  sessionKind: "internal" | "vendor" | "harbor";
  operatingModel: "FACILITY_OPERATED" | "CONTRACTED";
  vendorHeadAccepted: boolean;
  isFacilityAdministrator: boolean;
  isMember: boolean;
  isHead: boolean;
  vendorOperatesDepartment: boolean;    // R8, vendor sessions only
}): DepartmentAccessMode;

function resolveDepartmentAccess(db, session, input: { facilityId: string; departmentId: string; now?: Date }): Promise<DepartmentAccess | null>; // null: not in the facility
function resolveDepartmentAccessMap(db, session, input: { facilityId: string; departmentIds: string[]; now?: Date }): Promise<Map<string, DepartmentAccess>>; // omits other facilities' Departments
function requireDepartmentManage(access: DepartmentAccess): void; // throws DepartmentAccessError with the reason
```

### 3.1 Decision rules

| # | Rule |
|---|---|
| R1 | Flag off: `MANAGE`. Today's module rules alone decide. |
| R2 | The head, or a member: `MANAGE`, within their role. |
| R3 | Self-operated, Facility Administrator, not head: `VIEW`. |
| R4 | Vendor-run, Facility Administrator, before the vendor's head accepts: `MANAGE`. |
| R5 | Vendor-run, Facility Administrator, after acceptance: `SUMMARY`, with `canReadComplianceRecords`. |
| R6 | Any other non-member: `NONE` (CDA-D16). |
| R7 | `NONE` does not cover assets (CDA-D18), other shared functions (CDA-Q08) or cross-Department work (CDA-D09). Those follow their own rules (§7.1): the using Department, Plant and the Facility Administrator for assets; requesting and receiving Departments for requests. |
| R8 | Vendor accounts reach only Departments their vendor runs at this facility, then R2 applies. |
| R9 | Harbor support sessions are out of scope and follow support mode. |

`MANAGE` is a ceiling, not a grant. Each module still applies its role, PIN and feature rules.

### 3.2 Inputs

| Input | Source | Until the later phase (CDA-01) |
|---|---|---|
| Operator and period | `loadCurrentOperatorsForFacilityDepartments`. Vendor-run when the operating Organization differs from the Facility's parent Organization. | — |
| Vendor head accepted | `DepartmentVendorHeadAssignment` accepted for the operator period in force | Read while enforcement is on. Flag off stays `false` |
| Facility Administrator | New single-administrator record, CDA-02 | The session's Facility role |
| Membership | Workforce record for the session: primary plus additional Departments. For vendor accounts, their vendor-period workforce record. | Vendor accounts: the Departments in the partner's authorized scope |
| Head | Shared `resolveLedDepartmentIds` predicate (DSH-01): `Department.headEmployeeId`, or GM role plus primary Department. A vendor session is head when that user has accepted the current assignment. | — |

The session's workforce facts are memoized per request on the shared Prisma client. Operators and Departments are batched per call.

## 4. Owning Department for each write

Owner resolvers live in `src/lib/department-authority/owners.ts`. Each role-only action looks up the owning Department before calling `requireDepartmentManage`.

| Record | Owning Department |
|---|---|
| Workforce record: person-level changes, membership, job role, team | That Department. CDA-Q05: one record per operator. |
| Shift, Operational Assignment, coverage expectation | `departmentId` |
| Legacy schedule entry, call-off override | The employee's Department |
| Operational Cycle, Key Point, delay | Cycle's `departmentId` |
| Location Function profile, room type, binding | Profile's `departmentId` |
| Team, team cycle, Work Plan, Work occurrence | `departmentId` |
| Menu and applicability | `Menu.departmentId` |
| `LogAttachment`, type default, suppression, evidence template, `OperationalEvidenceRecord` | `departmentId` |
| Legacy `LogTemplate`, `LogSubmission` | Class Legacy (CDA-D17). Template `departmentId`; with none, shared facility (§10). |
| Request, repair or issue | **Responsible** Department. Reporting is judged on the reporter's Department. |
| Work order on an asset | The maintainer's Department: Plant when the facility maintains it, the vendor-run Department when the vendor does (CDA-D18) |
| Asset identity, asset issue | Using Department (`departmentId`). Plant service-status changes are Plant's work. |
| Asset maintainer | Using Department's head, with the other party's acceptance (CDA-Q09) |
| PM plan and occurrence | Plant |
| Inspection definition | `departmentId` when set, otherwise shared facility |
| Servery milestone | Food & Nutrition |

## 5. Enforcement points

- **Domain authority modules** (about 14; [audit §3](./CURRENT_STATE_AUDIT_2026-10-20.md#3-facility-administrator-posture-by-module)):
  - below `MANAGE`, every write field is `false`
  - in `VIEW`, view fields stay
  - in `SUMMARY` and `NONE`, view fields are `false` too
  - one shared helper keeps reasons identical
- **Facility Administrator branches.** Six modules deny or limit viewing with a "Facility Administrator status alone does not grant authority" branch: Work, Records, preventive maintenance, Plant requests, Job Flow and Assets. The resolver replaces that branch, so the Facility Administrator gets `VIEW` on self-operated Departments, and `MANAGE` if they are the head.
  - As built in CDA-03, not flagged: `resolveFacilityAdministratorView` answers that branch with view fields only and the shared view reason. It covers self-operated Departments only.
  - As built in the CDA-04 changes slice, flagged: `applyDepartmentChangeCeiling` runs after each domain authority decision. With the flag off the decision is unchanged. With it on, a mode below `MANAGE` clears write fields, and `SUMMARY` or `NONE` clears view fields too. A Facility Administrator who is the head skips the old denial and keeps the role decision.
  - As built in the CDA-04 visibility slice, flagged: `loadDepartmentVisibility` is the list filter. It keeps Departments whose mode is not `NONE`. Flag off returns no filter. People, rooms, locations, menus, Logs, and setup lists use it. A direct Department address outside that set returns not found. Assets stay on CDA-D18 (using Department, Plant, Facility Administrator, Harbor). Picking a place for a Plant report is unchanged (CDA-Q08).
  - As built in the CDA-04 view-only slice, flagged: `departmentViewOnlyNotice` is the shared sentence. Work Plans, Department Builder, Schedule, Assignments, People, Menus, Assets, and Preventive Maintenance hide their authoring forms when it is set.
  - As built in the CDA-04 workforce slice, flagged: `assertOneOperatorWorkforce` refuses a membership that spans a vendor-run Department and a facility Department. One Employee stays with one operator. The second record is another Employee. A linked account still fits only one Employee per facility.
- **Role-only actions** ([audit §4](./CURRENT_STATE_AUDIT_2026-10-20.md#4-write-surfaces-by-area)): add an owner lookup and `requireDepartmentManage` to employees, schedule, repairs and issues, Build forms, menus, assets and inspections. Legacy writes are class Legacy and retire (CDA-D17).
  - As built in CDA-04: the old profile and Experience editor actions are class Legacy. Location Function binding and publishing stay Department. The write manifest is in enforce mode, so an unlisted write fails its test. Facility Administrator seat actions are class Governance.
- **Read scoping (CDA-D16).**
  - Lists and pages that span Departments filter to Departments where the person's mode is `VIEW` or above: employees (`resolveEmployeesDeptScope` becomes enforcing), rooms and locations by room-to-Department responsibility, schedules, Work, Records and setup.
  - Direct links to another Department's records return not found.
  - Shared functions follow R7.
  - As built in the CDA-04 visibility slice, flagged, in `src/lib/department-authority/visibility.ts`. `SUMMARY` is kept, because a summary is still something the person may see; `NONE` is left out. Schedules and Work that already follow the selected Department stay on that selection, and the switcher now refuses `NONE`.
- **Head required (CDA-D05).** Adding a self-operated Department requires a head in the same step. Existing Departments without a head appear on a Facility Administrator to-do list. They have no head until one is named, so only the Facility Administrator's governance actions apply.
  - As built in CDA-03: the to-do list is on the Departments page (`listDepartmentsNeedingHead`). It shows "no head yet" and "the head has left". Naming a head who isn't a member adds them to the Department. A new Department still installs through Marketplace checkout; one with no head shows on this list right away ([CDA-D05](./DECISIONS.md#cda-d05--self-operated-departments--accepted-user-october-20-2026-head-rule-refined-user-october-21-2026)).
- **Head-allowed managers (CDA-D03).** The head marks which managers may add staff and set roles.
  - As built in CDA-03: table `DepartmentStaffManager` (Department, employee, who granted it). The primary Department isn't a membership row, so the mark has its own table. A mark counts only while the person is an active Manager member of the Department, and it is set on the Department's settings page. Nothing enforces it until CDA-04.
- **Offline and kiosk.** Sync replays commands through the same modules.

## 6. One Facility Administrator (CDA-02)

| Piece | Design |
|---|---|
| Record | One active Facility Administrator per facility, enforced in the service and by a database constraint |
| Role source | `UserFacilityRolePeriod` stays the role history. The service refuses a second active `FACILITY_ADMINISTRATOR` period. |
| Transfer | Invitation to the successor. On acceptance, one transaction ends the old period and starts the new one. The old Facility Administrator keeps any head role. |
| Recovery | The parent Organization's admin (`ORG_ADMIN` of `Facility.organizationId`) can appoint a Facility Administrator when the seat is empty or the holder is gone |
| Rollout | A report lists facilities with more than one active Facility Administrator. Today these are test facilities only (CDA-D17). Each is resolved before the rule is switched on. |

As built in CDA-02 (rules in [CDA-D19](./DECISIONS.md#cda-d19--how-transfer-and-recovery-work--accepted-user-october-21-2026)):

| Piece | Where |
|---|---|
| Constraint | Migration `20261021090000_cda02_one_facility_administrator`. A partial unique index can't span `UserFacilityAccess`, so a trigger on `UserFacilityRolePeriod` (insert, or a change to role, end or access) locks the `Facility` row and refuses a second open Facility Administrator period with `unique_violation`. The migration refuses to apply while any facility already has two. |
| Service guard | `src/lib/facility-access/administrator-seat.ts`. Every path that opens a Facility role period locks the `Facility` row first, then checks the seat: `changeInternalFacilityRole`, `ensureCurrentInternalFacilityRole` and `ensureUserFacilityAccessGrant`. Role repair from the home role opens nothing when the seat is taken. |
| Invitation | `FacilityAdministratorInvitation`: kind `TRANSFER` or `RECOVERY`, status `PENDING`, `ACCEPTED`, `DECLINED`, `CANCELLED` or `EXPIRED`. At most one `PENDING` per facility (partial unique index). |
| Service | `src/lib/facility-administrator/`: seat reader (`EMPTY`, `HELD`, or `GONE` with a reason), invite, appoint, cancel, decline, accept, and the rollout report. Acceptance moves the role in one transaction and updates linked Employee records with an HR audit row. |
| Screens | Holder: `/admin/organization/facility-administrator`. Invitee: `/account/facility-administrator`, linked from My Account. Organization admin: `/organization/[organizationId]/facilities`. |
| People | The role is never offered or accepted in People, onboarding, imports, account links or rehire. |
| Rollout report | `npx tsx scripts/facility-administrator-report.ts`, read-only. Run it before the migration on any database with real data. |

## 7. Vendor operation (CDA-05)

| Piece | Design |
|---|---|
| Vendor account | Built on partner access (`PartnerUserFacilityAccess`, partner roles). For a vendor-run Department, the account gets Department authority within its role, not only Records capabilities. |
| Head assignment | The vendor's `ORG_ADMIN` assigns the head from their vendor account. It is recorded with an accepted time. The resolver reads `vendorHeadAccepted`. |
| Staff | The head and head-allowed managers add vendor staff. Hourly staff use PIN workforce records (CDA-Q02). |
| Facility Administrator | `MANAGE` until acceptance, then `SUMMARY` |
| Vendor Dashboard | Vendor heads see the same Department-leader Dashboard. This pulls the partner-Dashboard convergence from DSH-05 forward to CDA-05. |
| Migration | Internal accounts of vendor staff move to vendor accounts (CDA-Q03). Only test accounts exist today, so there is no customer migration. |

As built in the CDA-05 head slice, flagged with `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED`: the vendor's organization administrator names a current member as head from `/organization/[organizationId]/departments`. The assignment stays pending until that person accepts. Acceptance is the fact `vendorHeadAccepted`. Until then the Facility Administrator keeps `MANAGE`. After acceptance they drop to `SUMMARY`: Department pages do not open, people and setup lists leave that Department out, and compliance Records stay available from the Departments list. The accepted vendor account is the head on a vendor session. Accepting also opens partner access when the facility has an administrator and the Department is operable, and the partner shell then offers People and Department. People adds a PIN-only workforce record. The same page can move internal accounts that belong only to that vendor Department onto vendor accounts. Replacing the head ends acceptance until the next person accepts. With the flag off the page is not linked and the resolver ignores any rows.

### 7.1 Assets (CDA-D18)

| Piece | Design |
|---|---|
| Visibility | Asset lists and pages show an asset to its using Department, Plant and the Facility Administrator. This replaces the sidebar filter as the rule. Unassigned assets are visible to Plant and the Facility Administrator only. |
| Maintainer link | `FacilityOrganization` gains an optional link to the platform Organization. The facility's own row links to the facility's parent Organization; Metz's row links to Metz Culinary. The resolver uses that link to find the maintainer's Department. |
| Work-order owner | Work orders on a vendor-maintained asset get the vendor-run Department as responsible Department. Plant keeps view access. |
| Payer | New field on `Repair`: who pays, copied from the asset's maintainer when the work order is created. As built in CDA-05, flagged: `payerOrganizationId`. A vendor-paid cost and repair company are hidden from everyone except that vendor's team. |
| Maintainer change | As built in CDA-05, flagged: naming another organization creates `AssetMaintainerProposal`. The current maintainer stays until the Plant head or that vendor's head accepts. Naming your own organization applies immediately. |
| Repair companies | As built in CDA-05, flagged: a repair company can name its maintainer. A vendor team sees and adds only that maintainer's companies. Plant and the Facility Administrator see the facility's companies, including companies recorded before an owner. A preferred repair company has to belong to the asset's maintainer. |
| Vendor costs | `externalCost`, its note and the repair company on vendor-paid work orders are visible to the vendor's team only |
| Contract end (CDA-06) | Assets and work-order history stay. Vendor-paid costs, the vendor's repair companies and their names on its work orders go with the vendor's period. |

As built for vendor-owned forms, flagged: `CatalogLogDefinition.ownerKind` is `VSSYL`, `FACILITY`, or `ORGANIZATION`. Existing forms stay Vssyl's. A form the vendor head adds on the Department page is owned by that organization. While enforcement is on, a facility catalog shows Vssyl's forms, that facility's forms, and an organization's forms only to people who run a Department that organization operates. Facility authoring stays in LEG-02.

## 8. Operator-period data (CDA-06)

**Principle.** Every Department record belongs to the operator period in force when it was created. A person can see a period's data only if they belong to that period's operator, plus two exceptions:
- the facility's read-only access to compliance Records, during and after a vendor's period (CDA-D10, CDA-Q01)
- cross-Department work, which stays with the receiving Department

| Piece | Design direction (confirmed in CDA-06's own design record) |
|---|---|
| Period stamp | New `operatorPeriodId` (the `DepartmentOperatorRelationship` in force) on Department-owned records and configuration. Backfilled from dates for existing rows. |
| Read scoping | Department queries filter to the periods the person may see. One shared helper, tested per model. |
| Contract end | The ending vendor's configuration (menus, Work Plans, Operating Rhythm, job roles, templates) is retired and hidden. The next operator starts from Vssyl product starters. |
| Archive | Rows stay in place, partitioned by period. Only the vendor's company admin can open the archive. |
| Facility compliance Records | Read-only access to Records (`OperationalEvidenceRecord`) for the Facility Administrator, for the current vendor period (survey) and ended ones. Opened from Records, never the Dashboard. Not configuration. Not people. |
| People | Vendor workforce records go with the vendor. The facility keeps none. |
| Retention | Not decided. Needed in CDA-06's design record, with the facility's survey look-back needs. |

Rows stay in place, so there is no parallel Records model. Records gain a stamp and a visibility rule.

## 9. Tests

| Kind | Coverage |
|---|---|
| Hermetic | Decision matrix: flag × operating model × head accepted × Facility Administrator × member × head × session kind. Every authority module per mode. Owner resolvers. Manifest completeness. Single Facility Administrator rules. |
| Database | Operator start and end on the facility service date, including the timezone boundary. Transfer atomicity. Parent-organization recovery. Vendor head acceptance. Period stamping and backfill. Archive visibility. |
| Action | For every Department manifest row: refused below `MANAGE` with the right reason |
| Read scoping | Two-Department database tests per list and page: an EVS head sees no Plant or Food & Nutrition employees, rooms, schedules or Work. EVS and Food & Nutrition never see each other's assets; Plant and the Facility Administrator see all. |
| Browser | Terrace View fixture: ECMC Facility Administrator, Metz company admin, Metz GM, EVS head, Plant head.<ul><li>**Self-operated EVS:** the Facility Administrator views but cannot change; after naming themselves head they can. The EVS head cannot open Plant's pages.</li><li>**Vendor-run Food & Nutrition:** Metz's admin assigns the GM. Before acceptance the Facility Administrator can configure. After it, they see summaries and compliance Records only; other pages do not open.</li><li>**Plant:** a work order raised by Food & Nutrition on a facility-maintained asset is managed by Plant. On a Metz-maintained dish machine, Metz's team runs and pays for it, using Metz's repair company, and Plant sees it without the cost.</li><li>**Contract end:** Metz data is archived; the Facility Administrator still opens compliance Records; the next operator starts from starters.</li></ul> |
| Regression | With the flag off, the full suite passes unchanged |

## 10. Known limits

- Legacy surfaces get no ownership rules; they are retired before the first real customer (CDA-D17). Until then:
  - legacy `/logs` templates with no Department count as shared facility
  - legacy schedule entries are judged by the employee's Department
- Refused writes are not persisted.
