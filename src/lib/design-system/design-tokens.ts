/**
 * Shared layout and surface tokens — align shell chrome and future UI polish.
 * Values mirror current operational shell (app-shell, left-sidebar, top-nav).
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

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  full: 9999,
} as const;

export const shadows = {
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
  /** Minimum interactive height (header controls, forms). */
  minHeightPx: 40,
  /** Sidebar row height (`min-h-11`). */
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

/** Tailwind-friendly class fragments derived from tokens (optional consumers). */
export const shellClasses = {
  maxWidth: "max-w-[1440px]",
  pagePadding: "px-4 lg:px-6",
  mainPadding: "p-4 lg:p-6",
} as const;

export const designTokens = {
  spacing,
  radius,
  shadows,
  layout,
  touchTarget,
  badge,
  card,
  shellClasses,
} as const;

export type DesignTokens = typeof designTokens;
