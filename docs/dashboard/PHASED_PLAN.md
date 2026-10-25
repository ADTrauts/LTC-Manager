# Dashboard phased plan

Six phases. The order is:
1. Decide (DSH-00).
2. Build the foundation with no visible change (DSH-01).
3. Ship the new page behind a flag (DSH-02).
4. Add customization (DSH-03).
5. Retire Today's Work and Business Workspace so only one path remains (DSH-04).
6. Extend (DSH-05).

Each phase needs explicit authorization, records its evidence in the [phase tracker](./PHASE_TRACKER.md), and stops at its boundary.

Supporting records:
- [Decisions](./DECISIONS.md)
- [Architecture](./ARCHITECTURE.md)
- [Card catalog](./CARD_CATALOG.md)
- [Department Dashboard Contract](./DEPARTMENT_DASHBOARD_CONTRACT.md)

## Rules for every phase

- **Next.js docs first.** Before writing code, read the relevant guide in `node_modules/next/dist/docs/` (App Router server components, Suspense streaming, `cache`, server actions, redirects). Record anything that changes the plan in the tracker.
- **Proportionate verification.** Follow the spirit of the [onboarding verification policy](../onboarding/VERIFICATION_POLICY.md). The full suite runs at the DSH-02 and DSH-04 exits and whenever a change touches shared shell, navigation or route-registry code.
- **Prisma guardrails.** Forward-only migrations. Never edit applied migrations. Never run `prisma migrate reset`. After schema changes, run `prisma generate` and restart the dev server.
- **No side effects.** No change to Department Product release status, entitlements or billing. No Plant features or migrations. No parallel Records model. No default-off engine flag turned on (DSH-D16).
- **Don't touch other programs' work.** Preserve unrelated uncommitted work. Do not edit onboarding program files.
- **Amend authority docs on time.** Each phase applies its authority-doc amendments at exit, per [DSH-D17](./DECISIONS.md#dsh-d17--superseded-statements-and-amendment-schedule--accepted-october-20-2026), so docs never describe a state the code is not in.

---

## DSH-00 — Decision record and authorization

**Goal.** Everything is written and agreed before any code is built.

**Deliverables.**
1. Program record under `docs/dashboard/`:
   - README
   - current-state audit
   - decisions
   - architecture
   - card catalog
   - Department Dashboard Contract
   - this plan
   - phase tracker
2. A new "Dashboard contributions" blueprint item and release-gate pointer in [doc 13](../product/13_DEPARTMENT_PRODUCT.md).
3. Program pointers in `AGENTS.md`, the root `README.md`, `docs/product/README.md` and `memory-bank/README.md`. They tell future work not to extend Business Workspace or Today's Work.

**Exit gate.**
- The product owner accepts the decision record. DSH-D02, D03, D04, D06, D07, D08, D09 and D18 are already user decisions.
- Defaults for DSH-Q01–Q08 are recorded.
- DSH-01 is explicitly authorized.

**Out of scope.** Any code, test, schema or route change.

---

## DSH-01 — Foundation (no visible change)

**Goal.** Build the shared engine of the new Dashboard behind no UI: who is looking, what each Department can do, which cards are eligible, one attention shape, and shared data. Close the Department-filter gaps.

**Deliverables.**
1. **Viewer Context** (`src/lib/dashboard/viewer/`):
   - `resolveDashboardViewer` with the scope rules in [Architecture §2](./ARCHITECTURE.md#2-viewer-context).
   - A shared `resolveLedDepartmentIds` predicate. `canManageDepartmentHeadSettings` is refactored to use the same predicate, with tests proving identical answers before and after.
   - Operating model and access mode per Department in scope (DSH-D18), from `resolveDepartmentAccessMap` ([CDA-01](../contracted-departments/PHASED_PLAN.md#cda-01--foundation-no-visible-change), which lands with or before this phase). A missing operator row counts as self-operated, which is today's behavior.
2. **Capability resolver** (`src/lib/dashboard/capabilities.ts`). Batched, fail-closed, using the [vocabulary](./DEPARTMENT_DASHBOARD_CONTRACT.md#capability-vocabulary).
3. **Card registry types and eligibility.**
   - `src/lib/dashboard/cards/registry.ts` holds definitions (id, question, category, scopes, minimum authority, requires, sizes, drill-down) for every DSH-02 card.
   - `listEligibleCards` is a pure function and includes the drill-down `authorizeRoute` check.
   - Loaders may be stubs that return `quiet`.
4. **Attention contract and mappers** (`src/lib/dashboard/attention.ts`, `attention-mappers/`): Runtime Location State, coverage and call-offs, Records (with engine branch), asset exceptions, Plant PM, Plant triage, Menus.
5. **Fact Pack** (`src/lib/dashboard/facts.ts`). Request-scoped memoized getters over existing loaders.
6. **Department filters.** Both are optional parameters, so existing callers are unchanged.
   - `loadPresenceCallOffs` gains `departmentId?`.
   - `loadWorkspaceNonOperationalExtras` gains `departmentIds?`, applied inside each query.
7. **Custom-Department check.** A fixture verifies how `locations.runtime` derives for a custom Department.
8. **Stale redirects.** Review the 16 `redirect("/dashboard")` calls in 11 files. Unauthorized-role cases go to `resolveDefaultHomePath`.
9. **Dead code in Business Workspace.** Remove render branches that can never run: the hardcoded header operation placeholder and the force-hidden sections. Visible behavior stays identical.
10. **Local hygiene. Done October 20, 2026, with the product owner's go-ahead.**
    - 277 macOS " 2" duplicates were moved to `../ltc-manager-duplicate-archive-2026-10-20/`, outside the repository. They were local only, untracked and imported by nothing.
    - Of these, 130 were identical to their originals and 146 were older snapshots. One had no original: its original was removed in commit `797b33c`.
    - `MANIFEST.tsv` in the archive lists every path. `README.txt` there explains how to restore.
    - Only " 2" copies moved. Every `migration.sql` is untouched.
    - Seven duplicates inside the disposable `.next-*` browser build caches were left in place.

**Files touched.**
- New: `src/lib/dashboard/**`.
- Small edits:
  - `src/lib/todays-work/load-presence-call-offs.ts`
  - `src/lib/business-workspace/load-workspace-extras.ts`
  - `src/lib/business-workspace/load-business-workspace.ts`
  - `src/components/business-workspace/business-workspace-view.tsx`
  - `src/lib/dept-settings-access.ts`
  - the 11 redirect files

**Tests.**
- Hermetic:
  - viewer matrix: role × head link × primary Department × team × lens request × operating model, including forged cookie and parameter cases
  - access mode, read from the CDA resolver: the Facility Administrator gets View on self-operated Departments they do not head, Manage where they are head, and Summary on vendor-run Departments after the vendor's head accepts; a vendor's GM gets Manage on their own Department only
  - eligibility matrix: authority × scope × capability × flag × release status, including EVS installed internally
  - each attention mapper's severity and `departmentId`
  - drill-down authorization for every card × authority band
- Database:
  - leader resolution on real rows
  - operating model from real `DepartmentOperatorRelationship` rows, including a relationship that starts or ends on the service date
  - capability derivation for a Food & Nutrition, Plant and custom Department
  - Department filters on call-offs and recent activity (two-Department isolation)
- Regression: existing `/workspace`, `/today`, navigation and route-registry tests unchanged and passing.

**Exit gate.**
- No visible change. Existing page, navigation and route tests pass unchanged.
- Every new module has hermetic coverage of its rules.
- Department filters are proven by two-Department tests.
- DSH-Q02 is answered or its default confirmed.

**Out of scope.** Any new page, route, nav, flag or schema change. No card UI.

**Rollback.** All additions are unused by the UI. Revert the commit.

---

## DSH-02 — New Dashboard with role default layouts (behind `DASHBOARD_V2_ENABLED`)

**Goal.** The right Dashboard for each viewer, with fixed role layouts, in pilot behind a flag.

**Deliverables.**
1. **Flag.** `DASHBOARD_V2_ENABLED`, default `false`, wired through the existing feature-flag helpers and route-registry flag support. The flag is deployment-wide (environment based), so the pilot means enabling it on staging, then production with the product owner's approval.
2. **Routes while the flag is on.**
   - `/dashboard` renders the new Dashboard (Supervisor+).
   - `/workspace` redirects to `/dashboard`, preserving `?onboarding=complete`.
   - `resolveDefaultHomePath` sends Manager+ to `/dashboard`.
   - The nav item "Dashboard" points to `/dashboard`, and the icon key is renamed `dashboard`.
3. **Grid and frame.** 12/6/1-column renderer, card frame with the four states, per-card Suspense and error isolation, scope chip, Refresh control.
4. **Cards.** Loaders and views for every card marked DSH-02 in the [catalog](./CARD_CATALOG.md).
5. **Default layouts.** The role default layouts from the catalog.
6. **Lens switch and notices.**
   - Lens switch: Facility Administrator (Facility or any Department), multi-Department leaders, Supervisor (Team or whole Department).
   - Viewer notices: no team assigned, Dashboard covers a different Department than the sidebar, no Department linked.
7. **Onboarding hand-off.** The post-onboarding launch checklist renders on `/dashboard?onboarding=complete`.
8. **Performance.** Measure against the [performance budget](./ARCHITECTURE.md#11-performance-budget) on the pilot facility's largest Department and record the result.
9. **Shared helpers.** Supervisor-tool cards (Rounds, Handoff, Call-offs, Expected work) reuse the Today's Work helpers in place. They move in DSH-04.

**Files touched.**
- `src/app/(protected)/dashboard/page.tsx`
- `src/app/(protected)/workspace/page.tsx` (flag-on redirect)
- `src/components/dashboard/**`
- `src/lib/dashboard/cards/**`
- `src/lib/dashboard/layouts/defaults.ts`
- `src/lib/feature-flags.ts`
- `src/lib/nav-zones.ts`
- `src/lib/route-registry/platform-routes.ts` and navigation
- the nav icon map

**Tests.**
- Hermetic: layout resolution and skipping; route and nav behavior with the flag on and off.
- Database: card loaders against two-Department fixtures; count parity (Needs attention vs Locations, Expected work vs Work Plans).
- Browser:
  - Facility Administrator, Department leader (GM), Manager and Supervisor each see their correct default.
  - A Plant leader sees no cycle cards and does see Maintenance cards.
  - A Food & Nutrition leader sees Shift now and Today's menu.
  - Terrace View fixture (Food & Nutrition vendor-run by Metz, Plant and EVS self-operated):
    - the Facility Administrator sees Plant and EVS in View, with no change actions
    - after naming themselves head of EVS, they see EVS in Manage
    - they see Food & Nutrition in Summary after the Metz head accepts: counts only, no links
    - the Food & Nutrition GM sees only Food & Nutrition
    - the vendor-account GM case runs once CDA-05 lands
  - Fault injection: one card failing leaves the others rendered.
  - Drill-downs open.
  - `/workspace` redirects.
  - The onboarding checklist renders.
  - With the flag off, everything is unchanged.
- Full suite at exit.

**Exit gate.**
- All four personas see a distinct, correct default.
- Numbers match their drill-down pages.
- One failing card never blanks the page.
- Performance budget met.
- Flag off is byte-for-byte the current behavior for routes and nav.
- The Dashboard offers no change path in View (rule A10), and shows only summaries in Summary (rule A11).
- DSH-Q01 and Q04 answered or defaults confirmed. DSH-Q03 and CDA-Q07 (the summary list) are answered.
- CDA-03 view fix landed, so Facility Administrator drill-downs open.
- Production enablement needs one of:
  - [CDA-07](../contracted-departments/PHASE_TRACKER.md) is done
  - the product owner explicitly accepts that other pages still let the Facility Administrator change Departments they do not head

**Docs amended at exit.**
- Constitution: Managers begin in the Dashboard.
- Language Guide: Business Workspace and Operations Center become retired terms, Dashboard becomes the term.
- Persona Model: GM row.
- RUN freeze: Dashboard row.
- Legacy Surface Register: `/workspace` redirect row.

**Out of scope.** Customization. Supervisor home change. Deleting Business Workspace or Today's Work code.

**Rollback.** Turn the flag off.

---

## DSH-03 — Customization

**Goal.** Supervisors and up can arrange their own Dashboard on the snap grid.

**Deliverables.**
1. **Schema.**
   - `DashboardScopeKind` enum and `DashboardLayout` model ([Architecture §7.1](./ARCHITECTURE.md#71-model-dsh-03-forward-only-migration)) in one new forward-only migration, including the one-owner CHECK constraint.
   - Then `prisma generate` and a dev-server restart.
2. **Layout storage.** `src/lib/dashboard/layouts/parse.ts` (zod) and `store.ts`. The owner is the User for password sessions and the Employee for Supervisor PIN sessions. Console work sessions never save.
3. **Server actions.** `saveDashboardLayout` and `resetDashboardLayout` in `src/app/(protected)/dashboard/actions.ts`.
4. **Edit mode** (client island):
   - `@dnd-kit` pointer and keyboard sorting
   - size menu limited to each card's sizes
   - remove
   - Move up / Move down
   - Save / Cancel / Reset to default
5. **Card library.** Grouped by category, showing only eligible cards not already placed, with a "New cards available" marker.
6. **Phone edit mode.** List with Move up / Move down and size menu. No drag required.

**Tests.**
- Hermetic: parse and validate (unknown, duplicate, size, item limit), resolution order, ineligible saved cards skipped and retained.
- Database: owner isolation (User vs Employee, cross-facility), save/reset idempotency, the CHECK constraint.
- Migration: applies cleanly on a disposable database from empty and on a copy with existing data. Migration integrity checks pass. No applied migration edited.
- Browser: drag, resize, add, remove, save, reload persists; keyboard-only reorder; reset; phone single column; a Supervisor cannot reach Facility-scope layouts.

**Exit gate.**
- A saved layout can never show a card the viewer is not allowed to see.
- Layouts persist across sessions for both owner types.
- A keyboard-only pass succeeds.
- The migration is verified as above.

**Docs amended at exit.** The Business Workspace acceptance checklist is marked historical, with the drag-and-drop line superseded.

**Out of scope.** Facility default layouts (DSH-05). Changing or dropping `WorkspacePreference`.

**Rollback.** Turn the flag off. The new table is additive and unused when the flag is off.

---

## DSH-04 — Retire Today's Work and Business Workspace (one code path)

**Goal.** One home. Supervisors land on the Dashboard. No Today's Work page and no Business Workspace code remain, and no supervisor tool is lost.

**Deliverables.**
1. **New homes for unique Today's Work tools.**
   - Handoffs page at `/staffing/handoffs` (People & Coverage), including the AI shift summary when its flag is on.
   - Rounds view in Locations at `/units?view=rounds`.
   - Coverage detail in Schedule (`/staffing`) and Assignments (`/staffing/assignments`). Any `/today/coverage` content missing there moves into Schedule.
2. **Supervisor home.** `resolveDefaultHomePath` sends Supervisors to `/dashboard` (Team scope).
3. **Redirects.**
   - `/today` → `/dashboard`
   - `/today/walk` → `/units?view=rounds`
   - `/today/coverage` → `/staffing`
   - `/today/handoffs` → `/staffing/handoffs`

   Route-registry entries become redirect entries, and the "Today's Work" nav item is removed.
4. **Relocation map.** Move shared helpers out of `src/lib/todays-work/` and update their importers (scheduling, AI operational snapshot, staffing pages and actions):

   | From | To |
   |---|---|
   | `viewer-team-scope.ts` | `src/lib/dashboard/viewer/` |
   | `coverage-list.ts`, `call-down.ts`, `load-presence-call-offs.ts` | `src/lib/scheduling/` |
   | `handoffs.ts`, `present-handoffs-from-board.ts` | `src/lib/staffing/handoffs/` |
   | `walk-list.ts` | `src/lib/locations/rounds/` |
   | `expected-work/` | `src/lib/work/expected/` |

5. **Runtime presentation.** Move the live pieces of `src/lib/business-workspace/dashboard/` (`loadDashboardRuntime`, `presentDashboardWorkspace`) into `src/lib/dashboard/runtime/`.
6. **Delete.**
   - `src/lib/business-workspace/**` (after the move)
   - `src/components/business-workspace/**`
   - Today's Work page components and the `/today*` pages
   - the Business Workspace and Today's Work Projection paths
7. **Flags removed.**
   - `TODAYS_WORK_ENABLED`
   - `PROJECTION_TODAYS_WORK_ENABLED`
   - `PROJECTION_BUSINESS_WORKSPACE_ENABLED`
   - `DASHBOARD_V2_ENABLED` (the new behavior becomes the only behavior)
8. **WorkspacePreference.** No longer read. The table and rows stay (DSH-D14).
9. **Tests updated, not deleted.**
   - `run-surface-rationalization`
   - `todays-work-rbac` (replaced by Dashboard role tests)
   - `nav-zones`
   - `route-registry/navigation`
   - `authorize`
   - browser specs that open `/today*`

**Today's Work capability checklist.** Each item must be verified in a browser before exit.

| Today's Work function | New home | Verified |
|---|---|---|
| See what needs attention in my rooms | Needs attention card (Team scope) | ☐ |
| Walk order | Rounds card and `/units?view=rounds` | ☐ |
| Coverage for today | Coverage card, `/staffing`, `/staffing/assignments` | ☐ |
| Record a call-down or call-off | Call-offs card drill-down to `/staffing` actions | ☐ |
| Handoff notes and AI shift summary | Shift handoff card and `/staffing/handoffs` | ☐ |
| Expected work | Expected work card and `/staffing/work-plans` | ☐ |
| Team-scoped view, "No team assigned" notice | Supervisor Team scope and notice | ☐ |

**Exit gate.**
- No Today's Work nav item.
- Every `/today*` URL redirects.
- The capability checklist is complete.
- Only one Dashboard code path exists.
- The full suite passes relative to the recorded baseline.
- The pilot is accepted by the product owner on staging.

**Docs amended at exit.**
- Constitution: Supervisor home and site-awareness lines.
- Language Guide: Today's Work row.
- Persona Model: Supervisor home.
- RUN guide.
- Legacy Surface Register: `/today*` rows.
- Roadmap: handoff line.
- RUN freeze: Today's Work row.

**Out of scope.** Dropping `WorkspacePreference`. AI behavior changes.

**Rollback.** This is the one-way door, which is why pilot acceptance is required. No data is destroyed, so reverting the DSH-04 change set restores the previous pages and flags.

---

## DSH-05 — Extend

**Goal.** Facility-level defaults, the remaining cards, and convergence of the partner Dashboard.

**Deliverables.**
1. **Facility default layouts.**
   - `DashboardFacilityDefault` model (facility, authority band, scope kind, items) in its own forward-only migration.
   - A Facility Administrator "Set as default for…" action in edit mode.
   - Resolution order becomes: personal, then facility default, then role default.
2. **Cards marked DSH-05 in the catalog.**
   - People alerts (new aggregate)
   - Teams at a glance
   - Yesterday in review (behind a new day-level cache for `loadOperationalReviewDay`)
   - Our requests to Maintenance
   - Departments & licensing
3. **Partner Dashboard decision.** Accepted by the product owner October 23, 2026 ([DSH-D20](./DECISIONS.md#dsh-d20--remaining-partner-people-use-the-same-dashboard--accepted-user-october-23-2026)). Remaining partner roles use the same card Dashboard on `/partner`. Vendor heads of vendor-run Departments stay Department leaders (DSH-D18).
4. **EVS.** EVS's declaration is finalized only when an EVS release is separately authorized. Not in this program.
5. **WorkspacePreference drop.** A forward migration to drop `WorkspacePreference` happens **only** with explicit product-owner approval, recorded as a decision.

**Exit gate.**
- Enabling a Department capability makes its cards appear automatically for viewers on default layouts. Demonstrated by enabling Plant runtime on a test facility.
- Facility defaults apply and Reset returns to them.
- DSH-Q05 answered.

**Out of scope.**
- Live or polling updates.
- AI cards.
- Facility-authored cards.
- Changes to the partner access model. Vendor accounts are the Contracted Department Authority program's (CDA-05).
- Restricting access on non-Dashboard pages. DSH-Q03 made it app-wide; the Contracted Department Authority program delivers it (CDA-04).

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Numbers disagree between the Dashboard and pages again | DSH-D12; count-parity tests in DSH-02 |
| Facility-scope fan-out is slow | Fact Pack memoization; batched Runtime Location State; budget gate at DSH-02 |
| Data leaks across Departments | Scope only from the Viewer Context; two-Department isolation tests per fact |
| Supervisors lose a tool when Today's Work goes | DSH-04 capability checklist; Today's Work stays until the checklist passes |
| A GM sees other Departments on other pages before CDA-04 | Drill-downs carry the viewer's Department; CDA-04 enforces Department-only visibility app-wide (DSH-Q03) |
| The post-onboarding hand-off breaks | Explicit browser test in DSH-02 and DSH-04 |
| Docs keep teaching Today's Work and Business Workspace | Amendment schedule per phase; AGENTS.md pointer added in DSH-00 |
| Local duplicate cleanup loses work | Done October 20: archived outside the repository with a manifest; nothing deleted |
| Facility Administrator changes a Department they do not head from another page | Dashboard adds no edit paths (A10). App-wide gating is the [Contracted Department Authority](../contracted-departments/README.md) program. |
| The Dashboard leaks a vendor's detail to the Facility Administrator | Summary models only (A11); model-shape tests; no ended periods |
