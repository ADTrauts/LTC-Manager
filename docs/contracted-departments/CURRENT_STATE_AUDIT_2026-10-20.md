# Contracted Department Authority — current-state audit

October 20, 2026. Read-only review of the working tree. Counts are approximate and come from a review of every server action (`"use server"`), API route and authority module that writes Department data. Verify against live code before implementing.

## Summary

1. **"Contracted" is known but enforces nothing.** `DepartmentOperatorRelationship` records which Organization operates each Department on a date. `deriveOperatingModel` turns that into `CONTRACTED` or `FACILITY_OPERATED`. No authorization code reads it.
2. **There is no single write gate.** Routes are authorized by facility role only (`authorizeRoute`, `src/proxy.ts`). Real write control lives in about 14 Department-keyed authority modules plus many actions that only check a minimum role.
3. **The Facility Administrator is treated three different ways.**
   - Some modules let the Facility Administrator change any Department: Operating Rhythm, Location Functions, Teams, Coverage, Menus, Employees, Schedule.
   - Newer modules deny the Facility Administrator everything, including viewing, unless the Department is their own primary Department: Work, Records (Log Book), preventive maintenance, Plant requests, Job Flow.
   - A few older paths only check the minimum role, so any role from Staff up can use them in any Department: legacy `/logs` submit, `/repairs` and `/issues`.
4. **So today the Facility Administrator can change things they should not, and cannot see things they should.** At Terrace View, the ECMC Facility Administrator can rewrite Food & Nutrition's Operating Rhythm and employees but cannot open its Log Book.
5. **Cross-Department work already has a clear owner.** Maintenance requests, work orders and asset issues store both the requesting and the responsible Department. Manage authority follows the responsible Department, usually Plant. A Plant work order about a Food & Nutrition room belongs to Plant.
6. **Partner access already has the pattern we need.** Partner writes check a capability and an allowed-Department list at the service write entry (`src/lib/canonical-logs/partner-log-write.ts`). Internal users have no equivalent.

## 1. How "contracted" is derived today

| Piece | Where | Behavior |
|---|---|---|
| Operator relationship | `DepartmentOperatorRelationship` (`prisma/schema.prisma`) | Date-effective (`@db.Date`, inclusive). New installs create a facility-operated row on the install date. |
| Operating model | `deriveOperatingModel` (`src/lib/department-operators/types.ts`) | `CONTRACTED` when the operating Organization differs from the Facility's parent Organization. |
| Loaders | `loadDepartmentOperatorOnDate`, `loadCurrentDepartmentOperator`, `loadCurrentOperatorsForFacilityDepartments` (`src/lib/department-operators/service.ts`) | Single and batched, on the facility service date. |
| Editing | `/admin/departments/[departmentId]/manage/operator`, `operator-actions.ts` | Facility Administrator only. |
| Product docs | [Domain model](../product/03_PRODUCT_DOMAIN_MODEL.md), [doc 13](../product/13_DEPARTMENT_PRODUCT.md), [Constitution](../product/01_PRODUCT_CONSTITUTION.md) | "Governance metadata only." "Does not grant Facility access." |

## 2. Authorization plumbing

| Layer | Where | Department-aware? |
|---|---|---|
| Session | `getSession` / `FacilitySession` (`src/lib/auth.ts`): `role`, `facilityId`, `authKind`, `authMethod`, `uid`, optional `primaryDepartmentId` | Carries a primary Department only |
| Role ladder | `hasAtLeastRole` / `requireAtLeastRole` (`src/lib/access.ts`). Facility Administrator > GM > Manager > Supervisor > Lead > Staff. | No |
| Routes | `authorizeRoute` (`src/lib/route-registry/authorize.ts`), `src/proxy.ts` | No. Department appears only as a URL parameter or nav lens. |
| Commercial access | `isCustomerDepartmentAccessAllowed` (`src/lib/department-products/load-facility-catalog.ts`) | Yes, but it decides availability (read and write alike), not write authority |
| Domain authority | `resolve*Authority` → `{ canView…, canManage… }` → `require*Manage` in about 14 modules | Yes, keyed by `departmentId` |
| Partner | `canPartner(role, capability)` plus `allowedDepartmentIds` (`src/lib/partner-user-access/`) | Yes |

**Scale.**
- 72 `"use server"` files and 43 API route files.
- Writes are concentrated in `src/lib` (about 160 files with write operations). Only about 23 action files write Prisma directly.
- The authority modules and service entry points are the realistic choke points.

## 3. Facility Administrator posture by module

| Module | Authority | Facility Administrator today | Problem for the new model |
|---|---|---|---|
| Operating Rhythm (cycles) | `resolveCycleAuthority` (`src/lib/operational-cycles/cycle-authority.ts`) | Manage and publish in any Department, by design | Can change Departments they do not head |
| Location Functions, room types, profiles | `assertProfileWriteAccess` (`src/lib/department-administration/profile-access.ts`) | Manager+ check only | Can change Departments they do not head |
| Teams and team cycles | `resolveTeamAuthority` (`src/lib/department-teams/authority.ts`) | Manager+ | Can change Departments they do not head |
| Coverage expectations | `resolveCoverageAuthority` (`src/lib/scheduling/coverage-expectations/authority.ts`) | Manager+ | Can change Departments they do not head |
| Job roles | `decideJobRoleAuthority` (`src/lib/department-job-roles/authority.ts`) | Manager+ | Can change Departments they do not head |
| Menus | `requireAtLeastRole(SUPERVISOR)` plus product check (`src/app/(protected)/menus/actions.ts`) | Supervisor+ | Can change Departments they do not head |
| Operational Assignments | `resolveAssignmentAuthority` | Manage only in Food & Nutrition-type Departments | Can change Food & Nutrition-type Departments they do not head |
| Work Plans and Work | `resolveWorkAuthority` (`src/lib/department-work/authority.ts`) | **Denied, including view**, unless primary Department matches | Cannot view self-operated Departments |
| Records (canonical, Log Book) | `resolveEvidenceAuthority` (`src/lib/operational-evidence/evidence-authority.ts`) | **Denied, including view**, unless primary Department matches | Cannot view self-operated Departments |
| Preventive maintenance | `resolvePmPlanAuthority` (`src/lib/preventive-maintenance/authority.ts`) | **Denied, including view**, unless primary Department matches | Cannot view self-operated Departments |
| Plant requests and triage | `src/lib/operational-requests/authority.ts` | **Denied, including view**, unless primary Department matches | Cannot view self-operated Departments |
| Job Flow | `src/lib/dietary-job-flow/job-flow-authority.ts` | **Denied, including view**, unless primary Department matches | Cannot view self-operated Departments |
| Assets | `src/lib/asset-operations/authority.ts` | Runtime view only unless primary Department matches | View is partial |
| Servery meal milestones | `src/lib/servery/milestone-authority.ts` | Allowed by role list | Can record in Departments they do not belong to |

## 4. Write surfaces by area

Each area lists who can write today and how the owning Department is determined. "Class" is the proposed treatment under this program:
- **Department:** changed only by the Department's head and members, within role
- **Governance:** the Facility Administrator keeps it in every Department
- **Shared facility:** not owned by one Department

### Governance (about 14 actions) — class: Governance

| Surface | Where | Auth today |
|---|---|---|
| Install a Department | `createDepartmentAction` (`admin/departments/actions.ts`) | Facility Administrator |
| Licensing and billing | `admin/billing/actions.ts` | Facility Administrator |
| Operating Organization | `operator-actions.ts` (assign, create and assign, cancel future, search) | Facility Administrator |
| Department head | `setDepartmentHeadAction` | `canManageDepartmentHeadSettings`: Facility Administrator, recorded head, or the Department's GM |
| Visibility in the employee app | `setDepartmentShowInEmployeeAppAction` | Facility Administrator |
| Partner Department scope | `admin/organization/partners/actions.ts` | Facility Administrator |

**Head assignment edge.** The head picker offers "Other employees (saving may add dept membership)".
- On a self-operated Department that is the intended behavior: the Facility Administrator may name anyone as head, including themselves.
- On a vendor-run Department the vendor's company admin assigns the head ([CDA-D06](./DECISIONS.md#cda-d06--vendor-run-departments--accepted-user-october-20-2026)), so the Facility Administrator's picker must close.

### Department configuration (about 90 actions) — class: Department

| Area | Count | Where | Department from |
|---|---:|---|---|
| Location Functions, profiles, room types | 24 | `admin/departments/[departmentId]/actions.ts` | Form or profile |
| Operating Rhythm | 14 | `cycle-actions.ts` | Form |
| Teams, team cycles, coverage | 13 | `team-actions.ts`, `team-cycle-actions.ts`, `coverage-actions.ts` | Form or team |
| Work Plans and Plant starter | 9 | `staffing/work-plans/actions.ts`, `plant-starter-actions.ts` | Explicit |
| Menus | 6 | `menus/actions.ts` | Menu |
| Records attachments, type defaults, evidence templates | about 15 | `build/logs/actions.ts`, `location-room-actions.ts`, `staffing/templates/actions.ts` | Explicit or attachment |
| Asset identity and Asset Builder | about 9 | `assets/actions.ts`, `assets/import-actions.ts` | Form or asset |
| PM plans (Plant) | about 6 | `build/departments/[id]/preventive-maintenance` | Path |
| Inspections scoped to a Department | 2 | `admin/inspections/actions.ts` | Optional form value |

### Records engine switch — class: to decide (CDA-Q06)

`scheduleRecordEngineAction` (`record-engine-actions.ts`) is Facility Administrator only today. It changes how a Department's Records work, so it is both a rollout switch and Department configuration.

### Shared facility (about 22 actions) — class: Shared facility

| Surface | Where | Note |
|---|---|---|
| Buildings, floors, neighborhoods, units, spaces | `admin/facility/builder/actions.ts` | Manager+ |
| Room-to-Department responsibility | same file (`upsert/delete…Responsibility…`, `set…DepartmentsAction`) | Decides which Departments serve which rooms. The Facility keeps it. |
| Catalog install | `installCatalogAction` | Facility-wide availability, no Department |
| Vendors, facility organizations | `assets/actions.ts` | Facility-wide |
| Legacy log templates | `logs/actions.ts` | Facility-owned; `departmentId` optional and usually unset |

### People and HR (about 30 actions) — class: Department

| Surface | Where | Auth today | Department from |
|---|---|---|---|
| Create, edit profile, role, organization, status, separation, default assignment, discipline | `employees/actions.ts` (12 actions) | Manager+ (PIN set/clear GM+), facility check only | Employee memberships |
| CSV update, bulk setup, workbook | `employees/import`, `employees/bulk-setup` | Manager+ or Facility Administrator with password | Import rows |
| Job roles | `employees/job-roles/actions.ts` | Manager+ | Role's Department |
| Revoke sessions | `revokeEmployeeSessionsAction` | GM+ facility-wide; Manager must share a Department | Memberships |

**People facts.**
- An Employee can belong to several Departments: one optional primary (`Employee.primaryDepartmentId`) plus `EmployeeDepartment` rows.
- `resolveEmployeesDeptScope` only filters the Employees page; it does not authorize writes.
- The Facility Administrator can edit every employee in the facility today.

### Schedule and coverage (about 25 actions) — class: Department

| Surface | Where | Auth today | Department from |
|---|---|---|---|
| Canonical shifts | `staffing/schedule/actions.ts` (4) | Supervisor+ | Form (from the active Department) |
| Legacy schedule entries | `staffing/actions.ts` | Supervisor+ | None stored (legacy) |
| Call-offs and moves | `createOverrideAction` | Supervisor+ | Employee and unit |
| Operational Assignments, templates, zones | `staffing/assignments/*` (15) | `resolveAssignmentAuthority`; templates Manager+ | Explicit |

### Daily operations (about 85 actions) — class: Department, owned by the responsible Department

| Surface | Where | Auth today | Owning Department |
|---|---|---|---|
| Legacy Records submit | `submitLogAction` (`logs/actions.ts`) | **Staff+ only** | Template's Department, usually unset |
| Canonical Records submit | `staffing/logs/actions.ts`, `unit/[unitId]/evidence-actions.ts`, offline sync | `resolveEvidenceAuthority` | Attachment's Department |
| Records correct | `correctEvidenceRecord` (lib) | Supervisor+; Facility Administrator needs primary match | Record's Department |
| Work completion | `work-runtime-actions.ts`, `operations/work-actions.ts` | `resolveWorkAuthority` | Occurrence |
| Operating Rhythm delays and Key Point completion | `staffing/cycles/actions.ts` | Supervisor+ capability, **no Department check** | Cycle |
| Servery milestones | `unit/[unitId]` actions, offline sync | `decideServeryMilestoneAuthority` | Food & Nutrition |
| Plant requests: report | `operational-requests/actions.ts` | Requester authority on the requesting Department | Requesting Department reports; Plant owns the work |
| Plant requests: triage, accept, resolve; work orders | same, `repairs/[id]` | Plant authority | Responsible (Plant) |
| Repairs and issues (`Repair` model) | `repairs/actions.ts`, `issues/actions.ts`, `createUnitIssueAction` | **Staff+ only** | `responsibleDepartmentId` |
| Asset issues and status | `asset-issues`, `assets/actions.ts` | Asset authority | Issue or asset |
| PM skip | `skipPmOccurrenceAction` | PM authority | Plant |
| Inspections and follow-up tasks | unit inspection actions | Staff+ | Weak Department binding |

**Kiosk and PIN sessions** (`authKind: "employee"`, `QUICK_PIN`) use the same actions. They can submit Records, report requests and complete Work. They are blocked from manage, triage, correct and Build.

## 5. What this means

- The rule cannot live in routes. It has to live where writes are authorized:
  - the Department-keyed authority modules
  - plus a Department check added to every action that today checks only a role
- The Facility Administrator needs a **view** fix in six modules (five deny viewing, Assets limits it), or "views every self-operated Department" is false.
- The rule must use the responsible Department for cross-Department work, or Plant could no longer handle Food & Nutrition's requests.
- Head assignment on vendor-run Departments needs a guard, because the vendor assigns the head there.
- New actions keep appearing. Without a rule that forces each one to state its class, the gate will erode.
- Several parts of the model do not exist yet:
  - one Facility Administrator per facility, with transfer (§7)
  - head acceptance
  - vendor accounts with Department authority (§8)
  - data tied to the operator period (§9)

  Each needs schema, so later phases carry forward-only migrations.

## 6. Department heads today

- `Department.headEmployeeId` is optional. Departments can exist with no head.
- The only app writer is `setDepartmentHeadAction`. It is allowed for the Facility Administrator, the current head, or the Department's GM (`canManageDepartmentHeadSettings`).
- Adding a Department (`createDepartmentAction`) does not ask for a head.
- There is no "managers the head allows" concept. Employee actions (`src/app/(protected)/employees/actions.ts`) check a Manager+ or GM role, not the employee's Department ([§4](#4-write-surfaces-by-area)).

## 7. Facility Administrator role today

- Facility roles are per user and facility, as dated periods (`UserFacilityAccess` → `UserFacilityRolePeriod`).
- **Any number of people can hold `FACILITY_ADMINISTRATOR`** at the same facility. No constraint, owner field or "last administrator" rule exists.
- There is no transfer flow. The role is granted and ended like any other.
- The parent organization's admin (`OrganizationMembershipRole.ORG_ADMIN`) has no facility powers. Organization membership grants zero facility access ([domain model](../product/03_PRODUCT_DOMAIN_MODEL.md)).

## 8. Vendor and partner accounts today

- **Internal accounts** (Path A) are facility-native. Grants across parent organizations are rejected (`src/lib/facility-access/assert-user-facility-access.ts`). The Metz GM at Terrace View signs in with an internal Terrace View account.
- **Partner accounts** (Path B):
  - Built from `FacilityPartnerOrganization`, `FacilityPartnerDepartmentScope` and `PartnerUserFacilityAccess`.
  - Roles are Partner Viewer, Operator and Manager.
  - Capabilities are only `logs.read`, `logs.submit`, `logs.correct`, `review.read`, `locations.read` and `assets.read`.
  - Partners cannot build, configure, schedule or manage people.
- The operator relationship and partner access are independent. Neither creates the other.

## 9. Data ownership today

- Every Department record is facility data, keyed by `facilityId` and usually `departmentId`. Nothing records which operator was in charge when it was created.
- The domain model says explicitly that the operator relationship "does not move work, logs, teams, employees, assets, schedules, or other operational records to the operating Organization."
- When an operator changes today, all history and configuration stay visible to the facility and to whoever runs the Department next.
- The app stores no resident or diet-order records.

## 10. Assets today

- **One facility registry.** `Asset` requires a room (`unitId`). Optionally it carries a space, a using Department (`departmentId`), a maintainer (`responsibleOrganizationId`) and a preferred repair company (`vendorId`).
- **The three parties are already separated** in `src/lib/asset-operations/responsibility.ts`: "Department user", "Responsible maintainer" and "Preferred repair vendor".
- **Maintainers** are `FacilityOrganization` rows: free-text names per facility. The facility itself and the legacy `managementCompanyName` are created automatically. They are not linked to platform Organizations, so "Metz" here is not tied to Metz Culinary as the operator in `DepartmentOperatorRelationship`.
- **Repair companies** are `Vendor` rows: one list per facility, shared by everyone who can view vendor details.
- **Work orders** (`Repair`):
  - record a requesting and a responsible Department
  - may name a repair company
  - record an outside cost (`externalCost`) but not who pays it
- **Authority** (`src/lib/asset-operations/authority.ts`):
  - decided per Department by role
  - the Facility Administrator can view asset runtime, but cannot manage outside their primary Department
- **Listing.**
  - `/assets` filters by the sidebar's active Department: its assets plus unassigned ones (`assetResponsibleDepartmentWhere`, `src/lib/asset-operations/ownership.ts`).
  - With no active Department it shows every asset.
  - The sidebar limits non-administrators to Departments they belong to, but that is a display filter, not an authorization rule.
  - Plant has no special "see every asset" rule.
