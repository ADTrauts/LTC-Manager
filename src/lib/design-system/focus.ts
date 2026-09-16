/**
 * Canonical focus-visible recipe for interactive controls.
 * One dialect across shell, forms, and buttons — zinc, high contrast, keyboard-only.
 */
export const FOCUS_RING_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

/** For controls that already use outline-none (inputs) — ring instead of outline. */
export const FOCUS_RING_INPUT_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1";
