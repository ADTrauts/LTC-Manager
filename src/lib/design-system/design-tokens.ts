/**
 * Shared layout and surface tokens — single source of truth for spacing, shape, elevation,
 * and shell geometry. CSS variables in `globals.css` mirror the color/mode tokens; these
 * numeric tokens drive TypeScript consumers and document the intended rhythm.
 *
 * Spacing rhythm: 4 / 8 / 12 / 16 / 24 / 32
 * Desktop density: compact-medium. Tablet: large hit areas without sparse emptiness.
 *
 * Builder layout principles:
 * - Expose the primary configured object within roughly the first third of the viewport
 *   whenever practical. Orientation should guide, not dominate.
 * - Do not repeat context already established by the Builder header unless repetition
 *   changes meaning or supports an action (e.g. summary count vs. section action).
 * - Essential Builder actions must not depend on hover in touch/compact contexts.
 *   See `builder-essential-touch-visible` in `globals.css`.
 * - Build Context Bar reflects the current definition of the object being configured
 *   and quietly shows how it is growing over time (informational, not a checklist).
 */

export const spacing = {
  /** 4px */
  xs: 4,
  /** 8px */
  sm: 8,
  /** 12px */
  md: 12,
  /** 16px */
  lg: 16,
  /** 24px */
  xl: 24,
  /** 32px */
  "2xl": 32,
  /** 40px */
  "3xl": 40,
} as const;

/**
 * Shape tokens.
 * - control: inputs, buttons, chips (md ≈ 6px / rounded-md)
 * - panel: contained surfaces / AppCard (lg ≈ 8–12px; prefer rounded-lg over xl)
 * - floating: drawers, menus, modals
 */
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

/** Elevation: none for lists/sections; subtle for contained; floating for overlays. */
export const shadows = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
} as const;

export const layout = {
  /** Main shell content column (matches `max-w-[1440px]`). */
  shellMaxWidthPx: 1440,
  /** Approximate compact single-row header height for layout math. */
  headerHeightPx: 52,
  /** Left locations rail (`lg:w-72`). */
  sidebarWidthPx: 288,
} as const;

export const touchTarget = {
  /** Minimum interactive height for common controls (40px). */
  minHeightPx: 40,
  /** Sidebar / primary touch rows (44px / min-h-11). */
  sidebarRowHeightPx: 44,
} as const;

export const badge = {
  heightPx: 20,
  paddingX: 8,
  fontSizePx: 12,
} as const;

export const card = {
  paddingPx: 16,
  paddingLgPx: 24,
} as const;

/** Stacking for shell overlays (dropdowns, portals). */
export const zIndex = {
  /** Fade edges inside the nav scroller. */
  navFade: 10,
  /** Portaled Administration menu and similar header overlays. */
  dropdown: 60,
} as const;

/** Tailwind-friendly class fragments derived from tokens. */
export const shellClasses = {
  maxWidth: "max-w-[1440px]",
  pagePadding: "px-4 lg:px-6",
  mainPadding: "p-4 lg:p-6",
} as const;

/**
 * Typography class fragments — page / section / row / body / meta / overline / metric.
 * Prefer these over ad-hoc text-[10px] sizes.
 */
export const typeClasses = {
  pageTitle: "text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl",
  sectionTitle: "text-base font-semibold text-zinc-900 sm:text-lg",
  rowTitle: "text-sm font-medium text-zinc-900",
  body: "text-sm text-zinc-900",
  meta: "text-xs text-zinc-600",
  overline: "text-[11px] font-semibold uppercase tracking-wider text-zinc-500",
  metric: "text-2xl font-semibold tabular-nums text-zinc-900",
} as const;

export const designTokens = {
  spacing,
  radius,
  shadows,
  layout,
  touchTarget,
  badge,
  card,
  zIndex,
  shellClasses,
  typeClasses,
} as const;

export type DesignTokens = typeof designTokens;
