# Responsive UI implementation

Implemented October 16, 2026 against the local Vssyl application. This follows the [visual review and correction plan](REVIEW_AND_PLAN.md).

## Changes

- **Shared layout:** tighter compact page headers, clearer section-title hierarchy, larger touch controls, readable form text, and full-width fields. Desktop keeps its persistent navigation and denser toolbars.
- **Menus and navigation:** Facility Builder action menus are measured, constrained to the viewport, and internally scrollable. All menu rows are at least 44 pixels high. Arrow keys, Home/End, Escape, Tab, and focus return work. Mode changes close the compact navigation drawer. Local tabs have labeled previous/more controls. Workspace selection traps dialog focus and constrains the desktop popover height.
- **Dashboard and Today's Work:** smaller customization disclosure, less repeated quiet-status information, tighter spacing, and a compact two-column summary. The daily operating-location list appears approximately 140 pixels earlier in the compact view.
- **Schedule:** compact date navigation, explicit employee/location and week/day choices, expandable date/tools and advanced filters, persistent search, readable controls, and an accessible horizontal-scroll region with sticky employee names. Date and filter query values remain in navigation links. The final desktop arrangement puts the schedule grid at approximately 509 pixels, close to the original 483 pixels despite the larger controls.
- **Audit / Reports:** readable white text on the Apply button, deliberate date/filter grids, and labeled records below 768 pixels using the same report facts. Comparison tables remain at larger widths. Legacy input/button CSS now sits in the components cascade layer so foreground utilities work as intended.
- **Builders:** Employee Builder keeps search visible and secondary filters collapsed on compact screens. Department Builder discloses advanced Record engine settings while retaining current engine identity, warnings, readiness information, and required confirmations inside the panel.

The shared filter disclosure keeps form controls mounted when collapsed, preserving unsaved selections. The typecheck excludes ignored `tmp` snapshots so old source copies do not enter the application build. Facility Builder's icon lookup is static to satisfy the React lint rule.

## Verification

- **159 focused tests passed**, including overlay containment, shell navigation, report date/range contracts, buttons, dashboard contracts, Facility Builder, Record engine rollout, and the operating-location board.
- TypeScript and ESLint checks passed for the changed application files and new components. `git diff --check` passed.
- Production compilation passed using Next.js's supported webpack bundler. The default Turbopack attempt encountered an environment worker-port permission restriction. The project's build command and default bundler were not changed; build output was isolated in the ignored `.next-responsive-review` directory.
- Real browser checks covered 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844, and the short 844 × 390 menu reproduction. Reports additionally passed horizontal-overflow and layout checks at widths 320, 767, 768, 1024, 1279, 1280, and 1440.
- The Facility Builder menu stayed within the short viewport (top 8, bottom 382). Its last action remained reachable by scrolling and End; Escape restored trigger focus; Tab closed the menu and advanced to the next control. No destructive action was invoked.
- Reports applied a location filter while preserving its date range. Schedule search and day navigation preserved date/view/filter parameters. Employee selections survived collapsing and reopening the filter panel. Run/Build navigation closed the drawer in both directions.

Browser checks used the existing local demo data. Physical touch devices, software-keyboard behavior, Safari, actual 200% browser zoom, and populated Menu/Asset editors still need a device/data-specific pass. Reduced viewport and overlay geometry tests cover constrained layouts but do not substitute for those checks.

## Saved visual evidence

The original screenshots remain beside the review. Updated screenshots are in `after/`.

| Screen | Original | Updated |
| --- | --- | --- |
| Workspace, desktop | [Before](workspace-desktop.jpg) | [After](after/workspace-desktop.jpg) |
| Workspace, tablet | [Before](workspace-tablet.jpg) | [After](after/workspace-tablet.jpg) |
| Workspace, compact | [Before](workspace-compact.jpg) | [After](after/workspace-compact.jpg) |
| Schedule, desktop | [Before](schedule-desktop.jpg) | [After](after/schedule-desktop.jpg) |
| Schedule, compact | [Before](schedule-compact.jpg) | [After](after/schedule-compact.jpg) |
| Reports, tablet | [Before](reports-tablet.jpg) | [After](after/reports-tablet.jpg) |
| Reports, compact | [Before](reports-compact.jpg) | [After](after/reports-compact.jpg) |
| Today's Work, compact | [Before](today-compact.jpg) | [After](after/today-compact.jpg) |
| Employee Builder, compact | [Before](employees-compact.jpg) | [After](after/employees-compact.jpg) |
| Facility menu, short landscape | [Before](facility-menu-landscape.jpg) | [After](after/facility-menu-landscape.jpg) |

[Department Builder, compact](after/department-builder-compact.jpg) also shows the collapsed advanced settings and reachable local navigation.

Changes are in the working tree and the local preview. No deployment was performed.
