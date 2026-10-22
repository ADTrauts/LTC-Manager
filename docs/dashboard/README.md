# Vssyl Dashboard program

Accepted October 20, 2026. This program replaces the current `/workspace` "Business Workspace" page and retires the Today's Work hub. The result is one **Dashboard** that changes with the person looking at it. It applies the [Product Constitution](../product/01_PRODUCT_CONSTITUTION.md); it does not replace it.

The program uses `DSH-` identifiers. They do not renumber historical waves or the [onboarding program](../onboarding/README.md) (`ONB-`).

## What we are building

- One page called **Dashboard** at `/dashboard`. "Business Workspace", "Operations Center" and "Today's Work" stop being product names.
- The Dashboard **knows who is looking**:
  - The Facility Administrator sees high-level work for every Department and can narrow to any of them.
    - Self-operated Departments they do not head: they can look but not change anything.
    - Vendor-run Departments: they see summaries only ([DSH-D18](./DECISIONS.md#dsh-d18--how-the-dashboard-shows-each-department-to-the-facility-administrator--accepted-user-october-20-2026)).
  - A GM is the Department head (either title) and sees only their own Department, including a GM who works for the vendor.
  - Managers see their Department.
  - Supervisors see their team's rooms for the current shift.
- It stays **high level**. Each card answers one question and drills into the area that owns the detail: People & Coverage, Locations, Operational Cycle & Work, Maintenance, Records & Audit / Reports, Menus and Administration.
- It is **customizable**. Supervisors and up can move cards on a snap grid, resize them (Small, Medium, Large), add or remove them, and reset to their role's default.
- It works for every built Department through one **capability-based contract**. Departments never ship dashboard screens. See the [Department Dashboard Contract](./DEPARTMENT_DASHBOARD_CONTRACT.md).

## Program records

| Record | Purpose |
|---|---|
| [Current-state audit](./CURRENT_STATE_AUDIT_2026-10-20.md) | What exists today and why it feels broken. Evidence for the decisions. |
| [Decisions](./DECISIONS.md) | Accepted product and architecture decisions (`DSH-D01`…) and open confirmation items (`DSH-Q01`…). |
| [Architecture](./ARCHITECTURE.md) | Viewer Context, card registry, eligibility, attention contract, Fact Pack, layout model, rendering, authorization. |
| [Card catalog](./CARD_CATALOG.md) | Every planned card: question, scope, minimum authority, capability, sizes, data source, drill-down, phase. Also the default layout for each role. |
| [Department Dashboard Contract](./DEPARTMENT_DASHBOARD_CONTRACT.md) | New platform building rules for every Department Product, plus the compatibility matrix for each built Department. |
| [Phased plan](./PHASED_PLAN.md) | DSH-00 through DSH-05: scope, deliverables, files, tests, exit gates, out of scope, authority-doc amendments. |
| [Phase tracker](./PHASE_TRACKER.md) | The single status and authorization record. |

## Authority and precedence

1. The [Product Constitution](../product/01_PRODUCT_CONSTITUTION.md), the [Language Guide](../product/08_PRODUCT_LANGUAGE_GUIDE.md), the [Department Product contract](../product/13_DEPARTMENT_PRODUCT.md) and [Facility Plant Operations](../product/14_FACILITY_PLANT_OPERATIONS.md) remain the architecture authority.
2. [DSH-D17](./DECISIONS.md#dsh-d17--superseded-statements-and-amendment-schedule--accepted-october-20-2026) lists the statements in those docs that this program supersedes. Each amendment lands in the phase named there. Until then the current code behavior stands. New work must not extend Business Workspace or Today's Work.
3. The [phase tracker](./PHASE_TRACKER.md) is the only record of what is authorized. Each phase needs explicit authorization before it starts. Stop at every phase boundary.

## Boundaries

- **Separate from onboarding.** ONB-07 is on release hold. This program does not change onboarding files, the onboarding release package or its pilot checklist. The one shared contract is the post-onboarding hand-off (`/dashboard?onboarding=complete` shows the launch checklist), which must keep working.
- **No commercial side effects.** No change to Department Product release status, sellability, entitlements or billing packaging. EVS stays DEVELOPMENT and contributes nothing to customer Dashboards.
- **No new Plant features or migrations.** Plant cards read existing Plant services only.
- **No parallel Records model.** Records cards read the forward path (`CatalogLogDefinition` → `FacilityCatalogInstall` → `LogAttachment` → derived requirement → `OperationalEvidenceRecord`) or legacy `/logs` compatibility. They never store facts.
- **Forward-only Prisma.** The one planned schema change (`DashboardLayout`, DSH-03) is a new migration. Applied migrations are never edited. No `prisma migrate reset`.
- **Next.js 16.** Before writing code in any phase, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md rule).
- **Preserve unrelated local work.** Do not modify or revert uncommitted changes owned by other programs.

## Glossary for this program

| Term | Meaning |
|---|---|
| **Dashboard** | The single high-level home for Supervisor and above. Customer-facing name. |
| **Viewer Context** | Who is looking, computed once per request: authority band, Departments in scope, team rooms, products and capabilities. |
| **Authority band** | Facility Administrator, Department leader, Manager or Supervisor. Derived from role plus the Department head link. Not a new role. |
| **Department leader** | The GM of a Department or the employee recorded as its head (`Department.headEmployeeId`). Sees only the Departments they lead. |
| **Scope** | Facility, Department or Team. What the cards are summarizing. |
| **Card** | A platform-owned tile that answers one question and links to the area that owns the detail. |
| **Capability** | A fact about a Department that makes a card meaningful, such as "has a published Operational Cycle". It is derived; Departments never declare UI. |
| **Attention item** | One shared shape for "something needs a person", produced by every module that can raise one. |
| **Fact Pack** | Shared data for one request, loaded once and reused by every card. |
| **Layout** | A viewer's ordered list of cards and sizes for one scope. |
| **Vendor-run Department** | A Department whose operating Organization for the service date is not the Facility's parent Organization. For example, Food & Nutrition at Terrace View is run by Metz Culinary for ECMC. Derived from `DepartmentOperatorRelationship`; never declared. The others are **self-operated**. |
| **Access mode** | How far a viewer may go in a Department, from the [Contracted Department Authority](../contracted-departments/README.md) resolver. **Manage**: may change it within role. **View**: same data, no change actions. **Summary**: counts and status only. |
