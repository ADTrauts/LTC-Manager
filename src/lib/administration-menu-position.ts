/**
 * Fixed-position math for the Administration dropdown when portaled to document.body.
 * Keeps the panel below the trigger when possible and inside the viewport.
 */

export const ADMINISTRATION_MENU_MIN_WIDTH_PX = 264; // 16.5rem
export const ADMINISTRATION_MENU_GAP_PX = 4;
export const ADMINISTRATION_MENU_VIEWPORT_PADDING_PX = 8;

export type RectLike = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type FixedMenuPosition = {
  top: number;
  left: number;
  minWidth: number;
};

export function computeFixedMenuPosition(opts: {
  triggerRect: RectLike;
  viewport: ViewportSize;
  /** Measured panel size when available; falls back to min width / estimated height. */
  menuSize?: { width: number; height: number };
  gapPx?: number;
  paddingPx?: number;
  minWidthPx?: number;
}): FixedMenuPosition {
  const gapPx = opts.gapPx ?? ADMINISTRATION_MENU_GAP_PX;
  const paddingPx = opts.paddingPx ?? ADMINISTRATION_MENU_VIEWPORT_PADDING_PX;
  const minWidthPx = opts.minWidthPx ?? ADMINISTRATION_MENU_MIN_WIDTH_PX;
  const menuWidth = Math.max(opts.menuSize?.width ?? minWidthPx, minWidthPx);
  const menuHeight = opts.menuSize?.height ?? 280;

  const { triggerRect, viewport } = opts;
  let top = triggerRect.bottom + gapPx;
  let left = triggerRect.left;

  // Prefer right-aligning to the trigger when the panel would overflow the right edge.
  if (left + menuWidth > viewport.width - paddingPx) {
    left = triggerRect.right - menuWidth;
  }

  // Keep horizontal bounds inside the viewport.
  left = Math.min(left, viewport.width - menuWidth - paddingPx);
  left = Math.max(paddingPx, left);

  // Prefer below the trigger; if that overflows, shift up enough to stay on-screen.
  const maxTop = viewport.height - menuHeight - paddingPx;
  if (top > maxTop) {
    top = Math.max(paddingPx, maxTop);
  }

  return {
    top: Math.round(top),
    left: Math.round(left),
    minWidth: minWidthPx,
  };
}
