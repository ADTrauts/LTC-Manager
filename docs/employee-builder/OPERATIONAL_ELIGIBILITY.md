# Operational eligibility

Accepted November 4, 2026, with Phase 7A.

Department → Team → Role → Employee is a useful presentation. It is not a database ownership tree.

| Fact | What it is | Where it is edited |
| --- | --- | --- |
| HR identity | Job Title | Employee Builder |
| Department membership | This person belongs to this Department | Employee Builder |
| Team organization | Many Teams, one primary Team per Department. A Team lead is `DepartmentTeam.managerEmployeeId` | Employee Builder |
| Operational eligibility | This Employee may perform this registry role in this Department | Employee Builder |
| Daily Assignment | Where they work today, and which role they cover. `roleKey` and `roleLabel` are snapshotted | Run |
| Coverage need | Department + room + role + period + required count | Department Builder → People & Coverage |
| Platform authorization | RoleKey and the current facility role period | Existing access rules |

Eligibility uses `OPERATIONAL_ROLE_REGISTRY`. It is not inferred from Job Title, Team, RoleKey, the schedule, or a past Assignment. Department membership is required and is not itself eligibility. The assignment board does not author Coverage. It may apply a published requirement that is effective on that service date, and a draft cannot be applied.

One Employee may hold several roles, and different roles in different Departments. An Assignment does not change Team membership, Job Title, RoleKey, the Department head, or a staff-manager grant.

An Assignment for someone who is not eligible requires an explicit exception. Each authorization is its own row: actor, reason, employee, role, Department, Assignment, and time. A later role change appends another row. It does not mark the person eligible and it does not erase the earlier authorization. This release does not model licensure or another mandatory credential, so the exception is ordinary staffing. It is not a waiver of a legal requirement.

Cashier and Barista are registry roles because retail coverage counts them apart from Server. Lead Server and Prep Cook are not. Serving is Server. Prep is Hot Prep or Cold Prep. Leadership is the Team lead or RoleKey.

Today's eligibility is the current ACTIVE row. Revoking it keeps that row and does not rewrite an Assignment or a Coverage need. Eligibility is not effective-dated in this release. Assignment history remains the snapshotted role key and label.

Phase 7B removed Department Job Role, its capability keys, Default Assignment, the workstation eligibility map, `EmployeeDepartment.roleType`, and `ScheduleEntry.roleType` / `unitId`. Those were duplicate role identities. Do not restore them as forward design. Schedule should show the person's name, Job Title, primary Team, Department, and scheduled time. Placement stays on the Assignment.

**Supersession — November 6–8, 2026 (Phase 0 ARR-024 / Phase 1):** The compatibility restore (`e179c0d`) and related schema work reintroduced `DepartmentJobRole` / related structures while operational qualifications also exist. Forward architecture still retires Department Job Role ([01B](../product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md)). Residual `/employees/job-roles` is compatibility debt for Phase 2 traced removal — not a second eligibility system.
