# Phase 9A — People & Coverage composition audit

Phase 9B implemented this proposal on `department-builder/people-coverage-composition`. Employee Builder authors Teams. Department Builder authors Coverage requirements and shows Today, Requirements, and Organization. The staffing board applies only a published, effective requirement.

**Verdict: AUDIT COMPLETE**

Read-only audit of Department Builder → People & Coverage at `5f8683d`. No interface was implemented in that audit. The browser session aborted before the page loaded, so Visual 1 is a reconstruction of the mounted components, not a screenshot.

The sections below record that pre-composition screen. Phase 9B changed it: Employee Builder authors Teams, this page reads them, Coverage requirements stay here, and the staffing board applies only a published effective requirement.

People & Coverage is already the right Department Builder section. It is not yet a composition surface. It authors Teams, authors Coverage requirements, and does not show the Department roster, qualifications, or today's fill.

## Current implementation

Route: `/build/departments/{departmentId}?tab=people`.

`departmentAdminHref` builds that URL. Retired `?tab=teams` and `?tab=coverage` redirect here. The page renders `TeamsPanel` and then `CoveragePanel` (`page.tsx`).

**People.** A split list of Teams. A manager can create, rename, describe, assign a lead, and archive a Team. The detail pane shows an active member count and a link to Employee Builder. It does not list members, Job Title, primary Team, operational qualifications, the Department head, or people who belong to the Department and have no Team.

**Coverage.** A list of working expectations and a drawer. A manager can create a draft, name it, add requirements (responsibility room, operational Role, Operational Cycle, required count), remove a requirement, and publish. Publication sets the effective date to the next facility service day when the chosen date is today or earlier. Editing a published row forks a new draft. Retired versions are hidden.

## What works

- Coverage need is `OperationalAssignmentTemplate` plus `OperationalAssignmentTemplateItem`. There is no second staffing table.
- A requirement is Department, canonical room, `OPERATIONAL_ROLE_REGISTRY` role, period-cycle stable key, and `requiredCount`.
- Draft, publish, and effective dates are implemented. Status values are `DRAFT`, `PUBLISHED`, and `RETIRED`.
- Team membership is not written onto a Coverage item. Location Function and generic Work are not part of this write path.
- Actual fill is `evaluateCoverageSlots`. A slot matches an `OperationalAssignment` by role, location, and period overlap. `ScheduleEntry`, Team membership, and eligibility do not fill a slot.
- When no requirement items exist, `buildDietaryCoverageSummary` returns zeros and `notApplicable: 1`. It does not invent a covered rate.
- A call-off stays on the shift. Where `hasCallDown` is passed through, a filled slot becomes `AT_RISK`. It does not become `UNCOVERED` by itself.

## Present but incomplete

- Requirements cannot be edited in place. The service accepts an item id; the form never sends one.
- Cycle values render as stable keys.
- After the first edit of a published row, the open drawer can lose its selection because the URL still names the published id.
- The effective-date field defaults to UTC today, then publish moves that date forward. The stored date can differ from the field.
- There is no version history on this screen. Prior rows remain in the database. Review uses `selectHistoricalCoverageTemplates`.
- Employee Builder can attach people to Teams that already exist. It cannot create a Team.

## Misleading

- The People intro says "Teams, roles, and employees" and the empty detail says "set its name, lead, and members." This screen sets the name, description, and lead. Membership and qualifications are edited on Employee Builder.
- The lead is labeled Manager, Team Manager, and Lead for the same `managerEmployeeId`. A Team lead does not receive a RoleKey.
- **View employees** goes to `/employees?dept=…&team=…`. The directory ignores `dept` and still applies the shell's active Department, so the list can be empty.
- Status badges show the raw enum `DRAFT` or `PUBLISHED`.
- Copy says Coverage requirements are "listed with each location below." They are a separate list, not grouped under rooms.

## Duplicated

`/staffing/assignments` may Apply a published, effective Coverage requirement into today's `OperationalAssignment` rows. Apply is gated by `isCoverageTemplateEffectiveOnDate` (PUBLISHED + active + date interval). Draft and unpublished rows never become operational from the assignment board. Authoring (create/edit/item mutations) is rejected there and stays on Department Builder People & Coverage.

## Missing on this screen

- Department head, staff-management delegation, and employee count.
- Members with no Team, and members with no active qualification.
- Primary Team versus additional Teams, and more than one qualification.
- Today's required versus assigned, and a link to the assignment board for the short location.
- A single read model that joins roster, Teams, qualifications, and head. The pieces exist separately: `loadTeamsForDepartment`, Employee Builder directory loads, and `buildDietaryCoverageSummary`.

## Retired and removable

- The People heading still talks about roles as if this screen authors them. Department Job Role is already gone.
- `TodaysWorkCoverageList` and `SupervisorDailyCoveragePanel` are not mounted.
- `/today/coverage` redirects to `/staffing`. It is not a second Coverage engine.
- Partner `/partner/coverage` (`createPartnerTeamAction`) is the CDA vendor-run Team path: it may create a `DepartmentTeam` when `partnerMaySetUpDepartment` allows, and may move Assignments. It is not facility Employee Builder Team authoring and does not create, edit, or publish Coverage requirements (`OperationalAssignmentTemplate`).

## Workforce data flow

| Fact | Store | Writer today | Shown on People & Coverage |
|---|---|---|---|
| Identity and Job Title | `Employee`, `JobTitle` | Employee Builder | No |
| Department membership | `Employee.primaryDepartmentId`, `EmployeeDepartment` | Employee Builder. Head assignment can add membership | No |
| Department head | `Department.headEmployeeId` | Department settings | No |
| Staff-management delegation | `DepartmentStaffManager` | Department head, on settings | No |
| Team and lead | `DepartmentTeam.managerEmployeeId` | This screen, and partner coverage | Yes, as an editor |
| Team membership and primary Team | `EmployeeTeamMembership.isPrimary` | Employee Builder | Count only |
| Operational eligibility | `EmployeeOperationalRoleQualification` | Employee Builder. Revoke keeps the row | No |
| Platform authority | `Employee.roleType` (`RoleKey`) | Employee Builder | No |
| Coverage need | `OperationalAssignmentTemplate` | This screen, and the staffing template section | Yes |
| Today's placement | `OperationalAssignment` | Run | No |
| Planned time and call-off | `ScheduleEntry` | Schedule and People actions | No |

An employee may belong to several Departments, several Teams, and one primary Team per Department, and may hold several qualifications. None of those combinations are visible together on this screen. A revoked qualification remains a row with status `REVOKED`. The employee card treats it as unchecked. It must not be presented as active.

## Coverage configuration

The mounted editor can create, describe, add, remove, and publish. It cannot retire from the UI, edit one requirement, or show history. `requiredCount` is at least 1, so a configured zero is not a stored state. No published item for that room, role, and period means the requirement is unconfigured. Room type only filters the picker. The saved value is the selected `spaceId`.

Publish authority is `resolveCoverageAuthority`: same facility, active Department, Manager or above, not Quick PIN, then the department change ceiling. Writes are classified in the department write manifest.

## Actual Coverage

`evaluateCoverageSlots` is the calculator Department Builder should call. States:

| Condition | State |
|---|---|
| No runtime-visible plan, nothing placed | `NOT_YET_ASSIGNED` |
| No runtime-visible plan, someone placed | `NOT_CONFIRMED` |
| Plan visible, filled count is 0 | `UNCOVERED` |
| Filled count is below the requirement | `AT_RISK` |
| Filled, and a filler has a call-down | `AT_RISK` |
| Filled, no call-down | `COVERED` |

`buildDietaryCoverageSummary` is the department-day rollup (`engine: "canonical-oa"`). Runtime location state and Historical Review already call the same matcher. Review folds states for display and currently passes `hasCallDown: false`. Dashboard runtime prefetch also omits `hasCallDown`, so a call-off is not At risk on every surface.

`buildLocationCoverageSummary` is a different room-presence projection. It does not use required count or role. People & Coverage should not use it as the Dietary answer.

A `ScheduleEntry` does not fill a requirement. Two people on the schedule and one matching assignment is a shortage.

## Recommended interface

One page, three regions. Do not add tabs inside People & Coverage. The manager needs to see an unconfigured Department and a shortage without switching modes, and this section is already one Department Builder tab.

1. **Today.** A short read-only strip from `buildDietaryCoverageSummary` for the current service date. If nothing is published, say that Coverage is not configured. Do not show a covered rate. Each shortage links to Run's assignment board. This region does not edit assignments.
2. **Coverage requirements.** Keep the existing draft and publish drawer. This is the only region that writes. Group the list by location when a Department has many rooms. Show cycle labels, and let a manager change a requirement on the draft.
3. **Organization.** A read-only summary: head, employee count, each Team with its lead and member count, people with no Team, and qualification counts. Links open Employee Builder. Do not render a 100-person roster on this page.

A Department with no Teams still shows the roster count and the Coverage editor. Team creation is not required.

## Authorization

Viewing a Team does not grant permission to change it. Managing qualifications stays on Employee Builder's action. Coverage writes stay on `resolveCoverageAuthority` and the write manifest. Daily placement stays on `resolveAssignmentAuthority` (Supervisor or above, then the department ceiling). A Team lead does not gain a RoleKey. A qualification does not grant application permission.

## Scenarios

| Case | How the proposed page behaves |
|---|---|
| Large Dietary, about 100 people and many serveries | Organization is counts and Team cards. Coverage is grouped by room. The roster stays in Employee Builder. |
| Twelve people, no Teams | Organization says there are no Teams and lists the head and qualification counts. Coverage still edits. |
| Server and Dishwashing | Qualifications are a count or a person drill-down. They are not two Teams. |
| Two Servers required, one assignment | Today shows the shortage. Scheduled people who have no matching assignment are not counted. |
| Resident Services member covers Utility today | Organization keeps the Team. Today shows the Utility assignment. The Team is not rewritten. |
| Two Departments | Membership, Teams, qualifications, and requirements are loaded for the selected Department only. |
| No published requirements | Today says Coverage is not configured. It does not say zero shortages or fully covered. |

## Classification

| Piece | Class | Why |
|---|---|---|
| `OperationalAssignmentTemplate` and items | KEEP | The Coverage engine |
| `evaluateCoverageSlots`, `buildDietaryCoverageSummary` | REUSE | Today's strip reads them. Do not recalculate in the browser |
| Coverage drawer, draft, and publish | REUSE | Right writer. Presentation and edit-in-place need work |
| `resolveCoverageAuthority`, write manifest | KEEP | |
| `DepartmentTeam`, membership, qualifications | KEEP | Canonical workforce facts |
| Team create, rename, lead, archive on this page | MOVE | Employee Builder owns the Team. That screen cannot create one yet, so move the writer before removing it here |
| Member and qualification editing | MOVE | Already on Employee Builder. Fix the department link |
| People intro that implies this screen sets roles and members | REMOVE | Copy only |
| Assignment Templates section on `/staffing/assignments` | REMOVE | Second writer of the same rows. Apply-from-published can remain on Run |
| Partner "Add a team" | MOVE | Same Team writer, outside Employee Builder |
| Department roster plus qualification summary | BUILD | Read composition only. No new table |
| Today strip and Run link | BUILD | Presentation over the existing summary |
| `buildLocationCoverageSummary` as this page's answer | REMOVE | Different grain |

## Gaps

Essential for Phase 9B:

- A department-scoped read model for head, member count, Teams, unteamed count, and active qualification counts.
- Today strip that treats `notApplicable` as unconfigured.
- Team authoring available in Employee Builder before this page stops writing Teams.
- Stop the staffing template screen from creating or applying unpublished Coverage rows.
- Fix **View employees** so the directory uses this Department.

Not essential:

- Version-history browser.
- Editing clock times. Coverage writes do not use them.
- A configured required count of zero.
- Call-down on the Dashboard and in Review. Real, and separate from this layout.

No schema change is required for the layout. A Department of 100 people should load counts and the working expectations first, then one department-day summary. Do not load every historical assignment on first paint.

## Phase 9B

1. **Read model.** One server read for the organization counts and the working expectations. Reuse current loaders. Add the unteamed and qualification counts.
2. **Organization presentation.** Replace the Team editor on this page with the summary and Employee Builder links. Add Team create, rename, lead, and archive to Employee Builder in the same milestone so the writer is not lost.
3. **Coverage UX.** Keep the current actions. Show cycle labels, edit a draft requirement, and group by room. Leave publish and effective dates on the existing service.
4. **Today.** Read `buildDietaryCoverageSummary`. Link a shortage to the assignment board. No assignment form on this page.
5. **Navigation and authority.** Department-scoped employee link. Coverage buttons still follow `canManage`. Assignment links follow assignment authority.
6. **Certification.** Browser pass for the seven scenarios, plus the existing hermetic coverage and team tests.

## Product-owner decision

One decision should be confirmed before Phase 9B removes a screen someone may still use:

**Assignment Templates on the staffing board.** The audit recommends removing that editor and keeping Apply only for a published Coverage expectation. Confirm that Apply-from-draft is not an intentional Run shortcut.

Team ownership does not need a new decision. Department Builder architecture already places Teams in Employee Builder. Phase 9B should follow that, after Employee Builder can create the Team.

## Phase 9C — Integration Closure

Phase 9C closed the remaining integration gaps after the Phase 9B composition baseline (`c34c014`):

- Disposable SQL failures from the Phase 9B `verify:db` run were compared to clean `origin/main` under `--test-concurrency=1`. Both trees: **71 tests / 70 pass / 0 fail / 1 skip**. No branch regression; no tests weakened.
- Richer disposable browser fixtures (`scripts/verify/people-coverage-browser-fixtures.mjs`) certified scenarios **A, C, D, E, F**, plus draft-cannot-apply on the staffing board.
- Partner `/partner/coverage` Team create is classified as the CDA vendor-run path, not a second facility Team authoring surface, and does not author Coverage requirements.

See [PHASE_9C_CERTIFICATION.md](./PHASE_9C_CERTIFICATION.md).

## Phase 9D — PR certification

Phase 9D pushed the branch, opened PR #7 against `main`, merged `origin/main` @ `e179c0d` while keeping explicit-space Coverage and org-only Teams, and certified all five required Verify jobs green at `fb59888`.

See [PHASE_9D_CERTIFICATION.md](./PHASE_9D_CERTIFICATION.md). Not merged without separate authorization.

## Git

- Branch: `department-builder/people-coverage-composition`
- Baseline: `5f8683d38a35eb68fe03a3ce2f7804cb7b203bc8`
- Phase 9B baseline commit: `c34c014`
- Phase 9C tip: `910578e`
- Phase 9D certified tip: `fb59888`
- PR: https://github.com/ADTrauts/LTC-Manager/pull/7
- Worktree: `/Users/andrewtrautman/Desktop/LTC Manager/ltc-manager-people-coverage`
