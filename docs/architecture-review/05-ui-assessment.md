# 5. UI Assessment

## Page inventory

### Public (4 pages)

| Route | Purpose |
|-------|---------|
| `/` | Marketing hero; redirects authenticated users to dashboard |
| `/login` | `LoginGate` — email form or PIN pad when device is facility-bound |
| `/signup` | First-admin self-serve registration |
| `/setup` | Multi-step onboarding wizard |

### Protected (23+ distinct views)

| Route | Title / purpose |
|-------|-----------------|
| `/dashboard` | Global operations board |
| `/units` | Units builder |
| `/employees` | Employee directory |
| `/employees/points-summary` | Discipline points rollup |
| `/employees/separations` | Separation records |
| `/employees/terminations` | Redirect → separations |
| `/employees/hr-audit` | HR change log |
| `/employees/chrc-report` | CHRC clearance report |
| `/employees/import` | CSV roster import |
| `/logs` | Logs engine (4 tabs) |
| `/staffing` | Daily schedule grid |
| `/menus` | Menu cycle builder |
| `/evs` | EVS room/zone board |
| `/assets` | Assets + vendors (sub-tabs) |
| `/repairs` | Work orders |
| `/reports` | Operational reports |
| `/unit/[unitId]` | Per-unit dashboard |
| `/account` | Password change |
| `/department/settings/[departmentId]` | Department head settings |
| `/admin` | Admin hub |
| `/admin/departments` | Department visibility and heads |
| `/admin/permissions` | Route permission matrix |
| `/admin/organization` | Facility profile, branding, device binding |

## Navigation system

### Top navigation (`TopNav`)

- Items loaded from **`AppRoute`** table via `route-permissions.ts`.
- Filtered by role permissions and active department scope.
- Horizontal scroll on overflow (`overflow-x-auto`, single line).
- **Employees** is one top-nav item; sub-routes use layout sub-nav instead of separate top items.

### Left sidebar (`LeftSidebar`)

- Label: **Locations** (unit list).
- **Dashboard** link at top.
- Dynamic list of active units ordered by `displayOrder`.
- PIN sessions may see filtered units (`EmployeeUnitAccess`).
- Kiosk mode greys out non-locked units when device unit cookie matches session.

### Department scope switcher

- Visible for users with multiple operational departments.
- Sets `ltc_active_department` cookie via API.
- Scopes which top-nav modules appear (Dietary vs EVS vs Plant).

### Employees sub-navigation (two layers)

1. **Department tabs** (`EmployeesDepartmentTabs`) — All departments + per-department filter via `?dept=`.
2. **Section tabs** (`EmployeesSubNav`) — Employees, Points, CHRC, Separations, HR audit, Import.

## Dashboards

### Global dashboard (`/dashboard`)

- Unit compliance cards (log completion signals).
- Servery meal service status.
- Open repairs summary.
- Staffing coverage signals.
- Birthdays this month with deep links to employee cards.
- Tabs for units vs employees views.
- Post-onboarding checklist for new facilities.

### Unit dashboard (`/unit/[unitId]`)

- Overview tab: servery meal controls, today's menu, assignment summary.
- Logs tab: quick entry links into log submission.
- Contextual to selected unit (also set as `activeUnitId` in session).

### EVS board (`/evs`)

- Card per EVS-linked unit with today's `RoomAreaStatus`.
- Inline repair ticket form.

Not a chart-heavy analytics dashboard — **status-forward operational cards** dominate.

## Layout system

### `AppShell` (`src/components/app-shell.tsx`)

- CSS Grid layout:
  - Mobile: stacked brand, nav, content.
  - `lg+`: brand column | flexible center (top nav) | sign-out actions.
- Left rail + main pane scroll independently on large screens.
- Facility name + session info in header (truncated).
- Brand accent via CSS variable `--brand-accent` from `Facility.brandColor`.
- Kiosk warning banner when applicable.

### Layout nesting

```
app/layout.tsx                    # Root: fonts, metadata, globals.css
└── (protected)/layout.tsx        # AppShell, force-dynamic
    ├── admin/layout.tsx          # FA guard
    └── employees/layout.tsx      # Department + section tabs
```

### Drawers and cards

- `drawer.tsx` — slide-over panels for create employee, record separation.
- `.app-card` — consistent bordered white cards with light shadow.
- Employee cards collapse by default; expand to tabbed detail.

## Design consistency

### Strengths

- **Centralized design tokens** in `globals.css`: zinc palette, status colors (complete/progress/alert), form control minimum heights.
- **Utility classes** (`.app-input`, `.app-btn`, `.app-btn-primary`) used across forms.
- **Consistent page structure**: `<section>` + `<header>` with `h1` + descriptive `p`, then card sections.
- **Sub-tab styling** documented in AGENTS.md: square/rounded-md chips (not pills) — used on Assets and Menu Building.
- **Tablet-first** intent: large touch targets, PIN pad, fast-entry forms.

### Variations

- Some pages are server-rendered tables; others use client tabs (`logs-tabs-client.tsx`).
- Reports page is dense data tables without chart visualization.
- No shared DataTable or form library — each feature builds its own markup.
- `module-placeholder.tsx` exists but is **unused** (legacy Phase 0 scaffold).

### Typography and color

- Geist Sans / Geist Mono via Next font.
- Light mode only (`color-scheme: light`).
- Zinc-900 headings, zinc-600 body secondary text.
- Facility brand color as subtle accent (borders, soft backgrounds) — not a full theme system.

## Responsive behavior

- Sidebar becomes part of vertical stack on small screens.
- Top nav scrolls horizontally.
- Grid-based staffing and reports tables may require horizontal scroll on narrow viewports.
- Shell height constraints enable pane-level scrolling on desktop.

## Accessibility

- Semantic headings and form labels present in reviewed pages.
- PIN pad and login gate use button elements.
- No dedicated a11y test suite observed.
- Color status indicators supplemented with text labels in most cards.

## UI maturity summary

| Area | Assessment |
|------|------------|
| Shell / nav | **Production-ready** — cohesive, DB-driven |
| Forms | **Production-ready** — consistent utility classes |
| Dashboards | **Production-ready** — operational, not analytics-heavy |
| Reports UI | **Partial** — functional tables, no charts/exports |
| Component reuse | **Partial** — feature-specific markup; few shared primitives beyond drawer/cards |
| Design system | **Partial** — CSS tokens + Tailwind; no Storybook or component catalog |
