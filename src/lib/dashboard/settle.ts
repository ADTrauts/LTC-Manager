/**
 * Time until every Dashboard card has left its loading state.
 * A fresh document load counts from navigation start. A later lens change
 * counts from when that view mounted.
 */
export function dashboardSettleElapsedMs(input: { nowMs: number; mountedAtMs: number }): number {
  const sinceNavigation = Math.max(0, Math.round(input.nowMs));
  const sinceMount = Math.max(0, Math.round(input.nowMs - input.mountedAtMs));
  if (input.mountedAtMs >= 0 && input.mountedAtMs < 10_000) return sinceNavigation;
  return sinceMount;
}
