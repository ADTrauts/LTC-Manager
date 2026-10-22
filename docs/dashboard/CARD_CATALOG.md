# Dashboard card catalog

Every planned card, the question it answers and where it drills. Cards are platform-owned (DSH-D10). A card shows for a Department only when the Department has the required capabilities ([contract](./DEPARTMENT_DASHBOARD_CONTRACT.md#capability-vocabulary)). Data sources are existing functions unless marked **new**.

## Conventions

- **Scopes.** Where a card is meaningful:
  - **F** = Facility (Facility Administrator only)
  - **D** = Department
  - **T** = Team
- **Minimum authority.** One of:
  - **SUP** = Supervisor
  - **MGR** = Manager
  - **LDR** = Department leader (GM or linked head)
  - **FA** = Facility Administrator
- **Sizes.** Small is 3 of 12 columns, Medium is 6 and Large is 12. The default size is in bold.
  - Small shows one number with its label and link.
  - Medium shows a number and up to five items.
  - Large shows up to ten items or a full timeline.
- **States.** Every card supports four states:
  - `ready`
  - `quiet`, a calm "nothing needs anyone" line
  - `not_configured`, shown only to people who can fix it
  - `unavailable`, an isolated error
- **Drill-downs.** Drill-down links carry the viewer's Department. Every drill-down must pass `authorizeRoute` for the viewer, or the card is not eligible.
- **Facility Administrator access modes (DSH-D18).**
  - **View** (a self-operated Department they do not head): every card still shows its data, but
    - drill-downs that open a place to change things switch to a read view or show no link
    - Shortcuts that write are removed
    - Department setup reasons show without fix links
  - **Summary** (a vendor-run Department after the vendor's head accepts):
    - only cards with a summary form render, with a "Vendor-run · operator" chip
    - counts and status only
    - no links, people, record details or setup reasons
    - the summary list is CDA-Q07: Records on time or overdue, coverage gaps, open requests to Plant, Operating Rhythm on track or late, setup complete or not
- **Phase.** The phase that delivers the card.

## People & Coverage

| Card (id) | Question | Scopes | Min | Requires | Sizes | Source | Drill-down | Phase |
|---|---|---|---|---|---|---|---|---|
| Coverage (`coverage`) | Do we have the people we need right now? | F D T | SUP | `coverage.planned` | **S** M | Runtime Location State coverage; `loadSupervisorDailyCoverage`; `loadDailyAssignmentBoard` when Operational Assignments is on | `/staffing` for today, or `/staffing/assignments` | DSH-02 |
| Call-offs & call-downs (`call_offs`) | Who is out today and is it covered? | F D T | SUP | `people.roster` | **S** M | `loadPresenceCallOffs` (plus Department filter, DSH-01); `summarizeCallDowns` | `/staffing` for today | DSH-02 |
| Shift handoff (`handoff`) | What does the next shift need to know? | D T | SUP | `locations.runtime` | **M** L | `buildHandoffData` / `presentHandoffsFromBoard`; AI shift summary only when its AI flag is on | `/today/handoffs`, then `/staffing/handoffs` from DSH-04 | DSH-02 |
| People alerts (`hr_alerts`) | Which people issues need a leader? | F D | LDR | `people.roster` | **M** L | **New** aggregate over existing rows: `chrcStatus`, pending `EmployeeUserLinkInvitation`, pending PIN enrollment, `DisciplinePointEntry` thresholds, recent `EmployeeTerminationRecord`, employees with no team | `/employees` (and `/employees/chrc-report`, `/employees/points-summary`) | DSH-05 |
| Teams at a glance (`team_comparison`) | Which team needs help? | D | LDR | `locations.runtime` and teams exist | **M** L | **New** grouping of Runtime Location State by team rooms (`resolveViewerTeamScopes` data) | Team-scoped Dashboard lens | DSH-05 |

## Locations

| Card (id) | Question | Scopes | Min | Requires | Sizes | Source | Drill-down | Phase |
|---|---|---|---|---|---|---|---|---|
| Needs attention (`attention`) | What needs someone now? | F D T | SUP | Any attention source | M **L** | Merged `DashboardAttentionItem` from every mapper (Architecture §5) | Each item's owner page; header links to `/units` | DSH-02 |
| Rounds (`rounds`) | Which rooms do I walk next, in order? | D T | SUP | `locations.runtime` | **M** L | `buildActionableRoomWalkList` | `/today/walk`, then `/units?view=rounds` from DSH-04 | DSH-02 |
| Departments at a glance (`departments_glance`) | Which Department needs my attention? | F | FA | At least one operable Department | M **L** | Fact Pack fan-out per Department: attention, coverage, overdue Records, open work orders; operating model and operator name per row | Switches the Dashboard lens to that Department. Vendor-run rows in Summary show counts only. | DSH-02 |

## Operational Cycle & Work

| Card (id) | Question | Scopes | Min | Requires | Sizes | Source | Drill-down | Phase |
|---|---|---|---|---|---|---|---|---|
| Shift now (`shift_now`) | Where are we in today's operation? | D T | SUP | `cycles.published` | M **L** | `presentDashboardWorkspace` pace; `loadDepartmentRunPresentation` (current Cycle, Phase, next Key Point) | `/staffing/cycles` | DSH-02 |
| Today's timeline (`timeline`) | What is left today and what slipped? | D | MGR | `cycles.published` | **L** | `loadGmCycleSummary`; `loadDepartmentRunPresentation` | `/staffing/cycles` | DSH-02 |
| Expected work (`expected_work`) | What Work is due and is it on track? | D T | SUP | `work.expected` | **M** L | `loadTodaysExpectedWork` | `/staffing/work-plans` | DSH-02 |

## Maintenance

| Card (id) | Question | Scopes | Min | Requires | Sizes | Source | Drill-down | Phase |
|---|---|---|---|---|---|---|---|---|
| Work orders & issues (`maintenance_open`) | What is broken and who is on it? | F D T | SUP | `maintenance.shared` or `plant.maintenance` | S **M** L | `loadSupervisorAssetExceptions`; `listWorkOrders` with the viewer's session | `/repairs`, `/issues` | DSH-02 |
| Preventive maintenance due (`pm_due`) | What PM is due or overdue? | F D | SUP | `plant.maintenance` | **S** M | `loadPmRunBoard` counts | `/preventive-maintenance` | DSH-02 |
| Requests to triage (`request_triage`) | Which requests are waiting to be routed? | F D | SUP | `plant.maintenance` | **S** M | `listPlantTriageQueue` | `/repairs` (triage view) | DSH-02 |
| Our requests to Maintenance (`requests_filed`) | What has my Department asked Maintenance for, and where is it? | D T | SUP | `plant.requests.filed` | **S** M | `loadRequesterVisibleStatus`; `listWorkOrders` by requesting Department | `/repairs` filtered to the Department | DSH-05 |

## Records & Audit / Reports

| Card (id) | Question | Scopes | Min | Requires | Sizes | Source | Drill-down | Phase |
|---|---|---|---|---|---|---|---|---|
| Records due (`records_due`) | Which Records are due, overdue or need correction? | F D T | SUP | `records.canonical` | S **M** L | Runtime Location State evidence (`summarizeRuntimeEvidence`) and `loadFacilityRunLogRequirements`. A Department still on legacy Records shows `not_configured` (DSH-D19). | `/staffing/log-book` | DSH-02 |
| Yesterday in review (`review_yesterday`) | How did yesterday go? | F D | MGR | `records.canonical` | **M** L | `loadOperationalReviewDay` behind a **new** day-level cache | `/reports` | DSH-05 |
| Recent activity (`recent_activity`) | What changed in the last seven days? | F D | MGR | None | **M** L | `loadWorkspaceNonOperationalExtras` (plus Department filter inside its queries, DSH-01) | Each item's owner page | DSH-02 |

## Menus

| Card (id) | Question | Scopes | Min | Requires | Sizes | Source | Drill-down | Phase |
|---|---|---|---|---|---|---|---|---|
| Today's menu (`menu_today`) | What is being served, and is the Menu set up for every location? | D T | SUP | `menus` | **S** M | `resolveApplicableMenus`; `evaluateMenuApplicabilityAttention` | `/menus` | DSH-02 |

## Administration

| Card (id) | Question | Scopes | Min | Requires | Sizes | Source | Drill-down | Phase |
|---|---|---|---|---|---|---|---|---|
| Department setup (`department_setup`) | What is not configured yet in this Department? | D | LDR | None. Shows capability `notConfigured` reasons. | **M** L | Capability resolver; Department Builder overview guidance | `/build/departments/{id}` (Manager+, manage). View viewers get reasons only. Summary viewers get "setup complete" or "not complete" only. | DSH-02 |
| Facility setup & readiness (`facility_setup`) | Is the facility fully set up, and who is missing a Department or a leader? | F | FA | None | **M** L | Setup workspace readiness; `summarizeFacilityStructureCounts`; leader resolution gaps; absorbs the post-onboarding launch checklist content | `/setup`, `/admin/departments` | DSH-02 |
| Departments & licensing (`departments_licensing`) | Which Departments are installed, licensed and active? | F | FA | None | **M** | `loadFacilityDepartmentCatalog`; entitlement status (read-only) | `/admin/departments`, `/admin/billing` | DSH-05 |
| Shortcuts (`shortcuts`) | What do I usually do next? | F D T | SUP | None | **S** M | Authorized quick actions from the current `workspace-composition` sets, filtered by `authorizeRoute` | Each action | DSH-02 |

## Not carried forward

These Business Workspace sections are deleted with no replacement card. Their feeds are hardcoded empty today, or another card covers them.

| Old section | Why |
|---|---|
| Manager Focus, Management Agenda, Priorities | Feeds are empty arrays. Needs attention and Today's timeline answer the real questions. |
| Department Health (old) | Force-hidden and empty. Replaced by Departments at a glance (Facility) and Teams at a glance (Department). |
| Performance / "Operation snapshot" | Replaced by Shift now. |
| Key time summaries, run presentation header | Hardcoded placeholder (`BREAKFAST` / `Preparation`) on a dead render branch. Shift now uses real run presentation. |
| Morning brief | Moves to the AI program when its flags are on. Not a v1 card. |

## Default layouts

There is one list per authority band and scope kind. Ineligible cards are skipped in order, so the same list adapts to each Department. A Plant Department skips cycle cards and shows Maintenance cards high up. A Food & Nutrition Department shows Shift now and Today's menu. Sizes are in brackets.

### Supervisor — Team scope (home from DSH-04)

1. Shift now [L]
2. Needs attention [M]
3. Call-offs & call-downs [S]
4. Coverage [S]
5. Rounds [M]
6. Records due [M]
7. Expected work [M]
8. Shift handoff [M]
9. Today's menu [S]
10. Work orders & issues [S]
11. Requests to triage [S]
12. Preventive maintenance due [S]

### Manager — Department scope

1. Needs attention [L]
2. Today's timeline [L]
3. Coverage [S]
4. Call-offs & call-downs [S]
5. Records due [M]
6. Requests to triage [M]
7. Preventive maintenance due [M]
8. Expected work [M]
9. Work orders & issues [M]
10. Today's menu [S]
11. Shortcuts [S]
12. Recent activity [M]

### Department leader — Department scope

The Manager list, with Department setup [M] inserted after Today's timeline. DSH-05 adds:
- People alerts [M] after Department setup
- Teams at a glance [M] after Records due
- Yesterday in review [M] before Recent activity

A Facility Administrator in a Department lens uses this layout.

### Facility Administrator — Facility scope

1. Needs attention [L]
2. Departments at a glance [L]
3. Facility setup & readiness [M]
4. Coverage [S]
5. Call-offs & call-downs [S]
6. Work orders & issues [M]
7. Records due [M]
8. Preventive maintenance due [S]
9. Requests to triage [S]
10. Recent activity [M]

DSH-05 adds Departments & licensing [M] and People alerts [M] after Facility setup & readiness.

## Adding a card later

A new card needs all of the following in one reviewed change:

1. Registry entry: id, question, category, scopes, minimum authority, requires, sizes.
2. A loader that uses only Fact Pack facts or a new fact with the viewer's session. No direct Department id from the request.
3. An attention mapper if the card raises attention.
4. Tests for eligibility, drill-down authorization, two-Department isolation, and count parity with its drill-down.
5. A catalog row here and, if it belongs in a default layout, the layout change.
6. If it depends on a Department Product capability, an update to that Product's Dashboard contribution declaration ([contract](./DEPARTMENT_DASHBOARD_CONTRACT.md#dashboard-contribution-declarations)).
