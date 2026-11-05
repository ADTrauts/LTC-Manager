# Employee Builder roles, teams, and organization

**Date:** November 4, 2026
**Branch:** `architecture/department-builder-facility-reconciliation` at `0c3d5bc`
**Status:** historical trace. Phase 7B retired the duplicate models this audit named. The tables, columns, and screens below are gone. See [OPERATIONAL_ELIGIBILITY.md](./OPERATIONAL_ELIGIBILITY.md) for the surviving facts. Do not treat Department Job Role capabilities as a permission system.

There are no customers. Duplicate workforce systems should not survive because they already have tables. Genuine HR facts, staffing facts, and authorization boundaries should.

The picture in [Department Builder architecture §7](../product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md) is:

```text
Department → Team → Role → Employee
```

That picture mixes three facts that the code already keeps apart. It is a useful screen. It is not a safe database tree.

---

## Current workforce model

One `Employee` is the person on the roster. A linked `User` is optional. PIN sessions attach to the Employee. Email and password attach to the User.

What the person is allowed to do in the application is `RoleKey` (`FACILITY_ADMINISTRATOR`, `GM`, `MANAGER`, `SUPERVISOR`, `LEAD_TEAM_MEMBER`, `STAFF`). The live grant is the current `UserFacilityRolePeriod`. `Employee.roleType` is the roster copy of that ladder. The domain model calls this Role. It is not Cook, Server, or Culinary.

What the person is called in HR is `JobTitle`: a facility catalog (`facilityId` + `name`) pointed at by `Employee.jobTitleId`. Examples that belong here: Dietary Aide, Cook, Dietary Supervisor, EVS Technician, Maintenance Mechanic. One title per employee. It does not select Coverage and it does not authorize a route.

Which Departments they belong to is `Employee.primaryDepartmentId` plus `EmployeeDepartment` rows. One person can belong to Food and Nutrition and EVS without a second Employee. `EmployeeDepartment.roleType` is marked dormant. Do not read it as per-Department authority.

Which organizational group they sit in is `DepartmentTeam` plus `EmployeeTeamMembership`. A team is a named group inside one Department, with an optional lead (`managerEmployeeId`). Membership can be many teams. The write path allows one primary team per Department. A team does not own rooms, cycles, coverage, or today's placement. Phase 5A already locked that.

What function they perform on a given day is `OperationalAssignment.roleKey`, checked against `OPERATIONAL_ROLE_REGISTRY` in `src/lib/scheduling/assignment-roles/index.ts`. Coverage stores the same key on `OperationalAssignmentTemplateItem.roleKey`. The registry is code, not a customer table. Food, EVS, and Plant each have a fixed list. Cashier, Barista, Prep Cook, and Lead Server are not in that list.

There is no table that says which of those registry roles an employee is qualified to perform. The assignment form lists every active member of the Department and every registry role for that Department. Validation checks facility, department key, and time. It does not check team, job title, job role, or workstation.

`DepartmentJobRole` is a fourth idea. It is one row per employee per Department (`EmployeeDepartmentJobRole` is unique on employee + department). The starters are Team Member, Lead, Supervisor, and Manager. Each row stores a `DepartmentJobRoleTier` and a `capabilities` string array (`COMPLETE_ASSIGNED_WORK`, `MANAGE_SCHEDULE`, `CONFIGURE_DEPARTMENT`, and others). The service comment says this does not change `RoleKey`, route authorization, or Run. Nothing in Run or the policy engine reads those capability keys. Schedule screens only print `displayName`.

Two older eligibility shapes still exist and do not drive assignment:

- `EmployeeWorkStation` (`COOK`, `SERVER`, `DISHWASHER`, `RETAIL`, `DIET`, `OFFICE`, `PORTER`, `UTILITY`) and `isEmployeeEligibleForUnit` in `src/lib/scheduling-eligibility.ts`. That function has no callers.
- `JobClassification` (`COOK`, `FOOD_SERVICE_WORKER`, `DIET_CLERK`, `DIETITIAN`, `OTHER`) on the Employee. That is HR / union classification, not today's assignment.

`DefaultAssignment` stores `employeeId`, `unitId`, and `RoleKey`. It is a platform role on a unit, not an operational role. The employee card test expects the setter action to be absent from the card.

`ScheduleEntry` answers when the person works: employee, date, department, planned start and end, optional `WorkShift`. `roleType` and `unitId` on the shift are marked demoted. The schedule loaders attach the primary team name and the Department Job Role display name as labels. They do not store an operational role on the shift.

---

## Duplicate role systems

| Concept | Current model | Owner | Writers | Readers | Business purpose | Overlap | Verdict |
|---|---|---|---|---|---|---|---|
| Platform authority | `RoleKey`; live grant `UserFacilityRolePeriod`; roster copy `Employee.roleType` | Policy / access | User and employee admin, facility role periods | Every route check, CDA staff-manager eligibility | What the user may do in the app | Job-role tier names (Lead, Supervisor, Manager) use the same words | KEEP. Do not infer it from team, title, or operational role |
| HR position | `JobTitle` + `Employee.jobTitleId` | Employee Builder | Employee profile, workforce import | Directory, HR | The employment title | Registry labels such as Cook; Department Job Role display names | KEEP |
| HR / union class | `Employee.jobClassification` | HR | HR profile | HR | Contract classification | `JobTitle` and `WorkStation.COOK` | KEEP as HR. Do not use it for Coverage |
| Department membership | `primaryDepartmentId` + `EmployeeDepartment` | Employee Builder | Organization sync, import | Assignment picker, authority, teams | Which Departments this one Employee belongs to | Dormant `EmployeeDepartment.roleType` | KEEP membership. RETIRE `roleType` on the membership row |
| Team | `DepartmentTeam` | Employee Builder | Team actions | People & Coverage, schedule labels | Named group of people inside one Department | Proposed "Role" children | KEEP. Not a parent of operational roles in the database |
| Team membership | `EmployeeTeamMembership` (`isPrimary`) | Employee Builder | Organization sync | Schedule labels | Home group. Many teams, one primary per Department | Today's assignment | KEEP. A temporary assignment must not rewrite it |
| Team lead | `DepartmentTeam.managerEmployeeId` | Employee Builder | Team actions | Team views | Who leads that group | Department head; `RoleKey`; job-role tier LEAD | KEEP as team leadership only. It does not grant platform authority |
| Department head | `Department.headEmployeeId` | Department accountability | Onboarding invite, head transfer | CDA, dashboard "is department manager" | Who is accountable for the Department | Team lead; `RoleKey.MANAGER` | KEEP. Does not grant purchase authority |
| Staff-manager grant | `DepartmentStaffManager` | Department head delegation | `setDepartmentStaffManager` | CDA-D03 | Which Manager-role members may add staff and set roles | Job-role capability `MANAGE_EMPLOYEES` | KEEP. Eligibility is `RoleKey.MANAGER` plus active membership, not a job role |
| Department Job Role | `DepartmentJobRole` + `EmployeeDepartmentJobRole` | Department-local catalog | Job-role service, import | Schedule label, employee organization | One named tier package per employee per Department | `RoleKey`, team lead, operational registry, capability keys that look like permissions | RETIRE as a role identity. Capabilities are not enforced. One-per-department cannot represent Server and Dishwashing |
| Capability package | `DepartmentJobRole.capabilities` | Same service | Job-role create/update | Validation and the job-role screen | Intended future Run permissions | Policy engine | RETIRE. Real permissions stay on `RoleKey` and explicit policy. Do not turn this array on |
| Operational role | `OPERATIONAL_ROLE_REGISTRY` | Platform catalog | Code only | Coverage writes, assignment validation, assignment form | The function a person performs in a place and period | Job titles, workstations, the proposed team tree | KEEP as the single operational identity |
| Coverage need | `OperationalAssignmentTemplateItem.roleKey` | Coverage | Coverage service | Coverage match, review | How many of that role a room needs in a period | A second role catalog | KEEP. Already the same key as assignment |
| Today's placement | `OperationalAssignment.roleKey` + snapshotted `roleLabel` | Run | Assignment writes | Run, review, coverage fill | Where and as what this employee works today | Team membership, schedule | KEEP. History is the snapshot, not a live join to a renamed label |
| Shift | `ScheduleEntry` | Schedule | Schedule writes | Schedule, call-off | When the employee is expected to work | `roleType` and `unitId` leftovers | KEEP the shift. RETIRE `roleType` on new shifts. Do not store operational role here |
| Unit default | `DefaultAssignment.roleType` | Legacy staffing | Manifest still names the action | Little current UI | Platform role parked on a unit | Operational assignment | RETIRE |
| Trained station | `EmployeeWorkStation` + `scheduling-eligibility.ts` | Legacy kitchen eligibility | CSV / HR snapshot | Directory filter. Eligibility function has no callers | Which station the person was trained for | Registry roles | RETIRE the eligibility map. HR may keep a trained-station note only if a later decision says the directory filter is still required |
| PIN unit list | `EmployeeUnitAccess` | Session scope | Employee admin | PIN kiosk | Which units a PIN session may enter | Team rooms (already removed) | KEEP. It is session scope, not a role |
| Shift pattern | `WorkShift` | Schedule | Schedule configuration | Shift creation | A reusable time pattern | Operational role | KEEP. Not a role |

---

## Proposed canonical model

Keep four independent facts. Do not store them as one parent-child tree.

```text
Employee
  ├── HR title                 JobTitle                     one
  ├── Platform authority       RoleKey / role period        one live grant
  ├── Department membership    primary + EmployeeDepartment many
  ├── Team membership          EmployeeTeamMembership       many, one primary per Department
  └── Qualified operational roles   (missing)               many registry keys per Department

Team
  └── optional lead            managerEmployeeId            leadership, not a permission

Coverage need
  └── roleKey                  same registry                not a team, not a person

Today
  └── OperationalAssignment    same roleKey + roleLabel     place, period, person
```

The example org chart can still be the Employee Builder screen: under Culinary, show the people whose primary team is Culinary, and show the registry roles those people are qualified for. Cook under Culinary is a qualification held by people on that team. It is not a row that only exists because the team exists. A Server qualification does not disappear when someone moves from Resident Services to Utility for a day, because that day is an assignment, not a membership edit.

Customer-configurable role *keys* are not justified. Coverage history, assignment validation, and on-call coverage all match the key. A facility-defined key would be a second catalog. A facility-defined *label* for a platform key is a later display option, not a new identity. Cashier and Barista are the open case: either they are labels for an existing key such as `SERVER`, or the platform catalog grows those keys in code. They should not become free-text roles stored under Retail.

Qualification is the missing capability. It should be an explicit set of registry keys per Employee per Department. It should not be inferred from team membership, job title, or job-role tier. One primary qualified role is optional and only useful as a default on the assignment form. It must not block the other qualified roles.

Unfilled work is already `requiredCount` on a coverage item with too few assignments. A Team does not need an empty "Cook seat" unless the product later wants budgeted headcount. That is an HR position count, not an operational role. Do not add it in order to resemble an HRIS.

---

## Scenarios

**Several operational roles.** Not modeled. One Department Job Role per Department cannot say Server and Dishwashing. The registry can name both. The assignment form will accept either for any Department member. The product should store both as qualifications and still allow a supervisor to assign either.

**Temporary reassignment.** Today's `OperationalAssignment` does not change `EmployeeTeamMembership`. That is the right split. Resident Services remains the home team when the person works Utility today.

**Several teams.** Already allowed. `isPrimary` stays useful as the label schedule screens show (`teamMemberships[0]` after ordering primary first). A person who regularly works Culinary and Retail has two memberships. Their qualifications are still roles, not teams.

**Two Departments.** Already one Employee, two memberships, and at most one Department Job Role in each. Qualifications and teams should stay Department-scoped the same way. Do not duplicate the Employee.

**Supervisor covers a server shift.** `RoleKey.SUPERVISOR` does not block `roleKey` `SERVER`. Nothing checks the job-role tier either. That separation is correct. Organizational authority, the HR title, and operational eligibility are three facts. Covering the line is an assignment of `SERVER`, not a demotion of `RoleKey`.

**Empty role on a team.** A team with no members is just an empty group. A role with nobody qualified is a qualification gap. A role with nobody assigned today is a coverage gap. Those are different screens. Coverage already expresses the gap. A vacant HR seat is not required for release.

---

## Management ownership

| Relationship | Decision it supports | Canonical owner |
|---|---|---|
| `Department.headEmployeeId` | Who is accountable for this Department, including head transfer and "is this person the department manager" in the dashboard | Department |
| `DepartmentStaffManager` | Which other people with `RoleKey.MANAGER` may add staff and set roles, because the head allowed it | Department, delegated |
| `DepartmentTeam.managerEmployeeId` | Who leads this group of people | Team |
| `Employee.roleType` / facility role period | What screens and mutations the user may perform | Platform policy |
| `DepartmentJobRole.tier` MANAGER / SUPERVISOR / LEAD | A label and an unused capability bundle | Do not use for leadership or authority |
| `EmployeeDepartment.roleType` | Nothing. Schema says dormant | Delete when a migration is approved |

Do not merge these because each contains the word manager. A team lead is not the Department head. The Department head is not automatically `FACILITY_ADMINISTRATOR`. A job-role capability such as `CONFIGURE_DEPARTMENT` must not become a back door around `RoleKey`.

---

## Operational role identity

Coverage and Assignment should keep sharing `OPERATIONAL_ROLE_REGISTRY`.

The keys in the registry are the operational roles: `COOK`, `HOT_PREP`, `COLD_PREP`, `NOURISHMENT`, `BAKER`, `PUREE`, `RECEIVING`, `PORTER`, `DISHWASHING`, `SERVER`, `CALL_DOWN_RUNNER`, `DIETARY_SUPERVISOR_ROUNDING`, and the EVS and Plant lists named in the phase brief. `defaultUnitTypes` on those definitions is a hint, not a saved targeting rule.

Do not add a Department-owned role table for Employee Builder. Employee Builder should reference the same keys. Display the registry label. Snapshot `roleLabel` on the assignment, which the write already stores, so Review can show the words used that day if a label later changes. Retiring a key should block new coverage items and new assignments. It should not rewrite historical `roleKey` values.

Team affiliation in Coverage is a caption, not a column. A coverage row is Department + space + role key + period + count. The screen may say "usually Resident Services" by looking at who is qualified and which team is primary. It must not store a team id on the template item, and a team must not decide which room the need applies to.

Assignment creation today:

- Eligible people are active employees whose primary Department is that Department or who have an `EmployeeDepartment` row. Team is not a filter.
- Eligible roles are `getRolesForDepartment`. Any of them can be saved.
- Working outside the home team is already possible.
- A supervisor can cover a frontline role.
- Changing teams does not rewrite assignments.
- Review keeps `roleKey` and `roleLabel` on the assignment row.

If qualification is added later, the form should prefer qualified employees and still allow an explicit override for the supervisor-covers-the-line case. The override is an assignment fact, not a new role.

---

## Schedule

A shift stores when. An assignment stores where and as which operational role. They must not copy each other.

Overlap to remove, not to preserve: `ScheduleEntry.roleType`, `ScheduleEntry.unitId`, and `DefaultAssignment`. The schedule UI's team name and job-role name are labels joined at read time. After Department Job Role is retired, that subtitle should be the HR title and the primary team, not a third role.

Call-off stays on the shift. It already changes whether the overlapping assignment counts toward coverage. That link stays. It is not a role system.

---

## Authorization

```text
Mary
  Team:                 Resident Services          organization
  Qualified role:       SERVER                     operations
  Today's assignment:   SERVER at 1A, Lunch        operations
  RoleKey:              STAFF                      platform
```

Qualifying Mary for `SERVER` must not change `RoleKey`. Naming her team lead must not change `RoleKey`. Making her `RoleKey.SUPERVISOR` must not by itself add or remove `SERVER`.

`DepartmentStaffManager` is the one deliberate bridge: the head can mark someone who is already `RoleKey.MANAGER`. It does not promote a team lead into a manager.

`DepartmentJobRole` capabilities such as `MANAGE_EMPLOYEES` and `CONFIGURE_DEPARTMENT` are the dangerous overlap. They read like permissions and are not enforced. Turning them on later would create a second policy engine. Retire them instead.

---

## Employee Builder and Department Builder

| Surface | Owns | Does not own |
|---|---|---|
| Employee Builder (`/employees`) | Person, HR title, Department membership, teams, team lead, and (once approved) operational-role qualification | Coverage counts, today's assignment, platform policy design |
| Department Builder → People & Coverage | Read of that workforce, plus canonical coverage templates | A second team editor that becomes the source of truth. Links may deep-link to Employee Builder |
| Run | `OperationalAssignment`, coverage state for today | Team membership edits |
| Review | The assignment snapshot, the coverage template that was effective, the shift | A reconstructed Department Job Role |

Department Builder already shows teams. Employee Builder is named as the later home. Until the job-role consolidation is approved, People & Coverage should keep composing teams and coverage and should not grow a second role editor.

`OPERATIONAL_ROLE_REGISTRY` stays platform code. Employee Builder does not become a catalog editor.

---

## What would break

Removing `DepartmentTeam` breaks People & Coverage and the schedule subtitle. It is a real organizational fact.

Removing `OPERATIONAL_ROLE_REGISTRY` breaks coverage saves and assignment validation. It is the operational fact.

Removing `JobTitle` breaks HR display. It is a real employment fact.

Removing `RoleKey` breaks every route. It is the security boundary.

Removing `DepartmentJobRole` removes a label on the schedule and an editor that does not authorize anything. Imports that send `jobRoleId` would need a new column or to stop sending it. No Run behavior changes, because Run never read the capabilities.

Removing `EmployeeWorkStation` removes a directory filter and a dead eligibility function. Assignment behavior does not change.

Removing `EmployeeDepartment.roleType` changes nothing if every reader already uses `Employee.roleType`. Confirm readers before the column drop. The schema comment already says it is dormant.

---

## Documentation contradictions

- [Domain model](../product/03_PRODUCT_DOMAIN_MODEL.md) defines Role only as `RoleKey`. It does not name the operational registry, teams, or job titles. After approval, add those as separate rows. Do not redefine RoleKey.
- [Department Builder architecture §7](../product/16_DEPARTMENT_BUILDER_ARCHITECTURE.md) draws Role under Team and says the Department Job Role must be consolidated. This audit agrees with the consolidation and disagrees with nesting the operational role under the team in the database.
- [Language guide](../product/08_PRODUCT_LANGUAGE_GUIDE.md) says People & Coverage is not a second people system. That remains true. It does not yet forbid Department Job Role capabilities.
- `AGENTS.md` says operational role identity is `OPERATIONAL_ROLE_REGISTRY` and Employee Builder must not redesign that catalog. This audit follows that.
- Older build guides still describe Employee Builder as "department membership, job role, HR" without separating title, team, operational role, and `RoleKey`.

Do not edit those canonical files until the open decisions below are accepted.

---

## Open product-owner decisions

1. Are Cashier, Barista, Prep Cook, and Lead Server new registry keys, or display labels for `SERVER` and `COOK`?
2. Must an employee be explicitly qualified before an assignment, with a supervisor override, or may any Department member be assigned any registry role (today's behavior)?
3. Is a budgeted vacant seat a release requirement, or is coverage `requiredCount` enough?
4. After qualifications exist, is there any remaining need for `DepartmentJobRole` display names beside `JobTitle`?
5. Should People & Coverage keep a team editor, or only a link into Employee Builder?

---

## Proposed migration sequence

Do not start this until those decisions are accepted.

1. Write the qualification rule and the Cashier/Barista decision into the domain model and the language guide. Still no schema.
2. Add one Department-scoped qualification store whose only role identity is the registry key. Backfill nothing from job titles or teams. There is no customer data to protect.
3. Teach the assignment form to prefer qualified employees and to record an explicit override. Coverage continues to store the same key.
4. Point schedule subtitles at job title and primary team.
5. Stop writing Department Job Role capabilities. Remove the editor. Then drop `DepartmentJobRole`, `EmployeeDepartmentJobRole`, dormant `EmployeeDepartment.roleType`, `DefaultAssignment`, and the workstation eligibility map in a forward migration.
6. Tests that must stay green: coverage role keys still reject unknown keys; an assignment snapshot keeps `roleLabel`; team membership does not change when an assignment is created; `RoleKey` checks do not read team lead or qualifications; a person in two Departments remains one Employee.

## Visuals

- [Current stores](./visuals/01-current-workforce.md)
- [Proposed facts, not a forced tree](./visuals/02-proposed-organization.md)
- [One employee from hire to today](./visuals/03-identity-eligibility-assignment.md)
- [Leadership versus permission](./visuals/04-management-and-authorization.md)
- [One role key through coverage and assignment](./visuals/05-coverage-and-assignment.md)
- [Employee Builder wireframe](./visuals/06-employee-builder-wireframe.html)
