/**
 * Presentation decision for the header department control.
 *
 * The department control is a context lens, never authorization. Its shape is progressive and is
 * based purely on how many department contexts are actually available to the authenticated user:
 *
 * - `hidden`   — no department context to show (render nothing).
 * - `compact`  — a single available department: show a compact identity chip, not a dropdown that
 *                cannot meaningfully switch anything.
 * - `selector` — more than one available department: show the switcher.
 *
 * This is deliberately not derived from role name; it is derived from the available department set
 * so a single-department leader is not forced to interact with a large switcher, while a
 * multi-department manager or facility-wide administrator still gets one.
 */
export type DepartmentContextPresentation = "hidden" | "compact" | "selector";

export function departmentContextPresentation(
  availableDepartmentCount: number,
): DepartmentContextPresentation {
  if (availableDepartmentCount <= 0) return "hidden";
  if (availableDepartmentCount === 1) return "compact";
  return "selector";
}
